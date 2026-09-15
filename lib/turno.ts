// Manejo determinista de un turno del bot (sin el HTTP/Signature/dedupe que vive
// en la ruta del webhook). Separado de `route.ts` para poder probarlo de punta a
// punta con adaptadores mock (PocketBase, envío, LLM, transcripción y
// notificaciones), sin duplicar la lógica en un harness. La ruta arma los
// adaptadores reales.

import {
  proximoLunes,
  diaSemanaEsp,
  fechaEsp,
  extraerHora,
  pideAgendar,
  pideReagendar,
  pareceHoraODia,
  detectarDia,
  horariosLibres,
  recortarHorasPasadas,
  hoyJuarez,
  horaLocalAUtc,
  horariosParaDia,
  horaEnHorarioDia,
} from "@/lib/agenda";
import { sanearDireccion } from "@/lib/direccion";
import { DIRECCION_OFICIAL } from "@/lib/politicas";
import {
  esPreguntaDeAsesor,
  preguntaPorSuCita,
  pideCancelarCita,
  esAfirmacion,
  esCortesia,
  nombreCorto,
  pideUbicacion,
} from "@/lib/intenciones";
import type { BotTurnResult, BotTurnResultWithError } from "@/lib/bot";
import type { ParsedInbound } from "@/lib/zernio";

/** Últimos N mensajes de contexto para el LLM (los MÁS RECIENTES, no los viejos). */
const HISTORIA_MAX_MSGS = 30;

/**
 * Adjunto de audio entrante (forma que entrega Zernio). Para WhatsApp el `url`
 * apunta al endpoint AUTENTICADO de Zernio, por eso hace falta el `mediaId`
 * (`attachments[].payload.id`) y el `accountId` para descargar los bytes.
 */
export type AudioEntrante = {
  url?: string | null;
  mediaId?: string | null;
  accountId?: string | null;
  originalType?: string | null;
};

/** Superficie mínima de PocketBase que usa el turno (fácil de mockear). */
export type TurnoPb = {
  collection(name: string): {
    getList(
      page: number,
      perPage: number,
      opts?: Record<string, unknown>
    ): Promise<{ items: unknown[] }>;
    getFullList(opts?: Record<string, unknown>): Promise<unknown[]>;
    getOne(id: string, opts?: Record<string, unknown>): Promise<unknown>;
    create(data: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown>;
    update(
      id: string,
      data: Record<string, unknown>,
      opts?: Record<string, unknown>
    ): Promise<unknown>;
    delete(id: string, opts?: Record<string, unknown>): Promise<unknown>;
  };
};

export type TurnoDeps = {
  /** Adaptador opcional para probar el despacho sin llamar servicios reales. */
  runNewEngineTurn?: typeof import("@/lib/creditos-bot/integration").runNewEngineTurn;
  /** Cliente PocketBase (admin en runtime; adaptador mock en tests). */
  pb: TurnoPb;
  /** Enviar un mensaje de WhatsApp real (Zernio). */
  send: (conversationId: string, accountId: string, text: string) => Promise<unknown>;
  /** Turno del LLM (deepseek en runtime; mock en tests). */
  runBotTurn: (
    history: { role: "user" | "assistant"; content: string }[],
    ctx?: {
      contexto?: string;
      resolveTool: (name: string, args: Record<string, unknown>) => Promise<string>;
    }
  ) => Promise<BotTurnResult>;
  /**
   * Transcribe una nota de voz entrante (STT). Recibe el adjunto de audio como
   * lo manda Zernio (url + mediaId (`payload.id`) + accountId) y devuelve el
   * texto, o null si no se pudo transcribir / no hay credencial. null => el
   * turno deriva a asesor (nunca ignora el audio ni lo trata como imagen).
   */
  transcribirAudio?: (audio: AudioEntrante) => Promise<string | null>;
  /** Aviso de "este lead/cliente necesita asesor" (push). */
  notifyNeedsAdvisor: (leadId?: string | null) => Promise<void>;
  /** Aviso de lead nuevo (push). */
  notifyNewLead: (lead: {
    nombre?: string | null;
    apellido?: string | null;
    monto_aproximado?: string | null;
  }) => Promise<void>;
  /** Aviso de lead nuevo a Slack. */
  notifyNewLeadToSlack: (p: {
    nombre: string | null;
    telefono: string;
    origen: string;
    leadId: string;
  }) => Promise<void>;
};

export type ProcesarTurnoArgs = {
  parsed: ParsedInbound;
  telefono: string;
  leadId: string;
  conversationId: string;
  esLeadNuevo: boolean;
  esRecurrente?: boolean;
  /** id del mensaje del cliente que disparó este turno (guard anti-doble-respuesta). */
  mensajeId?: string;
};

type Msg = {
  id?: string;
  remitente?: string;
  contenido?: string;
  media_type?: string | null;
  created?: string;
};

/**
 * Trabajo pesado del turno: arma el historial, corre el bot (con fallbacks
 * deterministas por código) y responde al cliente. La ruta lo ejecuta en
 * `after()` tras ACK-eear a Zernio.
 */
export async function procesarTurnoBot(
  args: ProcesarTurnoArgs,
  deps: TurnoDeps
): Promise<void> {
  const {
    parsed,
    telefono,
    leadId,
    conversationId,
    esLeadNuevo,
    esRecurrente,
    mensajeId,
  } = args;
  const {
    pb,
    send,
    runBotTurn,
    transcribirAudio,
    notifyNeedsAdvisor,
    notifyNewLead,
    notifyNewLeadToSlack,
  } = deps;
  const pbConversationId = parsed.conversationId;
  const pbAccountId = parsed.accountId;

  try {
    // Marca la conversación para intervención humana (sin tocar bot_activo).
    const marcarParaAsesor = async () => {
      await pb
        .collection("conversations")
        .update(conversationId, { necesita_asesor: true })
        .catch(() => {});
      await pb.collection("leads").update(leadId, { status: "en_seguimiento" }).catch(() => {});
    };

    // Envío CON entrega verificada: manda primero y SOLO si llegó lo persiste.
    // Nunca se guarda un mensaje del bot que no salió (defecto "envío fantasma").
    const responder = async (msg: string): Promise<boolean> => {
      const limpio = sanearDireccion(msg);
      if (pbConversationId && pbAccountId) {
        let enviado = false;
        let lastErr: unknown = null;
        for (let i = 0; i < 2 && !enviado; i++) {
          try {
            await send(pbConversationId, pbAccountId, limpio);
            enviado = true;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!enviado) {
          console.error("[turno] no se pudo entregar el mensaje:", lastErr);
          await marcarParaAsesor();
          await notifyNeedsAdvisor(leadId).catch(() => {});
          return false;
        }
      } else {
        // Sin destino (defensivo): no persistir un mensaje que nadie verá.
        await marcarParaAsesor();
        await notifyNeedsAdvisor(leadId).catch(() => {});
        return false;
      }
      await pb.collection("messages").create({
        conversation: conversationId,
        remitente: "bot",
        contenido: limpio,
        created: new Date().toISOString(),
      });
      return true;
    };

    // 0. Historial: los ÚLTIMOS N mensajes (descendente), con reintento ante un
    // fallo puntual de lectura de PocketBase.
    let latestItems: Msg[];
    try {
      const res = await pb.collection("messages").getList(1, HISTORIA_MAX_MSGS, {
        filter: `conversation = "${conversationId}"`,
        sort: "-created",
      });
      latestItems = (res.items ?? []) as Msg[];
    } catch (err) {
      console.error("[turno] error leyendo historial (1er intento):", err);
      try {
        const res = await pb.collection("messages").getList(1, HISTORIA_MAX_MSGS, {
          filter: `conversation = "${conversationId}"`,
          sort: "-created",
        });
        latestItems = (res.items ?? []) as Msg[];
      } catch (err2) {
        console.error("[turno] error leyendo historial (2do intento):", err2);
        // No podemos saber el contexto: respondemos honesto y derivamos.
        await responder(
          "Permítame un momento. Estoy teniendo una dificultad técnica para ver su historial; un asesor le responde por aquí en un momento."
        );
        await marcarParaAsesor();
        await notifyNeedsAdvisor(leadId).catch(() => {});
        return;
      }
    }

    // Guard anti-doble-respuesta: si el mensaje más reciente ya NO es el que
    // disparó este turno, sobra. (Reutilizable para re-verificar tras el LLM.)
    const esObsoleto = async (): Promise<boolean> => {
      if (!mensajeId) return false;
      const ultimo = await pb
        .collection("messages")
        .getList(1, 1, {
          filter: `conversation = "${conversationId}"`,
          sort: "-created",
        })
        .catch(() => null);
      const masReciente = (ultimo?.items ?? [])[0] as { id?: string } | undefined;
      return Boolean(masReciente?.id && masReciente.id !== mensajeId);
    };

    if (await esObsoleto()) {
      console.log("[turno] turno obsoleto, lo maneja el mensaje más reciente");
      return;
    }

    // Datos actuales del lead + textos que usan los manejadores deterministas.
    const lead0 = (await pb.collection("leads").getOne(leadId).catch(() => null)) as
      | { nombre?: string; institucion?: string }
      | null;
    const nombre0 = String(lead0?.nombre ?? parsed.nombre ?? "").trim();
    const DIR_OFICIAL = DIRECCION_OFICIAL;
    const corto0 = nombreCorto(String(lead0?.nombre ?? "").trim()) || nombreCorto(nombre0);
    const leadActual = lead0;
    const nombreLead = String(lead0?.nombre ?? parsed.nombre ?? "").trim();

    // 1. AUDIO: si el mensaje es una nota de voz sin texto, transcribimos. La
    // transcripción es texto del cliente; si falla, derivamos a asesor (nunca
    // la tratamos como imagen ni la ignoramos).
    // OJO: el `url` del adjunto entrante de WhatsApp NO es público — apunta al
    // endpoint autenticado de Zernio —, así que se pasan también mediaId y
    // accountId para que el STT descargue los bytes con la credencial.
    let textoHoy = String(parsed.text ?? "").trim();
    const esAudio = (t: string, original?: string | null) =>
      /^(audio|voice|ptt|ogg|opus)$/i.test(t || "") || /^(audio|voice)$/i.test(original || "");
    const audioAtt = (parsed.attachments ?? []).find((a) =>
      esAudio(a.type, a.originalType ?? null)
    );
    if (!textoHoy && audioAtt) {
      const fuente: AudioEntrante = {
        url: audioAtt.url ?? null,
        mediaId: audioAtt.payload?.id ?? null,
        accountId: pbAccountId,
        originalType: audioAtt.originalType ?? null,
      };
      let transcripcion: string | null = null;
      if (transcribirAudio && (fuente.url || fuente.mediaId)) {
        try {
          transcripcion = await transcribirAudio(fuente);
        } catch (err) {
          // Un STT que revienta no puede tumbar el turno: se trata como fallo.
          console.error("[turno] error transcribiendo la nota de voz:", err);
          transcripcion = null;
        }
      }
      if (transcripcion && transcripcion.trim()) {
        textoHoy = transcripcion.trim();
        // Persistir el texto utilizable para que turnos futuros lo lean.
        if (mensajeId) {
          await pb
            .collection("messages")
            .update(mensajeId, { contenido: textoHoy, media_type: "audio" })
            .catch(() => {});
        }
        // Reflejarlo también en el historial de ESTE turno.
        for (const m of latestItems) {
          if (m.id === mensajeId) {
            m.contenido = textoHoy;
            m.media_type = "audio";
          }
        }
      } else {
        // STT falló o no hay credencial: marcar no transcrito y derivar a asesor.
        console.error(
          "[turno] no se pudo transcribir la nota de voz; se deriva a asesor",
          fuente.mediaId ? `(mediaId presente)` : "(sin mediaId ni url utilizables)"
        );
        await responder(
          `Con gusto${corto0 ? `, ${corto0}` : ""}. Le pido una disculpa, no logré escuchar su nota de voz. Un asesor le responde por aquí en un momento.`
        );
        await marcarParaAsesor();
        await notifyNeedsAdvisor(leadId).catch(() => {});
        return;
      }
    }

    // Historial en orden cronológico (ascendente), con clasificación correcta
    // del media: audio transcrito = texto del cliente; imagen = foto; etc.
    const history = latestItems
      .slice()
      .reverse()
      .filter((m) => m.remitente !== "asesor")
      .map((m) => {
        const role = (m.remitente === "cliente" ? "user" : "assistant") as "user" | "assistant";
        const content = m.contenido ?? "";
        const mt = m.media_type;
        if (mt === "image") {
          return { role, content: `[El cliente envió una foto${content ? ` con el mensaje: ${content}` : ""}]` };
        }
        if (mt === "audio") {
          return { role, content: content.trim() ? content : "[El cliente envió una nota de voz sin transcribir]" };
        }
        if (mt) {
          return { role, content: `[El cliente envió un archivo ${mt}${content ? ` con el mensaje: ${content}` : ""}]` };
        }
        return { role, content };
      });

    // Comparte la transcripción y el historial con el motor nuevo antes de los
    // manejadores viejos. Una falla nunca vuelve a ejecutar efectos en otro motor.
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
      try {
        const runNewEngineTurn = deps.runNewEngineTurn ?? (await import("@/lib/creditos-bot/integration")).runNewEngineTurn;
        await runNewEngineTurn({
          leadId, conversationId,
          conversationZernioId: pbConversationId ?? conversationId,
          accountId: pbAccountId ?? "",
          messageId: mensajeId ?? "",
          text: textoHoy,
          history: history.slice(0, -1),
        });
      } catch (err) {
        console.error("[turno] error en el motor nuevo; requiere asesor:", err);
        await marcarParaAsesor();
        await notifyNeedsAdvisor(leadId).catch(() => {});
      }
      return;
    }

    // ¿Primer mensaje del bot en esta conversación? (el saludo va fijo)
    const esPrimerTurno = !latestItems.some((m) => m.remitente === "bot");

    // MANEJADOR 0 — PETICIÓN COMPUESTA: pedir asesor Y la dirección se atiende
    // completa (no se pierde la solicitud humana).
    if (esPreguntaDeAsesor(textoHoy) && pideUbicacion(textoHoy)) {
      const msg = esPrimerTurno
        ? `¡Hola! Buen día 👋 Le saluda Créditos a tu medida. Estamos en ${DIR_OFICIAL}. Y con gusto, esa información se la da directamente un asesor para que sea exacta; permítame comunicarlo, en un momento le responden por aquí.`
        : `Con gusto${corto0 ? `, ${corto0}` : ""}. Estamos en ${DIR_OFICIAL}. Y esa información se la da directamente un asesor para que sea exacta; permítame comunicarlo, en un momento le responden por aquí.`;
      await responder(msg);
      await marcarParaAsesor();
      await notifyNeedsAdvisor(leadId).catch(() => {});
      return;
    }

    // MANEJADOR 0 — PREGUNTA QUE SOLO UN ASESOR PUEDE CONTESTAR (BLOQUE 8).
    if (esPreguntaDeAsesor(textoHoy)) {
      const msg = esPrimerTurno
        ? "¡Hola! Buen día 👋 Le saluda Créditos a tu medida. Con gusto, esa información se la da directamente un asesor para que sea exacta. Permítame comunicarlo, en un momento le responden por aquí."
        : `Con gusto${corto0 ? `, ${corto0}` : ""}. Esa información se la da directamente un asesor para que sea exacta. Permítame comunicarlo, en un momento le responden por aquí.`;
      await responder(msg);
      await marcarParaAsesor();
      await notifyNeedsAdvisor(leadId).catch(() => {});
      return;
    }

    // MANEJADOR 0A — CANCELAR / CAMBIAR cita (antes que "pregunta por su cita",
    // que antes se tragaba "mi cita" y confirmaba la cita vieja).
    const quiereCancelar = pideCancelarCita(textoHoy);
    const quiereReagendar = pideReagendar(textoHoy);
    if (quiereCancelar || quiereReagendar) {
      const susCitas = (await pb
        .collection("citas")
        .getFullList({ filter: `lead = "${leadId}"` })
        .catch(() => [])) as unknown as { id?: string; fecha?: string }[];
      const cita = susCitas.find((c) => c.fecha);
      if (quiereCancelar) {
        if (cita?.id) {
          await pb.collection("citas").delete(cita.id).catch((e) => {
            console.error("[turno] error cancelando cita:", e);
          });
        }
        await responder(
          "Sin problema, queda cancelada. Cuando guste la reagendamos, aquí estoy. ¡Que tenga excelente día!"
        );
        return;
      }
      // quiereReagendar: intenta la vía determinista (actualiza la cita existente).
      const respAgenda = await intentarAgendarDeterminista(
        textoHoy,
        nombreLead,
        leadActual,
        corto0,
        telefono,
        pb,
        leadId,
        DIR_OFICIAL,
        true
      );
      if (respAgenda) {
        await responder(respAgenda);
      } else {
        await responder(`Claro${corto0 ? `, ${corto0}` : ""}, ¿para qué día y hora le gustaría la nueva cita?`);
      }
      return;
    }

    // MANEJADOR 0B — el cliente pregunta por SU cita (día, hora, si sigue en pie).
    if (preguntaPorSuCita(textoHoy)) {
      const susCitas = (await pb
        .collection("citas")
        .getFullList({ filter: `lead = "${leadId}"` })
        .catch(() => [])) as unknown as { fecha?: string }[];
      const cita = susCitas.find((c) => c.fecha);
      if (cita?.fecha) {
        const d = new Date(cita.fecha);
        const fechaLocal = new Intl.DateTimeFormat("es-MX", {
          timeZone: "America/Ciudad_Juarez",
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(d);
        const horaLocal = new Intl.DateTimeFormat("es-MX", {
          timeZone: "America/Ciudad_Juarez",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(d);
        await responder(
          `Su cita está agendada para el ${fechaLocal} a las ${horaLocal}, ${corto0 || "gracias"}. 📍 ${DIR_OFICIAL}. Un asesor le estará esperando. Si necesita cambiarla, solo escríbame por aquí.`
        );
        return;
      }
      // Sin cita aún: se ofrece agendar (el flujo determinista de abajo).
    }

    // MANEJADOR: el cliente pregunta por la ubicación/dirección → responde directo.
    if (pideUbicacion(textoHoy)) {
      const msg = `Claro${corto0 ? `, ${corto0}` : ""}. Estamos en ${DIR_OFICIAL}. Le esperamos. ¿Le ayudo a agendar su cita?`;
      await responder(msg);
      return;
    }

    // ¿El último mensaje del bot ofreció agendar / dio horarios? Sirve para
    // interpretar un "sí" del cliente como "sí, agéndeme".
    const ultimoBot = latestItems.find((m) => m.remitente === "bot") as
      | { contenido?: string }
      | undefined;
    const botOfrecioCita =
      /(cu[aá]l le acomoda|tengo disponible a las|le ayudo a agendar|agendemos su cita|para su cita el|qu[eé] d[ií]a y hora|agendo su cita)/i.test(
        String(ultimoBot?.contenido ?? "")
      );

    // SALUDO FIJO en el primer turno (el LLM alucina el nombre comercial).
    let esSesionNueva = esPrimerTurno;
    if (!esPrimerTurno && esRecurrente) {
      const items = latestItems as { created?: string }[];
      const ultimo = items
        .map((m) => (m.created ? new Date(m.created).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      if (ultimo && Date.now() - ultimo > 6 * 60 * 60 * 1000) esSesionNueva = true;
    }
    if (esSesionNueva) {
      let nombreCliente = "";
      if (esRecurrente) {
        const l = (await pb.collection("leads").getOne(leadId).catch(() => null)) as
          | { nombre?: string }
          | null;
        nombreCliente = String(l?.nombre ?? "").trim();
      }
      const saludo =
        esRecurrente && nombreCliente
          ? `¡Hola de nuevo, ${nombreCliente}! 👋 Le saluda Créditos a tu medida. Qué gusto que se comunique otra vez. Ya tengo sus datos registrados, así que podemos ir directo. ¿En qué le puedo ayudar hoy?`
          : "¡Hola! Buen día 👋 Le saluda Créditos a tu medida. Con gusto le ayudo con su información de préstamo. ¿Me regala su nombre completo, por favor?";
      await responder(saludo);
      if (esLeadNuevo) {
        await notifyNewLeadToSlack({
          nombre: parsed.nombre ?? null,
          telefono,
          origen: "whatsapp",
          leadId,
        }).catch(() => {});
        await notifyNewLead({
          nombre: parsed.nombre ?? null,
          apellido: null,
          monto_aproximado: null,
        }).catch(() => {});
      }
      return;
    }

    const botResult = await runBotTurn(history, {
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
      console.error("[turno] error en runBotTurn:", err);
      return {
        reply: null,
        escalate: false,
        leadData: null,
        cita: null,
        botError: true,
      } as BotTurnResultWithError;
    });

    // RE-VERIFICACIÓN de obsolescencia/takeover ANTES de efectos y envío: si
    // llegó un mensaje nuevo o un asesor tomó la conversación durante el await
    // del LLM, este turno sobra.
    if (await esObsoleto()) {
      console.log("[turno] turno quedó obsoleto durante el LLM, se descarta");
      return;
    }
    const convTrasLlm = (await pb
      .collection("conversations")
      .getOne(conversationId)
      .catch(() => null)) as { necesita_asesor?: boolean; bot_activo?: boolean } | null;
    if (convTrasLlm && (convTrasLlm.necesita_asesor || convTrasLlm.bot_activo === false)) {
      console.log("[turno] asesor tomó la conversación durante el await, se descarta");
      return;
    }

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

    // Cita agendada por el bot -> colección `citas`.
    if (botResult.cita) {
      const fecha = botResult.cita.fecha;
      const hora = botResult.cita.hora || "12:00";
      const iso = horaLocalAUtc(fecha, hora.length === 5 ? hora : "12:00");
      try {
        const existing = await pb
          .collection("citas")
          .getFullList({ filter: `lead = "${leadId}"` })
          .catch(() => [] as unknown as { id: string }[]);
        if ((existing as { id: string }[]).length > 0) {
          const citaId = (existing as { id: string }[])[0].id;
          await pb.collection("citas").update(citaId, {
            titulo: botResult.cita.titulo || `Cita préstamo — ${parsed.nombre ?? ""}`,
            fecha: iso,
            notas: botResult.cita.notas ?? null,
          });
        } else {
          await pb.collection("citas").create({
            lead: leadId,
            titulo: botResult.cita.titulo || `Cita préstamo — ${parsed.nombre ?? ""}`,
            fecha: iso,
            tipo: "cita",
            notas: botResult.cita.notas ?? null,
            asignado_a: null,
          });
        }
      } catch (err) {
        console.error("Error creando/actualizando cita:", err);
      }
    }

    const resultWithError = botResult as BotTurnResultWithError;
    const botFallo = resultWithError.botError || !botResult.reply || !botResult.reply.trim();

    const textoCliente = textoHoy;

    try {
      if (botFallo) {
        // FALLO TÉCNICO ≠ CONSENTIMIENTO: nunca agendar/ofrecer cita por defecto.
        // Solo se agenda si el cliente lo pidió explícitamente.
        if (pideAgendar(textoCliente) || pideReagendar(textoCliente)) {
          const respAgenda = await intentarAgendarDeterminista(
            textoCliente,
            nombreLead,
            leadActual,
            corto0,
            telefono,
            pb,
            leadId,
            DIR_OFICIAL,
            true
          );
          if (respAgenda) {
            await responder(respAgenda);
            return;
          }
        }
        if (esCortesia(textoCliente)) {
          await responder(`Con mucho gusto${corto0 ? `, ${corto0}` : ""}. Quedo a sus órdenes.`);
        } else {
          await responder(
            `Permítame un momento${corto0 ? `, ${corto0}` : ""}. Estoy revisando su información con el equipo; un asesor le responde por aquí en un momento.`
          );
          await marcarParaAsesor();
          await notifyNeedsAdvisor(leadId).catch(() => {});
        }
      } else {
        // Turno normal con respuesta del LLM. Cuando el cliente pide agendar,
        // SIEMPRE forzamos el flujo determinista por código.
        const leadListo = String(leadActual?.institucion ?? "").trim() !== "";
        const forzarAgenda =
          pideAgendar(textoCliente) ||
          pideReagendar(textoCliente) ||
          (leadListo && pareceHoraODia(textoCliente)) ||
          (esAfirmacion(textoCliente) && botOfrecioCita);
        if (forzarAgenda) {
          const respAgenda = await intentarAgendarDeterminista(
            textoCliente,
            nombreLead,
            leadActual,
            corto0,
            telefono,
            pb,
            leadId,
            DIR_OFICIAL,
            true
          );
          if (respAgenda) {
            await responder(respAgenda);
            return;
          }
        }
        await responder(botResult.reply!);
        if (botResult.escalate) {
          await marcarParaAsesor();
          await notifyNeedsAdvisor(leadId);
        }
      }
    } catch (err) {
      console.error("[turno] error enviando respuesta, se intenta fallback:", err);
      // responder() ya deriva a asesor si el envío falla; aquí solo aseguramos
      // la marca (idempotente).
      await marcarParaAsesor();
      await notifyNeedsAdvisor(leadId).catch(() => {});
    }

    if (esLeadNuevo) {
      await notifyNewLeadToSlack({
        nombre: parsed.nombre ?? null,
        telefono,
        origen: "whatsapp",
        leadId,
      }).catch(() => {});
      await notifyNewLead({
        nombre: parsed.nombre ?? null,
        apellido: null,
        monto_aproximado: null,
      }).catch(() => {});
    }
  } catch (err) {
    console.error("[turno] error fatal en procesarTurnoBot:", err);
  }
}

/**
 * Agendado determinista (fallback por código, sin LLM). Devuelve el texto a
 * enviar o null. `forzar` permite usarlo sin `pideAgendar` (reagendar o el
 * fallback). Extraído a función para reutilizarlo en cancelar/cambiar y en el
 * fallback honesto.
 */
async function intentarAgendarDeterminista(
  textoCliente: string,
  nombreLead: string,
  leadActual: { nombre?: string; institucion?: string } | null,
  corto0: string,
  telefono: string,
  pb: TurnoPb,
  leadId: string,
  DIR_OFICIAL: string,
  forzar: boolean
): Promise<string | null> {
  if (!nombreLead) return null;
  if (!forzar && !pideAgendar(textoCliente)) return null;

  const hoy = hoyJuarez();
  const horaPedida = extraerHora(textoCliente);
  const fechaPedida = detectarDia(textoCliente);

  const leerOcupadas = async (fecha: string): Promise<string[]> => {
    const occ = await pb
      .collection("citas")
      .getFullList({ filter: `fecha ~ "${fecha}"` })
      .catch(() => []);
    return (occ as unknown as { fecha?: string }[])
      .map((c) => c.fecha?.slice(11, 16))
      .filter(Boolean) as string[];
  };

  const filtrarLibres = (libres: string[], fecha: string): string[] => {
    let out = libres;
    if (fecha === hoy.iso) out = recortarHorasPasadas(out, hoy.hora);
    return out.slice(0, 2);
  };

  const cortoDe = (n: string) => nombreCorto(n) || n;

  // Caso 1: el cliente dio una hora concreta (con o sin día).
  if (horaPedida) {
    const fecha = fechaPedida ?? proximoLunes();
    if (fecha === hoy.iso && horaPedida <= hoy.hora) {
      const ocupadas = await leerOcupadas(fecha);
      const libres = filtrarLibres(horariosLibres(ocupadas, fecha), fecha);
      if (libres.length === 0) return null;
      return `Esa hora ya pasó hoy. Le puedo ofrecer las ${libres[0]} o las ${libres[1]} de hoy. 📍 ${DIR_OFICIAL}.`;
    }
    if (!horaEnHorarioDia(fecha, horaPedida)) {
      const slots = horariosParaDia(fecha);
      const ocupadasG = await leerOcupadas(fecha);
      const libresG = filtrarLibres(horariosLibres(ocupadasG, fecha), fecha);
      if (libresG.length === 0) return null;
      return `A esa hora no tenemos cita, ${cortoDe(nombreLead)}. Atendemos de ${slots[0]} a ${slots[slots.length - 1]}. Le puedo ofrecer las ${libresG[0]} o las ${libresG[1]} del ${diaSemanaEsp(fecha)}. 📍 ${DIR_OFICIAL}.`;
    }
    const ocupadas = await leerOcupadas(fecha);
    if (!ocupadas.includes(horaPedida)) {
      const iso = horaLocalAUtc(fecha, horaPedida);
      try {
        const existing = await pb
          .collection("citas")
          .getFullList({ filter: `lead = "${leadId}"` })
          .catch(() => [] as unknown as { id: string }[]);
        if ((existing as { id: string }[]).length > 0) {
          const citaId = (existing as { id: string }[])[0].id;
          await pb.collection("citas").update(citaId, {
            titulo: `Cita préstamo — ${nombreLead} — ${String(leadActual?.institucion ?? "")}`,
            fecha: iso,
            notas: `Reagendada por código. Tel: ${telefono}`,
          });
        } else {
          await pb.collection("citas").create({
            lead: leadId,
            titulo: `Cita préstamo — ${nombreLead} — ${String(leadActual?.institucion ?? "")}`,
            fecha: iso,
            tipo: "cita",
            notas: `Agendada por código (fallback determinista). Tel: ${telefono}`,
            asignado_a: null,
          });
        }
      } catch (err) {
        console.error("[turno] error creando/actualizando cita determinista:", err);
        return null;
      }
      return `¡Listo, ${cortoDe(nombreLead)}! Su cita queda confirmada: 📅 ${fechaEsp(fecha)} a las ${horaPedida} 📍 ${DIR_OFICIAL}. Un asesor lo estará esperando. Si necesita cambiar la cita, solo escríbame por aquí.`;
    }
    const libres = filtrarLibres(horariosLibres(ocupadas, fecha), fecha);
    if (libres.length === 0) return null;
    return `A esa hora ya está apartado. Le puedo ofrecer las ${libres[0]} o las ${libres[1]} el ${diaSemanaEsp(fecha)} ${fecha.slice(8, 10)}. 📍 ${DIR_OFICIAL}.`;
  }

  // Caso 2: pidió agendar sin hora concreta ni día → por defecto el lunes.
  const fecha = fechaPedida ?? proximoLunes();
  const ocupadas = await leerOcupadas(fecha);
  const libres = filtrarLibres(horariosLibres(ocupadas, fecha), fecha);
  if (libres.length === 0) return null;
  const finSemana = fecha === hoy.iso ? " hoy" : ` el ${fechaEsp(fecha)}`;
  return `Claro, ${cortoDe(nombreLead)}. Para su cita${finSemana} tengo disponible a las ${libres[0]} o a las ${libres[1]}. ¿Cuál le acomoda? 📍 Estamos en ${DIR_OFICIAL}.`;
}
