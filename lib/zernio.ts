import crypto from "crypto";

const ZERNIO_API_BASE = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api/v1";

/**
 * Verifica la firma HMAC-SHA256 del webhook de Zernio contra el body crudo.
 * https://docs.zernio.com/webhooks
 */
export function verifyZernioSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const computed = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type ZernioInboundEvent = {
  id: string;
  event: string;
  timestamp: string;
  data: {
    conversation_id?: string;
    from?: string; // teléfono del cliente
    contact_name?: string;
    text?: string;
    profile_id?: string;
  };
};

/**
 * Envía un mensaje de texto de WhatsApp a través de Zernio.
 *
 * NOTA: la documentación pública de Zernio no expone la ruta exacta del
 * endpoint de envío en el momento de escribir este código (solo confirma
 * base URL `https://zernio.com/api/v1`, auth Bearer, y resource group
 * "messages"). Verificar y ajustar el path (`/messages/send` aquí como
 * mejor estimación) contra el API Reference / OpenAPI del dashboard de
 * Zernio una vez tramitada la cuenta, antes de usar en producción.
 */
export async function sendWhatsAppMessage(to: string, text: string) {
  const apiKey = process.env.ZERNIO_API_KEY;
  const profileId = process.env.ZERNIO_WHATSAPP_PROFILE_ID;
  if (!apiKey || !profileId) {
    throw new Error("Faltan ZERNIO_API_KEY o ZERNIO_WHATSAPP_PROFILE_ID en el entorno");
  }

  const res = await fetch(`${ZERNIO_API_BASE}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      profile_id: profileId,
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Zernio send message failed: ${res.status} ${detail}`);
  }

  return res.json();
}
