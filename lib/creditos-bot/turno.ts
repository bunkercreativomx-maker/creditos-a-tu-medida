import { AgendaService } from "./agenda";
import { ConversationEngine } from "./engine";
import { analyzeIncomingMessage } from "./openai-intent";
import { localNow } from "./time";
import type { AppointmentRepository, IncomingTurn, LeadRepository, TurnResult } from "./types";

export async function processIncomingTurn(
  turn: IncomingTurn,
  dependencies: { leads: LeadRepository; appointments: AppointmentRepository },
): Promise<TurnResult> {
  const lead = await dependencies.leads.get(turn.leadId);
  if (lead.bot_activo === false) return { messages: [], escalate: false, ignored: "bot_inactive" };
  if (!(await dependencies.leads.isLatestInboundMessage(turn.leadId, turn.messageId))) {
    return { messages: [], escalate: false, ignored: "obsolete_message" };
  }

  const now = turn.now ?? new Date();
  try {
    const analysis = await analyzeIncomingMessage({
      text: turn.text,
      lead,
      history: turn.history,
      localNow: localNow(now),
    });
    // Segundo guard: evita responder a un mensaje viejo mientras OpenAI procesaba.
    if (!(await dependencies.leads.isLatestInboundMessage(turn.leadId, turn.messageId))) {
      return { messages: [], escalate: false, ignored: "obsolete_message" };
    }
    const engine = new ConversationEngine(dependencies.leads, new AgendaService(dependencies.appointments));
    const result = await engine.handle(lead, analysis, now);
    await dependencies.leads.update(turn.leadId, { ultimo_mensaje_procesado: turn.messageId });
    return result;
  } catch (error) {
    console.error("[creditos-bot] Falló el turno:", error);
    return {
      messages: ["Permítame un momento. Voy a comunicarlo con un asesor para continuar con su atención."],
      escalate: true,
    };
  }
}

