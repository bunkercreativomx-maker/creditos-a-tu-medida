// Manejo determinista de un turno del bot (sin el HTTP/Signature/dedupe que vive
// en la ruta del webhook). Separado de `route.ts` para poder probarlo de punta a
// punta con adaptadores mock (PocketBase, envío, LLM y notificaciones), sin
// duplicar la lógica en un harness. La ruta arma los adaptadores reales.

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
  esAfirmacion,
  esCortesia,
  nombreCorto,
  pideUbicacion,
} from "@/lib/intenciones";
import type { BotTurnResult, BotTurnResultWithError } from "@/lib/bot";
import type { ParsedInbound } from "@/lib/zernio";

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
  };
};

export type TurnoDeps = {
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
  const { pb, send, runBotTurn, notifyNeedsAdvisor, notifyNewLead, notifyNewLeadToSlack } =
    deps;
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

    // GUARD ANTI-DOBLE-RESPUESTA: si el cliente mandó otro mensaje (o ya hay
    // respuesta del bot) después del que disparó este turno, este turno sobra.
    if (mensajeId) {
      const ultimo = await pb
        .collection("messages")
        .getList(1, 1, {
          filter: `conversation = "${conversationId}"`,
          sort: "-created",
        })
        .catch(() => null);
      const masReciente = (ultimo?.items ?? [])[0] as { id?: string } | undefined;
      if (masReciente?.id && masReciente.id !== mensajeId) {
        console.log("[turno] turno obsoleto, lo maneja el mensaje más reciente");
        return;
      }
    }

    // Datos actuales del lead + textos que usan los manejadores deterministas.
    const lead0 = await pb.collection("leads").getOne(leadId).catch(() => null);
    const nombre0 = String((lead0 as { nombre?: string } | null)?.nombre ?? parsed.nombre ?? "").trim();
    const textoHoy = String(parsed.text ?? "").trim();
    const DIR_OFICIAL = DIRECCION_OFICIAL;
    // Nombre corto (un cliente se llama "José Antonio Hernández Vázquez" y el
    // bot repetía el nombre completo en CADA mensaje).
    const corto0 =
      nombreCorto(String((lead0 as { nombre?: string } | null)?.nombre ?? "").trim()) ||
      nombreCorto(nombre0);
    // Responde por WhatsApp y guarda el mensaje. Un solo camino para todos los
    // manejadores deterministas.
    const responder = async (msg: string) => {
      const limpio = sanearDireccion(msg);
      await pb.collection("messages").create({
        conversation: conversationId,
        remitente: "bot",
        contenido: limpio,
        created: new Date().toISOString(),
      });
      if (pbConversationId && pbAccountId) {
        await send(pbConversationId, pbAccountId, limpio).catch(() => {});
      }
    };

    // ¿Primer mensaje del bot en esta conversación? (el saludo va fijo)
    const esPrimerTurno = !(recentMessages.items ?? []).some(
      (m) => (m as { remitente?: string }).remitente === "bot"
    );

    // MANEJADOR 0 — PREGUNTA QUE SOLO UN ASESOR PUEDE CONTESTAR (BLOQUE 8).
    if (esPreguntaDeAsesor(textoHoy) && !pideUbicacion(textoHoy)) {
      const msg = esPrimerTurno
        ? "¡Hola! Buen día 👋 Le saluda Créditos a tu medida. Con gusto, esa información se la da directamente un asesor para que sea exacta. Permítame comunicarlo, en un momento le responden por aquí."
        : `Con gusto${corto0 ? `, ${corto0}` : ""}. Esa información se la da directamente un asesor para que sea exacta. Permítame comunicarlo, en un momento le responden por aquí.`;
      await responder(msg);
      await pb
        .collection("conversations")
        .update(conversationId, { necesita_asesor: true })
        .catch(() => {});
      await pb.collection("leads").update(leadId, { status: "en_seguimiento" }).catch(() => {});
      await notifyNeedsAdvisor(leadId).catch(() => {});
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
    // interpretar un "sí" del cliente como "sí, agéndeme". (El bot ya NO pide
    // identificadores — ver política de minimización en lib/politicas.ts.)
    const ultimoBot = [...(recentMessages.items ?? [])]
      .reverse()
      .find((m) => (m as { remitente?: string }).remitente === "bot") as
      | { contenido?: string }
      | undefined;
    const botOfrecioCita =
      /(cu[aá]l le acomoda|tengo disponible a las|le ayudo a agendar|agendemos su cita|para su cita el|qu[eé] d[ií]a y hora|agendo su cita)/i.test(
        String(ultimoBot?.contenido ?? "")
      );

    // SALUDO FIJO en el primer turno (el LLM alucina el nombre comercial).
    let esSesionNueva = esPrimerTurno;
    if (!esPrimerTurno && esRecurrente) {
      const items = (recentMessages.items ?? []) as unknown as { created?: string }[];
      const ultimo = items
        .map((m) => (m.created ? new Date(m.created).getTime() : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      if (ultimo && Date.now() - ultimo > 6 * 60 * 60 * 1000) esSesionNueva = true;
    }
    if (esSesionNueva) {
      let nombreCliente = "";
      if (esRecurrente) {
        const l = await pb.collection("leads").getOne(leadId).catch(() => null);
        nombreCliente = String((l as { nombre?: string } | null)?.nombre ?? "").trim();
      }
      const saludo =
        esRecurrente && nombreCliente
          ? `¡Hola de nuevo, ${nombreCliente}! 👋 Le saluda Créditos a tu medida. Qué gusto que se comunique otra vez. Ya tengo sus datos registrados, así que podemos ir directo. ¿En qué le puedo ayudar hoy?`
          : "¡Hola! Buen día 👋 Le saluda Créditos a tu medida. Con gusto le ayudo con su información de préstamo. ¿Me regala su nombre completo, por favor?";
      await pb.collection("messages").create({
        conversation: conversationId,
        remitente: "bot",
        contenido: saludo,
        created: new Date().toISOString(),
      });
      if (pbConversationId && pbAccountId) {
        try {
          await send(pbConversationId, pbAccountId, saludo);
        } catch (e) {
          console.error("[turno] fallo enviando saludo fijo:", e);
          await pb
            .collection("conversations")
            .update(conversationId, { bot_activo: false, necesita_asesor: true })
            .catch(() => {});
          await pb
            .collection("leads")
            .update(leadId, { status: "en_seguimiento" })
            .catch(() => {});
        }
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

    const marcarParaAsesor = async () => {
      await pb
        .collection("conversations")
        .update(conversationId, { necesita_asesor: true })
        .catch(() => {});
      await pb.collection("leads").update(leadId, { status: "en_seguimiento" }).catch(() => {});
    };

    const enviarMensajeBot = async (texto: string) => {
      if (!pbConversationId || !pbAccountId) throw new Error("sin destino para enviar");
      const textoLimpio = sanearDireccion(texto);
      await send(pbConversationId, pbAccountId, textoLimpio);
      await pb.collection("messages").create({
        conversation: conversationId,
        remitente: "bot",
        contenido: textoLimpio,
        created: new Date().toISOString(),
      });
    };

    const leadActual = await pb
      .collection("leads")
      .getOne(leadId)
      .catch(() => null) as unknown as { nombre?: string; institucion?: string } | null;
    const nombreLead = String(
      leadActual?.nombre ?? parsed.nombre ?? ""
    ).trim();

    const cierreB = `Perfecto, ${nombreLead}. Ya quedó registrada su información. Un asesor se pondrá en contacto con usted lo antes posible para darle todos los detalles. Quedo pendiente por aquí por cualquier cosa. ¡Excelente día!`
      .replace(/\s+/g, " ")
      .trim();

    // ===== AGENDADO DETERMINISTA (fallback si Gemini no agenda) =====
    const textoCliente = String(parsed.text ?? "").trim();

    const cortoDe = (n: string) => nombreCorto(n) || n;

    const intentarAgendarDeterminista = async (forzar = false): Promise<string | null> => {
      if (!nombreLead) return null;
      if (!forzar && !pideAgendar(textoCliente)) return null;

      // MINIMIZACIÓN DE DATOS: no se pide identificador antes de agendar.
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
    };

    try {
      if (botFallo) {
        const respAgenda = await intentarAgendarDeterminista(true);
        if (respAgenda) {
          await enviarMensajeBot(respAgenda);
        } else if (esCortesia(textoCliente)) {
          await enviarMensajeBot(`Con mucho gusto${corto0 ? `, ${corto0}` : ""}. Quedo a sus órdenes.`);
        } else {
          await enviarMensajeBot(
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
          const respAgenda = await intentarAgendarDeterminista(true);
          if (respAgenda) {
            await enviarMensajeBot(respAgenda);
            return;
          }
        }
        await enviarMensajeBot(botResult.reply!);
        if (botResult.escalate) {
          await marcarParaAsesor();
          await notifyNeedsAdvisor(leadId);
        }
      }
    } catch (err) {
      console.error("[turno] error enviando respuesta, se intenta fallback:", err);
      try {
        if (pbConversationId && pbAccountId) {
          await send(pbConversationId, pbAccountId, cierreB).catch((e2) => {
            console.error("[turno] fallback de envío también falló:", e2);
          });
        }
      } finally {
        await marcarParaAsesor();
      }
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