import { NextRequest, NextResponse } from "next/server";
import {
  verifyZernioSignature,
  sendWhatsAppMessage,
  parseInboundMessage,
  normalizePhone,
  type ZernioInboundEvent,
} from "@/lib/zernio";
import { runBotTurn } from "@/lib/bot";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { notifyNewLeadToSlack } from "@/lib/slack-notify";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("X-Zernio-Signature");

  if (!verifyZernioSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as ZernioInboundEvent;
  const pb = await createAdminClient();

  // Idempotencia: descarta reintentos del mismo evento (Zernio reintenta hasta 7 veces).
  const existing = await pb
    .collection("processed_webhook_events")
    .getFirstListItem(`event_id = "${event.id}"`)
    .catch(() => null);

  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // El primer webhook de prueba que llega al configurar es webhook.test — lo aceptamos
  // pero no procesamos como mensaje.
  if (event.event !== "message.received") {
    return NextResponse.json({ ok: true, ignored: event.event });
  }

  const parsed = parseInboundMessage(event);
  const telefonoRaw = parsed.telefono;
  const telefono = normalizePhone(telefonoRaw);
  const texto = parsed.text;
  if (!telefono || !texto) {
    return NextResponse.json({ ok: true, ignored: "payload incompleto" });
  }

  const pbConversationId = parsed.conversationId;
  const pbAccountId = parsed.accountId;

  // Upsert lead por teléfono
  const existingLead = await pb
    .collection("leads")
    .getFirstListItem(`telefono = "${telefono}"`)
    .catch(() => null);

  let leadId: string;
  let esLeadNuevo = false;
  if (existingLead) {
    leadId = existingLead.id;
    // Si el lead existente no tiene nombre y ahora lo sabemos, lo rellenamos.
    const nombreExistente = existingLead.nombre;
    if ((!nombreExistente || !String(nombreExistente).trim()) && parsed.nombre) {
      await pb
        .collection("leads")
        .update(leadId, { nombre: parsed.nombre });
    }
  } else {
    const newLead = await pb.collection("leads").create({
      telefono,
      nombre: parsed.nombre ?? null,
      origen: "whatsapp",
      status: "nuevo",
    });
    leadId = newLead.id;
    esLeadNuevo = true;
  }

  // Upsert conversation por teléfono
  const existingConversation = await pb
    .collection("conversations")
    .getFirstListItem(`telefono = "${telefono}"`)
    .catch(() => null);

  let conversationId: string;
  let botActivo = true;
  if (existingConversation) {
    conversationId = existingConversation.id;
    botActivo = existingConversation.bot_activo;
    // Refrescar los ids de Zernio por si cambiaron
    await pb.collection("conversations").update(conversationId, {
      zernio_conversation_id: pbConversationId,
      zernio_account_id: pbAccountId,
    });
  } else {
    const newConversation = await pb.collection("conversations").create({
      lead: leadId,
      telefono,
      canal: "whatsapp",
      bot_activo: true,
      zernio_conversation_id: pbConversationId,
      zernio_account_id: pbAccountId,
    });
    conversationId = newConversation.id;
    botActivo = newConversation.bot_activo;
  }

  await pb.collection("messages").create({
    conversation: conversationId,
    remitente: "cliente",
    contenido: texto,
  });

  if (!botActivo) {
    return NextResponse.json({ ok: true, bot: "inactivo" });
  }

  // Arma el historial reciente para el bot
  const recentMessages = await pb
    .collection("messages")
    .getList(1, 20, {
      filter: `conversation = "${conversationId}"`,
      sort: "-id",
    });

  const history = (
    (recentMessages.items ?? []) as unknown as {
      remitente: string;
      contenido: string;
    }[]
  )
    .filter((m) => m.remitente !== "asesor")
    .map((m) => ({
      role: (m.remitente === "cliente" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.contenido,
    }));

  const botResult = await runBotTurn(history);

  if (botResult.reply && pbConversationId && pbAccountId) {
    await sendWhatsAppMessage(pbConversationId, pbAccountId, botResult.reply);
    await pb.collection("messages").create({
      conversation: conversationId,
      remitente: "bot",
      contenido: botResult.reply,
    });
  }

  if (botResult.escalate) {
    await pb
      .collection("conversations")
      .update(conversationId, { bot_activo: false });
    await pb.collection("leads").update(leadId, { status: "en_seguimiento" });
  }

  // Marcar como procesado SOLO después de éxito (evita perder reintentos)
  await pb.collection("processed_webhook_events").create({ event_id: event.id });

  // Notificar lead nuevo (best-effort)
  if (esLeadNuevo) {
    await notifyNewLeadToSlack({
      nombre: parsed.nombre ?? null,
      telefono,
      origen: "whatsapp",
      leadId,
    });
  }

  return NextResponse.json({ ok: true });
}
