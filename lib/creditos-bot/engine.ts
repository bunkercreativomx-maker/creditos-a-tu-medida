import { AgendaService } from "./agenda";
import * as msg from "./messages";
import { isEligibleDependency } from "./policy";
import { formatLocalAppointment } from "./time";
import type { LeadData, LeadRepository, MessageAnalysis, TurnResult } from "./types";

function cleanText(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 160) : null;
}

function extractedPatch(a: MessageAnalysis): Partial<LeadData> {
  const e = a.extracted;
  const patch: Partial<LeadData> = {};
  if (cleanText(e.nombre)) {
    patch.nombre = cleanText(e.nombre);
    patch.nombre_confirmado = true;
  }
  if (e.estatus) patch.estatus = e.estatus;
  if (e.dependencia) patch.dependencia = e.dependencia;
  if (e.dependencia_otra) patch.dependencia_otra = cleanText(e.dependencia_otra);
  if (e.monto_solicitado) patch.monto_solicitado = cleanText(e.monto_solicitado);
  if (e.credito_vigente) patch.credito_vigente = e.credito_vigente;
  if (e.empresa_credito) patch.empresa_credito = cleanText(e.empresa_credito);
  if (e.antiguedad_credito) patch.antiguedad_credito = cleanText(e.antiguedad_credito);
  if (e.credito_vigente === "no") {
    patch.empresa_credito = null;
    patch.antiguedad_credito = null;
  }
  return patch;
}

export class ConversationEngine {
  private readonly leads: LeadRepository;
  private readonly agenda: AgendaService;

  constructor(leads: LeadRepository, agenda: AgendaService) {
    this.leads = leads;
    this.agenda = agenda;
  }

  async handle(
    leadBefore: LeadData,
    analysis: MessageAnalysis,
    now = new Date(),
    request: { pideCita?: boolean; pideDireccion?: boolean } = {},
  ): Promise<TurnResult> {
    const lang = analysis.language;
    if (analysis.sensitive_data_detected) return { messages: [msg.sensitive(lang)], escalate: false };

    const patch = extractedPatch(analysis);
    let lead = Object.keys(patch).length ? await this.leads.update(leadBefore.id, patch) : leadBefore;

    if (analysis.needs_human || analysis.intent === "hablar_con_persona" || analysis.intent === "pregunta_restringida") {
      return { messages: [analysis.intent === "pedir_direccion" ? `${msg.addressOnly()}\n\n${msg.advisor(lang)}` : msg.advisor(lang)], escalate: true, leadPatch: patch };
    }
    const pideDireccion = request.pideDireccion || analysis.intent === "pedir_direccion";
    const pideCita = request.pideCita || analysis.intent === "pedir_cita";
    if (pideDireccion && !pideCita) {
      return { messages: [msg.addressOnly()], escalate: false, leadPatch: patch };
    }
    const conDireccion = (message: string) => pideDireccion ? `${msg.addressOnly()}\n\n${message}` : message;

    if (analysis.intent === "cancelar_cita") {
      try {
        const cancelled = await this.agenda.cancelFutureForLead(lead.id, now);
        return { messages: [cancelled
          ? (lang === "en" ? "No problem, your appointment has been canceled." : "Sin problema, queda cancelada. Cuando guste la reagendamos.")
          : (lang === "en" ? "I do not see a future appointment to cancel." : "No encuentro una cita futura para cancelar.")], escalate: false };
      } catch {
        return { messages: [msg.advisor(lang)], escalate: true };
      }
    }

    if (analysis.intent === "consultar_cita") {
      const appointment = await this.agenda.findFutureForLead(lead.id, now);
      return appointment
        ? { messages: [msg.appointmentInfo(formatLocalAppointment(appointment.fecha).label, lang)], escalate: false }
        : { messages: [msg.askDay(lang)], escalate: false };
    }

    if (lead.estatus === "ninguno" || lead.dependencia === "otra" || (lead.dependencia && !isEligibleDependency(lead.dependencia))) {
      return { messages: [msg.notEligible(lead, lang)], escalate: false, leadPatch: patch };
    }

    // Si ya hay una duda pendiente para el asesor y el cliente pide una cita,
    // no lo regresamos a la pregunta que provocó el escalamiento (por ejemplo,
    // "¿cuánto desea?"). Atendemos directamente la parte logística.
    const question = lead.necesita_asesor && pideCita ? null : msg.nextQuestion(lead, lang, patch, now);
    if (question) return { messages: [question], escalate: false, leadPatch: patch };

    const proposedDate = analysis.extracted.fecha ?? lead.cita_propuesta_fecha ?? null;
    const proposedTime = analysis.extracted.hora ?? lead.cita_propuesta_hora ?? null;

    if (analysis.intent === "reagendar" && !proposedDate && !proposedTime) {
      return { messages: [conDireccion(lang === "en" ? "What new day works best for you?" : "¿Qué nuevo día le queda mejor?")], escalate: false };
    }

    const changedProposal =
      (analysis.extracted.fecha !== null && analysis.extracted.fecha !== lead.cita_propuesta_fecha) ||
      (analysis.extracted.hora !== null && analysis.extracted.hora !== lead.cita_propuesta_hora);
    if ((analysis.confirmation || analysis.intent === "confirmar_cita") && !changedProposal) {
      if (!lead.cita_propuesta_fecha || !lead.cita_propuesta_hora) return { messages: [conDireccion(msg.askDay(lang))], escalate: false };
      const booked = await this.agenda.bookOrReschedule(lead, lead.cita_propuesta_fecha, lead.cita_propuesta_hora, now);
      if (!booked.ok) {
        if (booked.reason === "domingo_requiere_asesor") return { messages: [msg.sundayAdvisor(lang)], escalate: true };
        return { messages: [conDireccion(msg.occupied(booked.alternatives, lang))], escalate: false };
      }
      await this.leads.update(lead.id, { cita_propuesta_fecha: null, cita_propuesta_hora: null });
      // Cita agendada: el asesor debe ser notificado para darle seguimiento.
      return { messages: msg.confirmed(lead, formatLocalAppointment(booked.appointment.fecha).label, lang), escalate: false, appointed: true };
    }

    if (!proposedDate) return { messages: [conDireccion(msg.askDay(lang))], escalate: false };
    if (new Date(`${proposedDate}T12:00:00Z`).getUTCDay() === 0) return { messages: [msg.sundayAdvisor(lang)], escalate: true };

    if (!proposedTime) {
      const times = (await this.agenda.availableSlots(proposedDate, now)).slice(0, 2);
      await this.leads.update(lead.id, { cita_propuesta_fecha: proposedDate, cita_propuesta_hora: null });
      return { messages: [conDireccion(msg.offerTimes(times, lang))], escalate: false };
    }

    const validation = await this.agenda.validateForLead(lead.id, proposedDate, proposedTime, now);
    if (!validation.ok) {
      if (validation.reason === "domingo_requiere_asesor") return { messages: [msg.sundayAdvisor(lang)], escalate: true };
      return { messages: [conDireccion(msg.occupied(validation.alternatives.slice(0, 2), lang))], escalate: false };
    }
    lead = await this.leads.update(lead.id, { cita_propuesta_fecha: proposedDate, cita_propuesta_hora: proposedTime });
    return { messages: [conDireccion(msg.confirmProposal(proposedDate, proposedTime, lang))], escalate: false, leadPatch: {
      cita_propuesta_fecha: lead.cita_propuesta_fecha, cita_propuesta_hora: lead.cita_propuesta_hora,
    } };
  }
}

