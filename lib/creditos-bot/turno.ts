import { AgendaService } from "./agenda";
import { ConversationEngine } from "./engine";
import { analyzeIncomingMessage } from "./openai-intent";
import { localNow } from "./time";
import { pideAgendar } from "@/lib/agenda";
import { pideUbicacion } from "@/lib/intenciones";
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
    const currentLead = await dependencies.leads.get(turn.leadId);
    if (currentLead.bot_activo === false) return { messages: [], escalate: false, ignored: "bot_inactive" };
    const engine = new ConversationEngine(dependencies.leads, new AgendaService(dependencies.appointments));
    const result = await engine.handle(currentLead, analysis, now, {
      pideCita: pideAgendar(turn.text),
      pideDireccion: pideUbicacion(turn.text),
    });
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

