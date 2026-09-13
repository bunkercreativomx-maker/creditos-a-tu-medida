// Transcripción de notas de voz de WhatsApp vía Groq Whisper.
// Zernio NO transcribe: solo entrega el binario del adjunto `audio`. Para que
// el bot "lea" una nota de voz hay que descargarla (GET /v1/whatsapp/media/)
// y pasarla por Whisper (Groq, OpenAI-compatible).
//
// Si no hay GROQ_API_KEY configurada, transcribeAudio devuelve null y el
// webhook mantiene el comportamiento anterior (escalar a asesor).

const ZERNIO_API_BASE = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api";

/**
 * Descarga el binario de un adjunto de WhatsApp vía Zernio.
 * Docs: GET /v1/whatsapp/media/{mediaId}?accountId=...
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

/**
 * Transcribe un buffer de audio a texto usando Groq Whisper
 * (POST https://api.groq.com/openai/v1/audio/transcriptions).
 * Devuelve el texto o null si falla / no hay key.
 */
export async function transcribeAudio(
  buffer: ArrayBuffer,
  mimeType: string
): Promise<string | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    // Extensión según mime para que Whisper sepa el formato.
    const ext =
      mimeType.includes("mp4") || mimeType.includes("m4a")
        ? "m4a"
        : mimeType.includes("mpeg") || mimeType.includes("mp3")
          ? "mp3"
          : mimeType.includes("wav")
            ? "wav"
            : "ogg";
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), `audio.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "es");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.error("[transcribe] Groq falló:", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { text?: string };
    const text = data?.text?.trim();
    return text || null;
  } catch (err) {
    console.error("[transcribe] error transcribiendo:", err);
    return null;
  }
}

/**
 * Extrae el mediaId del adjunto de un mensaje recibido.
 * attachments[].payload.id es el mediaId para GET /v1/whatsapp/media/.
 */
export function getAudioMediaId(attachments: { type: string; url?: string; payload?: { id?: string } }[]): string | null {
  for (const a of attachments) {
    if (a.type === "audio") {
      const id = a.payload?.id;
      if (id) return id;
      // Fallback: intenta extraer el id de la URL si lo trae.
      const m = a.url?.match(/[^/]+$/)?.[0];
      if (m) return m;
    }
  }
  return null;
}
