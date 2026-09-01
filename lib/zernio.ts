import crypto from "crypto";

const ZERNIO_API_BASE = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api";

/**
 * Verifica la firma HMAC-SHA256 del webhook de Zernio contra el body crudo.
 * Docs: https://docs.zernio.com/webhooks#signature-verification
 * Header: X-Zernio-Signature = hex lowercase HMAC-SHA256(body, secret).
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

/**
 * Payload real del webhook message.received de Zernio.
 * Docs: https://docs.zernio.com/webhooks/inbox#messagereceived
 * La estructura es: { id, event, message, conversation, account, metadata?, timestamp }.
 * Los tipos concretos (InboxWebhookMessage/Conversation/Account) no están
 * expandidos en el schema público, así que este parser lee de forma defensiva
 * varios campos candidatos (ver parseInboundMessage).
 */
export type ZernioInboundEvent = {
  id: string;
  event: string;
  timestamp?: string;
  message?: Record<string, unknown>;
  conversation?: Record<string, unknown>;
  account?: Record<string, unknown>;
  // Legacy (docs antiguas): event.data.*
  data?: {
    from?: string;
    text?: string;
    contact_name?: string;
    conversation_id?: string;
    profile_id?: string;
    sender?: { id?: string; name?: string };
  };
};

export type ParsedInbound = {
  text: string | null;
  telefono: string | null; // número del cliente (E.164 para WhatsApp)
  nombre: string | null;
  conversationId: string | null; // Zernio conversation id (para responder)
  accountId: string | null; // Zernio account id (para responder)
};

const pick = (o: Record<string, unknown> | undefined, keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/**
 * Extrae de forma defensiva los campos que nos interesan de un event de
 * message.received, cubriendo la forma actual (message/conversation/account)
 * y la legacy (data.from/data.text).
 */
export function parseInboundMessage(event: ZernioInboundEvent): ParsedInbound {
  const msg = event.message;
  const conv = event.conversation;
  const acc = event.account;

  const text = (pick(msg, ["message", "text", "body"]) ??
    pick(event.data, ["text"])) as string | null;

  // Número del cliente: WhatsApp llega como senderId / participantId (E.164).
  const telefono = (pick(msg, ["senderId", "senderPhone", "from"]) ??
    pick(conv, ["participantId", "phone", "from"]) ??
    pick(event.data, ["from"]) ??
    (event.data?.sender && (event.data.sender.id ?? null))) as string | null;

  const nombre = (pick(msg, ["senderName", "sender", "name"]) ??
    pick(conv, ["participantName", "name"]) ??
    pick(event.data, ["contact_name"]) ??
    (event.data?.sender && (event.data.sender.name ?? null))) as string | null;

  const conversationId = (pick(msg, ["conversationId"]) ??
    pick(conv, ["id", "conversationId"]) ??
    pick(event.data, ["conversation_id"])) as string | null;

  const accountId = (pick(msg, ["accountId"]) ??
    pick(acc, ["id"]) ??
    pick(event.data, ["profile_id"])) as string | null;

  return { text, telefono, nombre, conversationId, accountId };
}

/**
 * Envía un mensaje de texto a una conversación de WhatsApp vía Zernio.
 * Docs: https://docs.zernio.com/messages/send-inbox-message
 * POST /v1/inbox/conversations/{conversationId}/messages
 * Body: { accountId, message }
 */
export async function sendWhatsAppMessage(
  conversationId: string,
  accountId: string,
  text: string
) {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) {
    throw new Error("Falta ZERNIO_API_KEY en el entorno");
  }
  if (!conversationId || !accountId) {
    throw new Error("sendWhatsAppMessage requiere conversationId y accountId");
  }

  const url = `${ZERNIO_API_BASE}/v1/inbox/conversations/${encodeURIComponent(
    conversationId
  )}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({ accountId, message: text }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Zernio send message failed: ${res.status} ${detail}`);
  }

  return res.json();
}
