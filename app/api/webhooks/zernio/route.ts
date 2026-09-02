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
    const attachments = parsed.attachments ?? [];
    // Acepta mensajes con adjunto aunque no traigan texto (ej. foto del INE sin caption).
    if (!telefono || (!texto && attachments.length === 0)) {
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

  // Guarda el primer adjunto (prioriza imagen) para mostrarlo en la conversación.
  const media = attachments.find((a) => a.type === "image") ?? attachments[0] ?? null;
  await pb.collection("messages").create({
    conversation: conversationId,
    remitente: "cliente",
    contenido: texto ?? "",
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
    created: new Date().toISOString(),
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

  // Guardar en el lead los datos de calificación que el bot recoja (nombre, apellido, sector, institución, banco, monto, NSS, tipo).
    if (botResult.leadData) {
      const updates: Record<string, unknown> = {};
      if (botResult.leadData.nombre) updates.nombre = botResult.leadData.nombre;
      if (botResult.leadData.apellido) updates.apellido = botResult.leadData.apellido;
      if (botResult.leadData.sector) updates.sector = botResult.leadData.sector;
      if (botResult.leadData.institucion) updates.institucion = botResult.leadData.institucion;
      if (botResult.leadData.banco) updates.banco = botResult.leadData.banco;
      if (botResult.leadData.monto_aproximado)
        updates.monto_aproximado = botResult.leadData.monto_aproximado;
      if (botResult.leadData.nss) updates.nss = botResult.leadData.nss;
      if (botResult.leadData.tipo_credito) updates.tipo_credito = botResult.leadData.tipo_credito;
      if (Object.keys(updates).length > 0) {
        await pb.collection("leads").update(leadId, updates);
      }
    }

  if (botResult.reply && pbConversationId && pbAccountId) {
    await sendWhatsAppMessage(pbConversationId, pbAccountId, botResult.reply);
    await pb.collection("messages").create({
          conversation: conversationId,
          remitente: "bot",
          contenido: botResult.reply,
          created: new Date().toISOString(),
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
