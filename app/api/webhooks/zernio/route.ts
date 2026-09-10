import { NextRequest, NextResponse } from "next/server";
import {
  verifyZernioSignature,
  sendWhatsAppMessage,
  parseInboundMessage,
  normalizePhone,
  isValidMexicanMobile,
  type ZernioInboundEvent,
} from "@/lib/zernio";
import { runBotTurn, type BotTurnResultWithError } from "@/lib/bot";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { notifyNewLeadToSlack } from "@/lib/slack-notify";
import { notifyNewLead, notifyNeedsAdvisor } from "@/lib/push";

// DeepSeek puede tardar varios segundos; evita que Vercel corte la función
// antes de enviar la respuesta del bot (default ~10-15s).
export const maxDuration = 60;

// Allowlist: SOLO procesa mensajes de la cuenta WhatsApp de Créditos.
// El webhook de Zernio está registrado a nivel de workspace, así que recibe
// message.received de TODAS las cuentas (incluida Solace Skin Lab). Sin este
// guard, los mensajes de otras cuentas crean leads basura en este CRM.
const CREDITOS_ACCOUNT_ID =
  process.env.ZERNIO_CREDITOS_ACCOUNT_ID ?? "6a97367b77555aae01b11e1a";

// DIAGNÓSTICO (temporal): GET devuelve el commit desplegado en ESTA URL.
// Permite verificar desde fuera qué versión del código sirve cada host,
// incluida cualquier URL de deployment a la que Zernio pudiera estar apuntando.
// Con ?selftest=<token> ejecuta runBotTurn EN EL SERVIDOR (usa la key real de
// producción) y reporta latencia + respuesta + error, sin enviar WhatsApp.
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  if (u.searchParams.get("selftest") === "diag-q7f3k9-20260910") {
    const t0 = Date.now();
    try {
      const r = await runBotTurn(
        [
          { role: "user", content: "Buenas tardes" },
          { role: "user", content: "Quiero un préstamo" },
        ],
        {
          contexto: "FECHA Y HORA ACTUAL: miércoles 9 de septiembre de 2026, 20:00 (America/Ciudad_Juarez).",
          resolveTool: async () => JSON.stringify({ ok: true }),
        }
      );
      return NextResponse.json({
        ok: true,
        ms: Date.now() - t0,
        reply: r.reply,
        escalate: r.escalate,
        leadData: r.leadData,
      });
    } catch (e) {
      const err = e as Error;
      return NextResponse.json({
        ok: false,
        ms: Date.now() - t0,
        error: String(err?.message ?? err).slice(0, 300),
      });
    }
  }
  // Proxy GET de solo-lectura a la API de Zernio con la key de producción.
  // ?zget=/v1/webhooks/logs  → permite ver entregas, URL destino y respuesta.
  const zget = u.searchParams.get("zget");
  if (zget && u.searchParams.get("selftest") === "diag-q7f3k9-20260910") {
    const apiKey = process.env.ZERNIO_API_KEY ?? "";
    const base = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api";
    try {
      const res = await fetch(`${base}${zget}`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      return NextResponse.json({
        status: res.status,
        body: (await res.text()).slice(0, 6000),
      });
    } catch (e) {
      return NextResponse.json({ error: String((e as Error)?.message ?? e).slice(0, 200) });
    }
  }
  // Chequeo read-only de la API de Zernio con la key REAL de producción:
  // valida que la key viva y que el endpoint responda (sin enviar mensajes).
  if (u.searchParams.get("checkzernio") === "diag-q7f3k9-20260910") {
    const t0 = Date.now();
    const apiKey = process.env.ZERNIO_API_KEY ?? "";
    const base = process.env.ZERNIO_API_BASE ?? "https://zernio.com/api";
    const out: Record<string, unknown> = {
      keyPresent: apiKey.length > 0,
      keyPrefix: apiKey ? apiKey.slice(0, 6) : null,
      base,
      conversacion: process.env.ZERNIO_WHATSAPP_PROFILE_ID ?? null,
    };
    try {
      const res = await fetch(`${base}/v1/profiles`, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      out.status = res.status;
      out.body = (await res.text()).slice(0, 300);
    } catch (e) {
      out.error = String((e as Error)?.message ?? e).slice(0, 200);
    }
    out.ms = Date.now() - t0;
    return NextResponse.json(out);
  }
  return NextResponse.json({
    ok: true,
    route: "zernio-webhook",
    diag: "v3",
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "?").slice(0, 7),
    url: process.env.VERCEL_URL ?? "?",
    // Diagnóstico: qué proveedor/modelo usa el bot en producción (sin exponer la key).
    modelo: process.env.DEEPSEEK_MODEL ?? "(default deepseek-chat)",
    base: process.env.DEEPSEEK_API_BASE ?? "(default api.deepseek.com)",
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

  // DIAGNÓSTICO TEMPORAL: deja rastro en PocketBase en cada etapa para poder
  // ver desde fuera hasta dónde llega el webhook y con qué error muere.
  // Graba además el commit desplegado y el host que Zernio realmente golpea.
  const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "?";
  const host = req.headers.get("host") ?? "?";
  const trace = async (tag: string) => {
    await pb
      .collection("processed_webhook_events")
      .create({ event_id: `v3[${sha.slice(0, 7)}|${host}]:${tag}` })
      .catch(() => {});
  };
  await trace("entry");

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
        await trace("marked");

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
    await trace("bot_inactivo");
    return NextResponse.json({ ok: true, bot: "inactivo" });
  }
  await trace("msg_guardado");

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

  await trace("antes_bot");
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
    resolveTool: async (name, args) => {
      if (name === "consultar_disponibilidad") {
        const fecha = String(args?.fecha ?? "");
        if (!fecha) return JSON.stringify({ error: "fecha faltante" });
        // Busca citas ya ocupadas ese día.
        const occupied = await pb
          .collection("citas")
          .getFullList({ filter: `fecha ~ "${fecha}"` })
          .catch(() => []);
        const hours = (occupied as unknown as { fecha?: string }[])
          .map((c) => c.fecha?.slice(11, 16))
          .filter(Boolean);
        return JSON.stringify({ fecha, ocupadas: hours });
      }
      if (name === "agendar_cita") {
        // El evento real se crea más abajo a partir de botResult.cita.
        return JSON.stringify({ ok: true });
      }
      return JSON.stringify({ ok: true });
    },
  }).catch((err) => {
    // Fallback anti-silencio: NUNCA terminar un turno sin respuesta al cliente.
    console.error("[webhook] error en runBotTurn:", err);
    trace("ERR_bot:" + String(err?.message ?? err).slice(0, 150));
    return { reply: null, escalate: false, leadData: null, cita: null, botError: true } as BotTurnResultWithError;
  });
  await trace(`despues_bot:reply=${botResult.reply ? "si" : "no"}`);

  // Save en el lead los datos de calificación que el bot recoja.
  // Mapeo: estatus->sector, dependencia->institucion, monto_solicitado->monto_aproximado,
  // credito_vigente->otra_financiera; empresa_credito y antiguedad_credito son campos propios.
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
      await pb.collection("leads").update(leadId, updates);
    }
  }

  // Si el bot agendó una cita, créala en la colección `citas` (visible en el Calendario del CRM).
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

  // Fallback anti-silencio: si el bot falló (error técnico) o no generó respuesta,
  // NUNCA dejamos al cliente sin respuesta. Mandamos el Cierre B y marcamos para asesor.
  const resultWithError = botResult as BotTurnResultWithError;
  const botFallo =
    resultWithError.botError ||
    !botResult.reply ||
    !botResult.reply.trim();

  // Marca la conversación para intervención humana cuando el flujo lo pida.
  const marcarParaAsesor = async () => {
    await pb
      .collection("conversations")
      .update(conversationId, { bot_activo: false, necesita_asesor: true })
      .catch(() => {});
    await pb.collection("leads").update(leadId, { status: "en_seguimiento" }).catch(() => {});
  };

  // Helper: envía un mensaje y lo persiste; si el envío FALLA, lanza para que
  // el flujo caiga al fallback (nunca dejar al cliente en silencio).
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

  try {
    if (botFallo) {
      // El bot no produjo respuesta útil: mandamos el Cierre B anti-silencio.
      const fallbackMsg = `Perfecto, ${parsed.nombre ?? ""}. Ya quedó registrada su información. Un asesor se pondrá en contacto con usted lo antes posible para darle todos los detalles. Quedo pendiente por aquí por cualquier cosa. ¡Excelente día!`.replace(/\s+/g, " ").trim();
      await enviarMensajeBot(fallbackMsg);
      await marcarParaAsesor();
      return NextResponse.json({ ok: true, fallback: true });
    }

    // Respuesta normal del bot.
    await enviarMensajeBot(botResult.reply!);

    if (botResult.escalate) {
      await marcarParaAsesor();
      // Notifica a los asesores que esta conversación ya está lista y requiere su atención.
      await notifyNeedsAdvisor(leadId);
    }
  } catch (err) {
    // Cualquier fallo técnico (DeepSeek, PocketBase, o el envío saliente a Zernio)
    // NUNCA deja al cliente sin respuesta: intentamos el Cierre B anti-silencio.
    console.error("[webhook] error enviando respuesta, se intenta fallback:", err);
    await trace("ERR_envio:" + String((err as Error)?.message ?? err).slice(0, 150));
    try {
      const fallbackMsg = `Perfecto, ${parsed.nombre ?? ""}. Ya quedó registrada su información. Un asesor se pondrá en contacto con usted lo antes posible para darle todos los detalles. Quedo pendiente por aquí por cualquier cosa. ¡Excelente día!`.replace(/\s+/g, " ").trim();
      if (pbConversationId && pbAccountId) {
        await sendWhatsAppMessage(pbConversationId, pbAccountId, fallbackMsg).catch((e2) => {
          console.error("[webhook] fallback de envío también falló:", e2);
        });
      }
    } finally {
      await marcarParaAsesor();
    }
    return NextResponse.json({ ok: true, fallback: true });
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
