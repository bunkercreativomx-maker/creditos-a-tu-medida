import { NextRequest, NextResponse, after } from "next/server";
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
import { procesarTurnoBot } from "@/lib/turno";

// El trabajo pesado (LLM + envío) corre DESPUÉS de responder a Zernio (after()).
export const maxDuration = 60;

// Allowlist: SOLO procesa mensajes de la cuenta WhatsApp de Créditos.
const CREDITOS_ACCOUNT_ID =
  process.env.ZERNIO_CREDITOS_ACCOUNT_ID ?? "6a97367b77555aae01b11e1a";

// GET devuelve marcador de versión desplegada (útil para verificar deploys).
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "zernio-webhook",
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "?").slice(0, 7),
  });
}

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
  // Guard por cuenta: descarta mensajes de cualquier cuenta que no sea la de
  // Créditos ANTES de crear lead, conversación o mensaje.
  if (CREDITOS_ACCOUNT_ID && parsed.accountId !== CREDITOS_ACCOUNT_ID) {
    return NextResponse.json({ ok: true, ignored: "cuenta no es de creditos" });
  }

  const telefono = normalizePhone(parsed.telefono);
  if (!isValidMexicanMobile(telefono)) {
    return NextResponse.json({ ok: true, ignored: "telefono invalido" });
  }

  const texto = parsed.text;
  const attachments = parsed.attachments ?? [];
  if (!telefono || (!texto && attachments.length === 0)) {
    return NextResponse.json({ ok: true, ignored: "payload incompleto" });
  }

  // Marca el evento como procesado ANTES del trabajo lento (evita reintentos).
  await pb.collection("processed_webhook_events").create({ event_id: event.id });

  // Upsert lead por teléfono
  const existingLead = await pb
    .collection("leads")
    .getFirstListItem(`telefono = "${telefono}"`)
    .catch(() => null);

  let leadId: string;
  let esLeadNuevo = false;
  let esRecurrente = false;
  let reactivar = false;
  if (existingLead) {
    leadId = existingLead.id;
    const nombreExistente = existingLead.nombre;
    if ((!nombreExistente || !String(nombreExistente).trim()) && parsed.nombre) {
      await pb.collection("leads").update(leadId, { nombre: parsed.nombre });
    }
    esRecurrente = Boolean(String(nombreExistente ?? "").trim());
    const statusActual = String(existingLead.status ?? "");
    const estabaArchivado = Boolean(existingLead.archivado);
    const estaCerrado = statusActual === "cerrado_ganado" || statusActual === "cerrado_perdido";
    if (estabaArchivado || estaCerrado) {
      reactivar = true;
      await pb
        .collection("leads")
        .update(leadId, {
          archivado: false,
          ...(estaCerrado ? { status: "nuevo" } : {}),
        })
        .catch(() => {});
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
    await pb.collection("conversations").update(conversationId, {
      zernio_conversation_id: parsed.conversationId,
      zernio_account_id: parsed.accountId,
      ...(reactivar ? { bot_activo: true, necesita_asesor: false } : {}),
    });
    if (reactivar) botActivo = true;
  } else {
    const newConversation = await pb.collection("conversations").create({
      lead: leadId,
      telefono,
      canal: "whatsapp",
      bot_activo: true,
      zernio_conversation_id: parsed.conversationId,
      zernio_account_id: parsed.accountId,
    });
    conversationId = newConversation.id;
    botActivo = newConversation.bot_activo;
  }

  // Guarda el primer adjunto (prioriza imagen) para mostrarlo en la conversación.
  const media = attachments.find((a) => a.type === "image") ?? attachments[0] ?? null;
  const mensajeCliente = await pb.collection("messages").create({
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

  // ACK INMEDIATO: Zernio tiene un timeout corto; devolvemos 200 ya y el turno
  // del bot corre en segundo plano (after()).
  after(async () => {
    await procesarTurnoBot(
      {
        parsed,
        telefono,
        leadId,
        conversationId,
        esLeadNuevo,
        esRecurrente,
        mensajeId: mensajeCliente.id,
      },
      {
        pb: pb as unknown as Parameters<typeof procesarTurnoBot>[1]["pb"],
        send: sendWhatsAppMessage,
        runBotTurn,
        notifyNeedsAdvisor,
        notifyNewLead,
        notifyNewLeadToSlack,
      }
    );
  });

  return NextResponse.json({ ok: true, accepted: true });
}