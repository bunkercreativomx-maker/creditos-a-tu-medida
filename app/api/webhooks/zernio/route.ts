import { NextRequest, NextResponse, after } from "next/server";
import {
  verifyZernioSignature,
  sendWhatsAppMessage,
  parseInboundMessage,
  normalizePhone,
  isValidMexicanMobile,
  type ZernioInboundEvent,
  type ParsedInbound,
} from "@/lib/zernio";
import { runBotTurn, type BotTurnResultWithError } from "@/lib/bot";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { notifyNewLeadToSlack } from "@/lib/slack-notify";
import { notifyNewLead, notifyNeedsAdvisor } from "@/lib/push";

// El trabajo pesado (LLM + envío) corre DESPUÉS de responder a Zernio (after()),
// así que este tope cubre ese trabajo en segundo plano.
export const maxDuration = 60;

// Allowlist: SOLO procesa mensajes de la cuenta WhatsApp de Créditos.
// El webhook de Zernio está registrado a nivel de workspace, así que recibe
// message.received de TODAS las cuentas (incluida Solace Skin Lab). Sin este
// guard, los mensajes de otras cuentas crean leads basura en este CRM.
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

type PbClient = Awaited<ReturnType<typeof createAdminClient>>;

/**
 * Trabajo pesado del turno: arma el historial, corre el bot y responde al
 * cliente. Se ejecuta en `after()` — Zernio tiene un timeout corto (~10s) y
 * aborta la entrega si el handler tarda más, marcándola como fallida; por eso
 * ACK-eamos al instante y hacemos esto después de responder.
 */
async function procesarTurnoBot(args: {
  pb: PbClient;
  parsed: ParsedInbound;
  telefono: string;
  leadId: string;
  conversationId: string;
  esLeadNuevo: boolean;
}) {
  const { pb, parsed, telefono, leadId, conversationId, esLeadNuevo } = args;
  const pbConversationId = parsed.conversationId;
  const pbAccountId = parsed.accountId;

  try {
    // Historial reciente para el bot (10 msgs basta de contexto y no infla tokens).
    const recentMessages = await pb.collection("messages").getList(1, 10, {
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
        role: (m.remitente === "cliente" ? "user" : "assistant") as "user" | "assistant",
        content: m.media_type
          ? `[El cliente envió una ${m.media_type === "image" ? "foto" : "imagen"}${m.contenido ? ` con el mensaje: ${m.contenido}` : ""}]`
          : m.contenido,
      }));

    const botResult = await runBotTurn(history, {
      // Fecha/hora REAL de Cd. Juárez inyectada como contexto: evita que el bot
      // invente fechas para "mañana"/"la próxima semana" (BLOQUE 7).
      contexto: `FECHA Y HORA ACTUAL: ${new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Ciudad_Juarez",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date())} (America/Ciudad_Juarez).\n\nCuando el cliente pida un día relativo (hoy, mañana, la próxima semana), calcula la fecha concreta usando esta fecha actual. No inventes fechas.`,
      resolveTool: async (name, toolArgs) => {
        if (name === "consultar_disponibilidad") {
          const fecha = String(toolArgs?.fecha ?? "");
          if (!fecha) return JSON.stringify({ error: "fecha faltante" });
          const occupied = await pb
            .collection("citas")
            .getFullList({ filter: `fecha ~ "${fecha}"` })
            .catch(() => []);
          const hours = (occupied as unknown as { fecha?: string }[])
            .map((c) => c.fecha?.slice(11, 16))
            .filter(Boolean);
          return JSON.stringify({ fecha, ocupadas: hours });
        }
        return JSON.stringify({ ok: true });
      },
    }).catch((err) => {
      // Fallback anti-silencio: NUNCA terminar un turno sin respuesta al cliente.
      console.error("[webhook] error en runBotTurn:", err);
      return {
        reply: null,
        escalate: false,
        leadData: null,
        cita: null,
        botError: true,
      } as BotTurnResultWithError;
    });

    // Datos de calificación -> campos del lead.
    if (botResult.leadData) {
      const updates: Record<string, unknown> = {};
      if (botResult.leadData.nombre) updates.nombre = botResult.leadData.nombre;
      if (botResult.leadData.apellido) updates.apellido = botResult.leadData.apellido;
      if (botResult.leadData.estatus) updates.sector = botResult.leadData.estatus;
      if (botResult.leadData.dependencia) updates.institucion = botResult.leadData.dependencia;
      if (botResult.leadData.monto_solicitado)
        updates.monto_aproximado = botResult.leadData.monto_solicitado;
      if (botResult.leadData.credito_vigente)
        updates.otra_financiera = botResult.leadData.credito_vigente;
      if (botResult.leadData.empresa_credito)
        updates.empresa_credito = botResult.leadData.empresa_credito;
      if (botResult.leadData.antiguedad_credito)
        updates.antiguedad_credito = botResult.leadData.antiguedad_credito;
      if (Object.keys(updates).length > 0) {
        await pb.collection("leads").update(leadId, updates).catch(() => {});
      }
    }

    // Cita agendada por el bot -> colección `citas` (visible en el Calendario).
    if (botResult.cita) {
      const fecha = botResult.cita.fecha;
      const hora = botResult.cita.hora || "12:00";
      const iso = `${fecha}T${hora.length === 5 ? hora : "12:00"}:00`;
      try {
        await pb.collection("citas").create({
          lead: leadId,
          titulo: botResult.cita.titulo || `Cita préstamo — ${parsed.nombre ?? ""}`,
          fecha: iso,
          tipo: "cita",
          notas: botResult.cita.notas ?? null,
          asignado_a: null,
        });
      } catch (err) {
        // No rompas la respuesta si falla el calendario; se loguea.
        console.error("Error creando cita:", err);
      }
    }

    const resultWithError = botResult as BotTurnResultWithError;
    const botFallo = resultWithError.botError || !botResult.reply || !botResult.reply.trim();

    const marcarParaAsesor = async () => {
      await pb
        .collection("conversations")
        .update(conversationId, { bot_activo: false, necesita_asesor: true })
        .catch(() => {});
      await pb.collection("leads").update(leadId, { status: "en_seguimiento" }).catch(() => {});
    };

    const enviarMensajeBot = async (texto: string) => {
      if (!pbConversationId || !pbAccountId) throw new Error("sin destino para enviar");
      await sendWhatsAppMessage(pbConversationId, pbAccountId, texto);
      await pb.collection("messages").create({
        conversation: conversationId,
        remitente: "bot",
        contenido: texto,
        created: new Date().toISOString(),
      });
    };

    const cierreB = `Perfecto, ${parsed.nombre ?? ""}. Ya quedó registrada su información. Un asesor se pondrá en contacto con usted lo antes posible para darle todos los detalles. Quedo pendiente por aquí por cualquier cosa. ¡Excelente día!`
      .replace(/\s+/g, " ")
      .trim();

    try {
      if (botFallo) {
        await enviarMensajeBot(cierreB);
        await marcarParaAsesor();
      } else {
        await enviarMensajeBot(botResult.reply!);
        if (botResult.escalate) {
          await marcarParaAsesor();
          await notifyNeedsAdvisor(leadId);
        }
      }
    } catch (err) {
      // Cualquier fallo (LLM, PocketBase o el envío a Zernio) NO puede dejar al
      // cliente sin respuesta: intentamos el cierre B y pasamos a un asesor.
      console.error("[webhook] error enviando respuesta, se intenta fallback:", err);
      try {
        if (pbConversationId && pbAccountId) {
          await sendWhatsAppMessage(pbConversationId, pbAccountId, cierreB).catch((e2) => {
            console.error("[webhook] fallback de envío también falló:", e2);
          });
        }
      } finally {
        await marcarParaAsesor();
      }
    }

    // Notificar lead nuevo (best-effort).
    if (esLeadNuevo) {
      await notifyNewLeadToSlack({
        nombre: parsed.nombre ?? null,
        telefono,
        origen: "whatsapp",
        leadId,
      });
      await notifyNewLead({
        nombre: parsed.nombre ?? null,
        apellido: null,
        monto_aproximado: null,
      });
    }
  } catch (err) {
    console.error("[webhook] error fatal en procesarTurnoBot:", err);
  }
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
  // Créditos (ej. Solace Skin Lab) ANTES de crear lead, conversación o mensaje.
  if (CREDITOS_ACCOUNT_ID && parsed.accountId !== CREDITOS_ACCOUNT_ID) {
    return NextResponse.json({ ok: true, ignored: "cuenta no es de creditos" });
  }

  const telefono = normalizePhone(parsed.telefono);
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

  // Marca el evento como procesado ANTES del trabajo lento: Zernio reintenta
  // hasta ~7x y sin esto cada reintento procesaría el mismo mensaje (el bot
  // respondería varias veces). Si el proceso muriera, ese mensaje se pierde,
  // pero el ACK inmediato de abajo evita que Zernio reintente por timeout.
  await pb.collection("processed_webhook_events").create({ event_id: event.id });

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
      await pb.collection("leads").update(leadId, { nombre: parsed.nombre });
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
      zernio_conversation_id: parsed.conversationId,
      zernio_account_id: parsed.accountId,
    });
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

  // ACK INMEDIATO: Zernio tiene un timeout corto (~10s) y marca la entrega como
  // fallida si el handler tarda más; su reintento luego es anulado por el
  // marcador de dedupe, así que el cliente se quedaba sin respuesta. Devolvemos
  // 200 ya y el turno del bot corre en segundo plano (after()).
  after(async () => {
    await procesarTurnoBot({ pb, parsed, telefono, leadId, conversationId, esLeadNuevo });
  });

  return NextResponse.json({ ok: true, accepted: true });
}
