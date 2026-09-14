// Transcripción de notas de voz de WhatsApp.
//
// Zernio NO transcribe: entrega el adjunto de tipo `audio`. Para WhatsApp
// ENTRANTE, el `url` de ese adjunto apunta al endpoint AUTENTICADO
//   GET /v1/whatsapp/media/{mediaId}?accountId=...
// que exige `Authorization: Bearer <ZERNIO_API_KEY>` — NO es un enlace público
// (spec Zernio: "inbound WhatsApp media points at the authenticated
// GET /v1/whatsapp/media/{mediaId} and requires Authorization: Bearer"). Si esa
// URL se le pasa a un tercero (fal, Groq, un visor) la descarga responde 401/403.
// Además fal RECHAZA data URLs (`{"detail":"Unsupported data URL"}`), así que
// tampoco sirve mandar base64. El camino que funciona:
//
//   1. descargar los BYTES con la credencial de Zernio (mediaId = payload.id),
//   2. subirlos al storage de fal → URL pública,
//   3. transcribir ESA url.
//
// Este módulo es la ÚNICA puerta de transcripción: el turno (lib/turno.ts) solo
// llama a `transcribirAudioUrl` y aquí se elige el proveedor por variable de
// entorno (independiente de cómo se invoque).
//
//    STT_PROVIDER = "fal" (por defecto) | "groq"
//    fal.ai  -> FAL_KEY. REST con fetch (sin SDK): storage de fal + cola.
//    groq    -> GROQ_API_KEY. Multipart con los bytes ya descargados.
//
// Sin credencial configurada, sin bytes o al exceder el tope de tiempo,
// `transcribirAudioUrl` devuelve null y el turno deriva a asesor (nunca deja el
// audio "no entendido" en silencio y nunca lo clasifica como imagen).

/** Adjunto de audio entrante, tal como lo entrega Zernio (parseado por lib/zernio.ts). */
export type AdjuntoAudio = {
  /** `attachments[].url`: para WhatsApp entrante es el endpoint autenticado de Zernio. */
  url?: string | null;
  /** `attachments[].payload.id`: mediaId para GET /v1/whatsapp/media/{mediaId}. */
  mediaId?: string | null;
  /** accountId de la cuenta WhatsApp que recibió el audio (query obligatoria). */
  accountId?: string | null;
  /** `attachments[].originalType` (solo Instagram/Facebook), por si llega. */
  originalType?: string | null;
  /** content-type declarado por el webhook, si lo hubiera. */
  mimeType?: string | null;
};

/** Compatibilidad: se acepta la URL suelta del adjunto o el adjunto completo. */
export type AudioSource = string | AdjuntoAudio;

const ZERNIO_API_BASE = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api";
const FAL_REST_BASE = process.env.FAL_REST_BASE ?? "https://rest.alpha.fal.ai";
const FAL_QUEUE_BASE = process.env.FAL_QUEUE_BASE ?? "https://queue.fal.run";

/** Intervalo de sondeo del resultado de fal. */
const FAL_POLL_INTERVAL_MS = 500;

/** Tope por defecto del bloque COMPLETO descarga+upload+STT (ver `presupuestoMs`). */
export const TOTAL_BUDGET_DEFAULT_MS = 25_000;

/**
 * Tope propio del conjunto descarga + upload + STT (descarga autenticada en
 * Zernio, subida al storage de fal y transcripción). Medido: 8.5 s en caliente
 * para 61 s de audio, pero ~85 s en la PRIMERA llamada (arranque en frío). El
 * webhook declara `maxDuration = 60` y comparte ese presupuesto con el LLM y el
 * envío saliente, así que aquí se corta antes y se devuelve null → el turno
 * deriva a asesor con un mensaje honesto en vez de morir a mitad de la función.
 */
export function presupuestoMs(): number {
  const raw = Number(process.env.STT_AUDIO_BUDGET_MS ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : TOTAL_BUDGET_DEFAULT_MS;
}

function falModel(): string {
  return process.env.FAL_STT_MODEL ?? "fal-ai/whisper";
}

type Bytes = { buffer: ArrayBuffer; mimeType: string };

/**
 * Transcribe una nota de voz entrante.
 * Devuelve el texto en español o null si no se pudo (sin credencial, media
 * inaccesible/expirada, upload caído, proveedor caído o tope de tiempo).
 * Elige proveedor por STT_PROVIDER (default "fal").
 */
export async function transcribirAudioUrl(
  audio: AudioSource | null | undefined
): Promise<string | null> {
  const src = normalizarFuente(audio);
  if (!src) return null;

  const fin = Date.now() + presupuestoMs();
  /** Tiempo que queda del presupuesto (mínimo sano para no abortar en el borde). */
  const restante = () => Math.max(250, fin - Date.now());

  const bytes = await obtenerBytes(src, restante);
  if (!bytes) return null;

  const provider = (process.env.STT_PROVIDER ?? "fal").toLowerCase();
  if (provider === "groq") return transcribeGroq(bytes, restante);
  return transcribeFal(bytes, restante);
}

function normalizarFuente(audio: AudioSource | null | undefined): AdjuntoAudio | null {
  if (!audio) return null;
  if (typeof audio === "string") return audio.trim() ? { url: audio.trim() } : null;
  const url = audio.url?.trim() || null;
  const mediaId = audio.mediaId?.trim() || null;
  if (!url && !mediaId) return null;
  return {
    url,
    mediaId,
    accountId: audio.accountId?.trim() || null,
    originalType: audio.originalType ?? null,
    mimeType: audio.mimeType ?? null,
  };
}

/** ¿La URL apunta al endpoint autenticado de Zernio (no a un CDN público)? */
export function esRutaMediaZernio(url: string | null | undefined): boolean {
  return typeof url === "string" && /\/whatsapp\/media\//i.test(url);
}

/** URL autenticada de descarga del media de WhatsApp. */
export function urlMediaZernio(mediaId: string, accountId: string): string {
  return `${ZERNIO_API_BASE}/v1/whatsapp/media/${encodeURIComponent(
    mediaId
  )}?accountId=${encodeURIComponent(accountId)}`;
}

/**
 * Obtiene los BYTES del audio. Nunca asume que la URL del adjunto es pública:
 * primero intenta el endpoint autenticado de Zernio con el `mediaId`, y solo si
 * eso no aplica (o falla) cae a una descarga directa de la URL cuando ésta no
 * apunta al endpoint autenticado.
 */
async function obtenerBytes(
  src: AdjuntoAudio,
  restante: () => number
): Promise<Bytes | null> {
  const key = process.env.ZERNIO_API_KEY ?? "";
  const candidatas: { url: string; headers: Record<string, string> }[] = [];

  if (src.mediaId && src.accountId) {
    candidatas.push({
      url: urlMediaZernio(src.mediaId, src.accountId),
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    });
  }
  if (src.url) {
    const autenticada = esRutaMediaZernio(src.url);
    // La URL de un adjunto entrante de WhatsApp ES el endpoint autenticado:
    // sin credencial no tiene sentido intentarla.
    if (!autenticada || key) {
      candidatas.push({
        url: src.url,
        headers: autenticada && key ? { Authorization: `Bearer ${key}` } : {},
      });
    }
  }
  if (candidatas.length === 0) {
    console.error(
      "[transcribe] adjunto de audio sin mediaId/url utilizables (ni ZERNIO_API_KEY para el endpoint autenticado)"
    );
    return null;
  }

  for (const c of candidatas) {
    const bytes = await descargar(c.url, c.headers, restante());
    if (bytes) return bytes;
  }
  return null;
}

async function descargar(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<Bytes | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      console.error("[transcribe] descarga del audio falló:", res.status, urlMediaEtiqueta(url));
      return null;
    }
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) {
      console.error("[transcribe] la descarga devolvió 0 bytes:", urlMediaEtiqueta(url));
      return null;
    }
    const mimeType = res.headers.get("content-type") ?? "audio/ogg";
    return { buffer, mimeType };
  } catch (err) {
    console.error("[transcribe] error descargando el audio:", urlMediaEtiqueta(url), err);
    return null;
  }
}

/** Nunca loguear la URL completa con query (lleva accountId); solo el final del path. */
function urlMediaEtiqueta(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(url inválida)";
  }
}

// ---------- fal.ai (storage + REST, sin SDK) ----------

async function transcribeFal(bytes: Bytes, restante: () => number): Promise<string | null> {
  const key = process.env.FAL_KEY;
  if (!key) {
    console.error("[transcribe] falta FAL_KEY; no se puede transcribir (se deriva a asesor)");
    return null;
  }

  const fileUrl = await subirAFal(bytes, key, restante);
  if (!fileUrl) return null;

  const model = falModel();
  const body = {
    audio_url: fileUrl,
    task: "transcribe",
    language: process.env.STT_LANGUAGE ?? "es",
    chunk_level: "segment", // chunk_level por defecto en fal-ai/whisper
  };

  try {
    const submit = await fetch(`${FAL_QUEUE_BASE}/${model}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(restante()),
    });
    if (!submit.ok) {
      console.error("[transcribe] fal submit falló:", submit.status, await submit.text().catch(() => ""));
      return null;
    }
    const s = (await submit.json()) as {
      response_url?: string;
      status_url?: string;
      request_id?: string;
    };

    // Endpoint sync (algunos modelos responden el resultado directamente).
    const directo = readFalText(s as Record<string, unknown>);
    if (directo) return directo;

    // Endpoints de cola: preferimos el status para saber CUÁNDO terminó.
    const requestId = s.request_id;
    const statusUrl = s.status_url ?? (requestId ? `${FAL_QUEUE_BASE}/${model}/requests/${requestId}/status` : null);
    const resultUrl = s.response_url ?? (requestId ? `${FAL_QUEUE_BASE}/${model}/requests/${requestId}` : null);
    if (!statusUrl && !resultUrl) return null;

    const fin = Date.now() + restante();
    while (Date.now() < fin) {
      if (statusUrl && resultUrl) {
        const st = await fetchJson(statusUrl, key, Math.min(5_000, restante()));
        const status = String(st?.status ?? "");
        if (status === "FAILED" || status === "CANCELLED") {
          console.error("[transcribe] fal result status:", status);
          return null;
        }
        if (status === "COMPLETED") {
          const data = await fetchJson(resultUrl, key, restante());
          return readFalText((data?.payload ?? data) as Record<string, unknown> | null);
        }
      } else if (resultUrl) {
        // Sin status_url: sondeo directo del resultado.
        const data = await fetchJson(resultUrl, key, Math.min(5_000, restante()));
        if (data) {
          const status = String(data.status ?? "");
          if (status === "FAILED" || status === "CANCELLED") return null;
          const text = readFalText((data.payload ?? data) as Record<string, unknown>);
          if (status === "COMPLETED" || text) return text;
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

async function fetchJson(
  url: string,
  key: string,
  timeoutMs: number
): Promise<Record<string, unknown> | null> {
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Key ${key}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    return (await r.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Sube los BYTES al storage de fal y devuelve la URL pública resultante.
 * fal no acepta data URLs, así que este paso es obligatorio.
 */
async function subirAFal(
  bytes: Bytes,
  key: string,
  restante: () => number
): Promise<string | null> {
  const contentType = normalizarMime(bytes.mimeType);
  const ext = mimeToExt(contentType);
  const fileName = `creditos-nota-${Date.now()}.${ext}`;
  try {
    const init = await fetch(
      `${FAL_REST_BASE}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content_type: contentType, file_name: fileName }),
        signal: AbortSignal.timeout(restante()),
      }
    );
    if (!init.ok) {
      console.error("[transcribe] fal storage initiate falló:", init.status, await init.text().catch(() => ""));
      return null;
    }
    const slot = (await init.json()) as { file_url?: string; upload_url?: string };
    if (!slot.upload_url || !slot.file_url) {
      console.error("[transcribe] fal storage initiate no devolvió file_url/upload_url");
      return null;
    }

    const put = await fetch(slot.upload_url, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: bytes.buffer,
      signal: AbortSignal.timeout(restante()),
    });
    if (!put.ok) {
      console.error("[transcribe] fal storage upload (PUT) falló:", put.status);
      return null;
    }
    return slot.file_url;
  } catch (err) {
    console.error("[transcribe] error subiendo el audio al storage de fal:", err);
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

// ---------- groq (multipart, sin storage intermedio) ----------

async function transcribeGroq(bytes: Bytes, restante: () => number): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("[transcribe] falta GROQ_API_KEY; no se puede transcribir (se deriva a asesor)");
    return null;
  }
  try {
    const mimeType = normalizarMime(bytes.mimeType);
    const ext = mimeToExt(mimeType);
    const form = new FormData();
    form.append("file", new Blob([bytes.buffer], { type: mimeType }), `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", process.env.STT_LANGUAGE ?? "es");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(restante()),
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

function normalizarMime(mimeType: string | null | undefined): string {
  const m = (mimeType ?? "").split(";")[0].trim().toLowerCase();
  if (!m || m === "application/octet-stream" || !m.startsWith("audio/")) return "audio/ogg";
  return m;
}

function mimeToExt(mimeType: string): string {
  if (mimeType.includes("mp4") || mimeType.includes("m4a")) return "m4a";
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("webm")) return "webm";
  return "ogg";
}

/**
 * Extrae el mediaId del adjunto de audio de un mensaje recibido.
 * `attachments[].payload.id` es el mediaId para GET /v1/whatsapp/media/.
 */
export function getAudioMediaId(
  attachments: { type: string; url?: string; payload?: { id?: string } }[]
): string | null {
  for (const a of attachments) {
    if (a.type === "audio" || a.type === "voice") {
      const id = a.payload?.id;
      if (id) return id;
      const m = a.url?.match(/[^/?#]+(?=[?#]|$)/)?.[0];
      if (m) return m;
    }
  }
  return null;
}
