// Transcripción de notas de voz de WhatsApp.
//
// Zernio NO transcribe: entrega la URL pública del adjunto `audio` (media_url).
// Para que el bot "lea" una nota de voz, se pasa esa URL a un proveedor de
// Speech-to-Text. Este módulo es la ÚNICA puerta de transcripción: el turno
// (lib/turno.ts) solo llama a `transcribirAudioUrl`, y aquí se elige el
// proveedor por variable de entorno (independiente de cómo se invoque).
//
//    STT_PROVIDER = "fal" (por defecto) | "groq"
//    fal.ai  -> FAL_KEY, entrada = audio_url pública (media_url). API REST via fetch (sin SDK).
//    groq    -> GROQ_API_KEY, requiere descargar el binario (media) y subirlo (multipart).
//
// Sin credencial configurada, transcribirAudioUrl devuelve null y el turno
// deriva a asesor (nunca deja el audio "no entendido" en silencio).

const ZERNIO_API_BASE = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api";

/** Presupuesto de tiempo por etapa (margen para queue). Todos < maxDuration=60. */
const FAL_POLL_TIMEOUT_MS = 25_000;
const FAL_POLL_INTERVAL_MS = 500;
const GROQ_TIMEOUT_MS = 25_000;

function falModel(): string {
  return process.env.FAL_STT_MODEL ?? "fal-ai/whisper";
}

/**
 * Transcribe una URL pública de audio (media_url de WhatsApp).
 * Devuelve el texto en español o null si no hay credencial, no hay URL, o falla.
 * Elige proveedor por STT_PROVIDER (default "fal").
 */
export async function transcribirAudioUrl(audioUrl: string | null | undefined): Promise<string | null> {
  if (!audioUrl) return null;
  const provider = (process.env.STT_PROVIDER ?? "fal").toLowerCase();
  if (provider === "groq") return transcribeGroq(audioUrl);
  return transcribeFal(audioUrl);
}

// ---------- fal.ai (REST, submit + poll) ----------

async function transcribeFal(audioUrl: string): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key) return null;

  const model = falModel();
  const body = {
    audio_url: audioUrl,
    task: "transcribe",
    language: process.env.STT_LANGUAGE ?? "es",
    chunk_level: "segment", // chunk_level por defecto en fal-ai/whisper
  };

  try {
    // Submit a la cola.
    const submit = await fetch(`https://queue.fal.run/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FAL_POLL_TIMEOUT_MS),
    });
    if (!submit.ok) {
      console.error("[transcribe] fal submit falló:", submit.status, await submit.text().catch(() => ""));
      return null;
    }
    const s = (await submit.json()) as { response_url?: string; status_url?: string; request_id?: string };
    const resultUrl = s.response_url ?? s.status_url;
    if (!resultUrl) {
      // Algunos modelos responden el resultado directamente (endpoint sync).
      const text = readFalText(s);
      return text;
    }

    // Poll del resultado.
    const start = Date.now();
    while (Date.now() - start < FAL_POLL_TIMEOUT_MS) {
      const r = await fetch(resultUrl, {
        headers: { Authorization: `Key ${key}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (r.ok) {
        const data = await r.json();
        const status = String(data?.status ?? "");
        if (status === "COMPLETED") {
          return readFalText(data?.payload ?? data);
        }
        if (status === "FAILED" || status === "CANCELLED") {
          console.error("[transcribe] fal result status:", status);
          return null;
        }
      }
      await new Promise((res) => setTimeout(res, FAL_POLL_INTERVAL_MS));
    }
    console.error("[transcribe] fal agotó el presupuesto de polling");
    return null;
  } catch (err) {
    console.error("[transcribe] error transcribiendo con fal:", err);
    return null;
  }
}

function readFalText(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload) return null;
  // Whisper fal devuelve { text } o { text: string } en .payload/.output; hay
  // variantes que devuelven { chunks: [{text}] }. Cubrimos ambas.
  const direct = payload.text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const chunks: unknown = payload.chunks ?? payload.segments;
  if (Array.isArray(chunks)) {
    const joined = chunks
      .map((c) => (c && typeof c === "object" ? (c as { text?: unknown }).text : null))
      .filter((x): x is string => typeof x === "string" && !!x)
      .join(" ")
      .trim();
    if (joined) return joined;
  }
  return null;
}

// ---------- groq (descarga del media + multipart) ----------

async function transcribeGroq(audioUrl: string): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    // Groq espera el binario; Zernio entrega una URL, la descargamos primero.
    const media = await downloadUrl(audioUrl, 15_000);
    if (!media) return null;

    const ext = mimeToExt(media.mimeType);
    const form = new FormData();
    form.append("file", new Blob([media.buffer], { type: media.mimeType }), `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", process.env.STT_LANGUAGE ?? "es");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[transcribe] Groq falló:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { text?: string };
    return data?.text?.trim() || null;
  } catch (err) {
    console.error("[transcribe] error groq:", err);
    return null;
  }
}

/**
 * Descarga el binario de un adjunto de WhatsApp vía Zernio (solo para groq y
 * cualquier proveedor que exija bytes en multipart). fal usa la URL directa.
 */
export async function downloadWhatsAppMedia(
  mediaId: string,
  accountId: string
): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `${ZERNIO_API_BASE}/v1/whatsapp/media/${encodeURIComponent(
      mediaId
    )}?accountId=${encodeURIComponent(accountId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error("[transcribe] descarga media falló:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const buffer = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type") ?? "audio/ogg";
    return { buffer, mimeType };
  } catch (err) {
    console.error("[transcribe] error descargando media:", err);
    return null;
  }
}

async function downloadUrl(audioUrl: string, timeoutMs: number): Promise<{ buffer: ArrayBuffer; mimeType: string } | null> {
  try {
    const res = await fetch(audioUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    const mimeType = res.headers.get("content-type") ?? "audio/ogg";
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

function mimeToExt(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  return "ogg";
}

/**
 * Extrae el mediaId del adjunto de un mensaje recibido.
 * attachments[].payload.id es el mediaId para GET /v1/whatsapp/media/.
 */
export function getAudioMediaId(
  attachments: { type: string; url?: string; payload?: { id?: string } }[]
): string | null {
  for (const a of attachments) {
    if (a.type === "audio") {
      const id = a.payload?.id;
      if (id) return id;
      const m = a.url?.match(/[^/]+$/)?.[0];
      if (m) return m;
    }
  }
  return null;
}