import { NextRequest, NextResponse } from "next/server";
import {
  verifyZernioSignature,
  sendWhatsAppMessage,
  parseInboundMessage,
  normalizePhone,
  isValidMexicanMobile,
  type ZernioInboundEvent,
} from "@/lib/zernio";
import { runBotTurn } from "@/lib/bot";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { notifyNewLeadToSlack } from "@/lib/slack-notify";
import { notifyNewLead, notifyNeedsAdvisor } from "@/lib/push";

// DeepSeek puede tardar varios segundos; evita que Vercel corte la función
// antes de enviar la respuesta del bot (default ~10-15s).
export const maxDuration = 60;

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
  // Filtra spam/escáner: rechaza números que no sean un móvil mexicano válido
  // (10 dígitos, código de área 2-9). No crea lead ni corre el bot.
  if (!isValidMexicanMobile(telefono)) {
    return NextResponse.json({ ok: true, ignored: "telefono invalido" });
  }
    const texto = parsed.text;
      const attachments = parsed.attachments ?? [];
      // Acepta mensajes con adjunto aunque no traigan texto (ej. foto del INE sin caption).
      if (!telefono || (!texto && attachments.length === 0)) {
        return NextResponse.json({ ok: true, ignored: "payload incompleto" });
      }

    // Marcar como procesado ANTES del trabajo lento (DeepSeek tarda 10-60s).
    // Zernio reintenta hasta ~7x; si el marcador se escribe al final, cada reintento
    // que llega mientras el primero procesa pasa el chequeo de dedupe y responde
    // duplicado (síntoma: 4 respuestas a un solo mensaje). Escribirlo temprano
    // descarta los reintentos. Tradeoff: si el proceso muere a mitad, ese mensaje
    // se pierde (no se reintenta) — aceptable frente a spamear al cliente.
        await pb.collection("processed_webhook_events").create({ event_id: event.id });

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

  // Arma el historial reciente para el bot (últimos 10 mensajes: suficiente contexto
    // sin inflar los tokens de entrada, que es lo que más tarda en DeepSeek).
    const recentMessages = await pb
        .collection("messages")
        .getList(1, 10, {
        filter: `conversation = "${conversationId}"`,
        sort: "created",
      });

  const history = (
    (recentMessages.items ?? []) as unknown as {
      remitente: string;
      contenido: string;
      media_type?: string | null;
    }[]
  )
    .filter((m) => m.remitente !== "asesor")
    .map((m) => ({
      role: (m.remitente === "cliente" ? "user" : "assistant") as
        | "user"
        | "assistant",
      content: m.media_type
        ? `[El cliente envió una ${m.media_type === "image" ? "foto" : "imagen"}${m.contenido ? ` con el mensaje: ${m.contenido}` : ""}]`
        : m.contenido,
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
      if (botResult.leadData.otra_financiera) updates.otra_financiera = botResult.leadData.otra_financiera;
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
      .update(conversationId, { bot_activo: false, necesita_asesor: true });
    await pb.collection("leads").update(leadId, { status: "en_seguimiento" });
    // Notifica a los asesores que esta conversación ya está lista y requiere su atención.
    await notifyNeedsAdvisor(leadId);
  }

  // Notificar lead nuevo (best-effort)
  if (esLeadNuevo) {
    await notifyNewLeadToSlack({
      nombre: parsed.nombre ?? null,
      telefono,
      origen: "whatsapp",
      leadId,
    });
    // Push al PWA del teléfono (mismo aviso que el formulario web).
    await notifyNewLead({
      nombre: parsed.nombre ?? null,
      apellido: null,
      monto_aproximado: null,
    });
  }

  return NextResponse.json({ ok: true });
}
