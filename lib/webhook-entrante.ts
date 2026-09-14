// Ingesta de un webhook entrante de Zernio (decide y persiste), separada del
// HTTP (firma/dedupe a nivel de ruta) para poder ejercitarla de punta a punta
// con adaptadores mock, igual que `lib/turno.ts`.
//
// Dos reglas que NO se rompen:
//  1. NINGÚN entrante se descarta en silencio: cada `message.received` deja una
//     traza en PocketBase (`webhook_debug`) con el payload CRUDO y el motivo
//     ("procesado" o la razón del descarte). Así se responde de una vez si un
//     audio (i) nunca llega, (ii) llega con `attachments` vacío o (iii) llega
//     bien y se pierde después.
//  2. Un mensaje con `text: null` + adjunto (nota de voz, foto sin caption)
//     SE PROCESA: no puede caer en "payload incompleto".
//
// Sin secretos: el payload de Zernio no trae la API key, pero NO se loguean
// headers ni el valor de ninguna variable de entorno.

import {
  normalizePhone,
  isValidMexicanMobile,
  parseInboundMessage,
  type ZernioInboundEvent,
} from "@/lib/zernio";
import {
  procesarTurnoBot,
  type TurnoDeps,
  type TurnoPb,
} from "@/lib/turno";

/** Superficie mínima de PocketBase (incluye getFirstListItem, que usa la ruta). */
export type EntranteCollection = ReturnType<TurnoPb["collection"]> & {
  getFirstListItem(
    filter: string,
    opts?: Record<string, unknown>
  ): Promise<{ id: string } & Record<string, unknown>>;
};

export type EntrantePb = {
  collection(name: string): EntranteCollection;
};

export type EntranteDeps = {
  pb: EntrantePb;
  send: TurnoDeps["send"];
  runBotTurn: TurnoDeps["runBotTurn"];
  transcribirAudio?: TurnoDeps["transcribirAudio"];
  notifyNeedsAdvisor: TurnoDeps["notifyNeedsAdvisor"];
  notifyNewLead: TurnoDeps["notifyNewLead"];
  notifyNewLeadToSlack: TurnoDeps["notifyNewLeadToSlack"];
  /** Ejecuta el trabajo pesado DESPUÉS de ACK-ear a Zernio (en la ruta: `after`). */
  after: (fn: () => Promise<void>) => void;
  /** Allowlist: accountId de la cuenta WhatsApp de Créditos. */
  accountIdEsperado?: string | null;
};

export type EntranteResultado = {
  ok: true;
  deduped?: boolean;
  ignored?: string;
  bot?: "inactivo";
  accepted?: boolean;
};

/** Colección de diagnóstico (crear con scripts/pb_create_webhook_debug.py). */
export const COLECCION_TRAZA = "webhook_debug";

export type TrazaEntrante = {
  eventId: string;
  event: string;
  motivo: string;
  accountId?: string | null;
  telefono?: string | null;
  direction?: string | null;
  hasText?: boolean;
  hasAttachments?: boolean;
  attachmentTypes?: string;
  payload: unknown;
};

/**
 * Persiste la traza de un entrante. NUNCA lanza: si la colección no existe o
 * PocketBase falla, el webhook debe seguir funcionando (el diagnóstico es
 * importante, pero no puede tumbar el bot).
 */
export async function registrarTraza(pb: EntrantePb, t: TrazaEntrante): Promise<void> {
  try {
    await pb.collection(COLECCION_TRAZA).create({
      event_id: t.eventId,
      event: t.event,
      motivo: t.motivo,
      account_id: t.accountId ?? null,
      telefono: t.telefono ?? null,
      direction: t.direction ?? null,
      has_text: Boolean(t.hasText),
      has_attachments: Boolean(t.hasAttachments),
      attachment_types: t.attachmentTypes ?? "",
      payload: t.payload ?? null,
    });
  } catch (err) {
    console.error(
      `[entrante] no se pudo registrar la traza en ${COLECCION_TRAZA} (¿falta crear la colección?):`,
      err
    );
  }
}

/**
 * Procesa un evento del webhook de Zernio ya verificado por firma.
 * Devuelve el cuerpo que la ruta responde a Zernio.
 */
export async function procesarEntrante(
  event: ZernioInboundEvent,
  deps: EntranteDeps
): Promise<EntranteResultado> {
  const { pb } = deps;

  // Idempotencia: descarta reintentos del mismo evento (Zernio reintenta hasta 7 veces).
  const existing = await pb
    .collection("processed_webhook_events")
    .getFirstListItem(`event_id = "${event.id}"`)
    .catch(() => null);
  if (existing) {
    return { ok: true, deduped: true };
  }

  const parsed = parseInboundMessage(event);
  const telefono = normalizePhone(parsed.telefono);
  const attachments = parsed.attachments ?? [];
  const base = {
    eventId: event.id,
    event: String(event.event ?? ""),
    accountId: parsed.accountId,
    telefono,
    direction: parsed.direction ?? null,
    hasText: Boolean(parsed.text && parsed.text.trim()),
    hasAttachments: attachments.length > 0,
    attachmentTypes: attachments.map((a) => a.type).join(","),
    payload: event as unknown,
  };

  // El primer webhook de prueba que llega al configurar es webhook.test — se
  // acepta, pero no se procesa como mensaje (y queda la traza para saberlo).
  if (event.event !== "message.received") {
    await registrarTraza(pb, { ...base, motivo: `evento:${event.event}` });
    return { ok: true, ignored: event.event };
  }

  // Guard por cuenta: descarta mensajes de cualquier cuenta que no sea la de
  // Créditos ANTES de crear lead, conversación o mensaje.
  if (deps.accountIdEsperado && parsed.accountId !== deps.accountIdEsperado) {
    await registrarTraza(pb, { ...base, motivo: "cuenta no es de creditos" });
    return { ok: true, ignored: "cuenta no es de creditos" };
  }

  if (!isValidMexicanMobile(telefono)) {
    await registrarTraza(pb, { ...base, motivo: "telefono invalido" });
    return { ok: true, ignored: "telefono invalido" };
  }

  // Un adjunto cuenta como contenido: `text: null` + audio/foto DEBE procesarse.
  const texto: string | null = parsed.text;
  if (!telefono || (!esTextoUtil(texto) && attachments.length === 0)) {
    await registrarTraza(pb, { ...base, motivo: "payload incompleto" });
    return { ok: true, ignored: "payload incompleto" };
  }

  const telefonoOk = telefono as string;

  // Marca el evento como procesado ANTES del trabajo lento (evita reintentos).
  await pb.collection("processed_webhook_events").create({ event_id: event.id });

  // Upsert lead por teléfono
  const existingLead = await pb
    .collection("leads")
    .getFirstListItem(`telefono = "${telefonoOk}"`)
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
      telefono: telefonoOk,
      nombre: parsed.nombre ?? null,
      origen: "whatsapp",
      status: "nuevo",
    });
    leadId = (newLead as { id: string }).id;
    esLeadNuevo = true;
  }

  // Upsert conversation por teléfono
  const existingConversation = await pb
    .collection("conversations")
    .getFirstListItem(`telefono = "${telefonoOk}"`)
    .catch(() => null);

  let conversationId: string;
  let botActivo = true;
  if (existingConversation) {
    conversationId = existingConversation.id;
    botActivo = Boolean(existingConversation.bot_activo);
    await pb.collection("conversations").update(conversationId, {
      zernio_conversation_id: parsed.conversationId,
      zernio_account_id: parsed.accountId,
      ...(reactivar ? { bot_activo: true, necesita_asesor: false } : {}),
    });
    if (reactivar) botActivo = true;
  } else {
    const newConversation = await pb.collection("conversations").create({
      lead: leadId,
      telefono: telefonoOk,
      canal: "whatsapp",
      bot_activo: true,
      zernio_conversation_id: parsed.conversationId,
      zernio_account_id: parsed.accountId,
    });
    conversationId = (newConversation as { id: string }).id;
    botActivo = Boolean((newConversation as { bot_activo?: boolean }).bot_activo ?? true);
  }

  // Guarda el primer adjunto (prioriza imagen) para mostrarlo en la conversación.
  const media = attachments.find((a) => a.type === "image") ?? attachments[0] ?? null;
  const mensajeCliente = (await pb.collection("messages").create({
    conversation: conversationId,
    remitente: "cliente",
    contenido: texto ?? "",
    media_url: media?.url ?? null,
    media_type: media?.type ?? null,
    created: new Date().toISOString(),
  })) as { id: string };

  await registrarTraza(pb, { ...base, motivo: "procesado" });

  if (!botActivo) {
    return { ok: true, bot: "inactivo" };
  }

  // ACK INMEDIATO: Zernio tiene un timeout corto; la ruta devuelve 200 ya y el
  // turno del bot corre en segundo plano (after()).
  deps.after(async () => {
    await procesarTurnoBot(
      {
        parsed,
        telefono: telefonoOk,
        leadId,
        conversationId,
        esLeadNuevo,
        esRecurrente,
        mensajeId: mensajeCliente.id,
      },
      {
        pb: pb as unknown as TurnoDeps["pb"],
        send: deps.send,
        runBotTurn: deps.runBotTurn,
        transcribirAudio: deps.transcribirAudio,
        notifyNeedsAdvisor: deps.notifyNeedsAdvisor,
        notifyNewLead: deps.notifyNewLead,
        notifyNewLeadToSlack: deps.notifyNewLeadToSlack,
      }
    );
  });

  return { ok: true, accepted: true };
}

function esTextoUtil(texto: string | null | undefined): boolean {
  return Boolean(texto && texto.trim());
}
