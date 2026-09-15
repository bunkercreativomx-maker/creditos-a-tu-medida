import { ADDRESS, isEligibleDependency, slotsForLocalDate } from "./policy";
import { isPastLocalSlot, localDateTimeToUtc } from "./time";
import type { AppointmentRecord, AppointmentRepository, LeadData } from "./types";

export type SlotFailure =
  | "fecha_invalida"
  | "hora_invalida"
  | "domingo_requiere_asesor"
  | "fuera_de_horario"
  | "horario_pasado"
  | "horario_ocupado";

export interface SlotValidation {
  ok: boolean;
  reason?: SlotFailure;
  alternatives: string[];
}

export function slotKey(localDate: string, localTime: string): string {
  return `${localDate}|${localTime}`;
}

export class AgendaService {
  private readonly repo: AppointmentRepository;

  constructor(repo: AppointmentRepository) {
    this.repo = repo;
  }

  async availableSlots(localDate: string, now = new Date(), excludeId?: string): Promise<string[]> {
    const slots = [...slotsForLocalDate(localDate)];
    if (slots.length === 0) return [];
    const appointments = await this.repo.listForLocalDay(localDate);
    const occupied = new Set(appointments.filter((a) => a.id !== excludeId).map((a) => a.slot_key));
    return slots.filter((time) => !isPastLocalSlot(localDate, time, now) && !occupied.has(slotKey(localDate, time)));
  }

  async validateSlot(localDate: string, localTime: string, now = new Date(), excludeId?: string): Promise<SlotValidation> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !localDateTimeToUtc(localDate, "12:00")) {
      return { ok: false, reason: "fecha_invalida", alternatives: [] };
    }
    if (!/^\d{2}:\d{2}$/.test(localTime)) {
      return { ok: false, reason: "hora_invalida", alternatives: [] };
    }
    const allowed = slotsForLocalDate(localDate);
    if (allowed.length === 0) return { ok: false, reason: "domingo_requiere_asesor", alternatives: [] };
    if (!(allowed as readonly string[]).includes(localTime)) {
      return { ok: false, reason: "fuera_de_horario", alternatives: await this.availableSlots(localDate, now, excludeId) };
    }
    if (isPastLocalSlot(localDate, localTime, now)) {
      return { ok: false, reason: "horario_pasado", alternatives: await this.availableSlots(localDate, now, excludeId) };
    }
    const free = await this.availableSlots(localDate, now, excludeId);
    if (!free.includes(localTime)) return { ok: false, reason: "horario_ocupado", alternatives: free };
    return { ok: true, alternatives: free.filter((x) => x !== localTime) };
  }

  async validateForLead(leadId: string, localDate: string, localTime: string, now = new Date()): Promise<SlotValidation> {
    const current = await this.repo.findFutureForLead(leadId, now.toISOString());
    return this.validateSlot(localDate, localTime, now, current?.id);
  }

  async findFutureForLead(leadId: string, now = new Date()): Promise<AppointmentRecord | null> {
    return this.repo.findFutureForLead(leadId, now.toISOString());
  }

  async cancelFutureForLead(leadId: string, now = new Date()): Promise<boolean> {
    const appointment = await this.repo.findFutureForLead(leadId, now.toISOString());
    if (!appointment) return false;
    await this.repo.delete(appointment.id);
    return true;
  }

  async bookOrReschedule(lead: LeadData, localDate: string, localTime: string, now = new Date()): Promise<{ ok: true; appointment: AppointmentRecord } | { ok: false; reason: SlotFailure | "error_base_datos"; alternatives: string[] }> {
    const current = await this.repo.findFutureForLead(lead.id, now.toISOString());
    const validation = await this.validateSlot(localDate, localTime, now, current?.id);
    if (!validation.ok) return { ok: false, reason: validation.reason!, alternatives: validation.alternatives.slice(0, 2) };
    const utc = localDateTimeToUtc(localDate, localTime);
    if (!utc) return { ok: false, reason: "fecha_invalida", alternatives: [] };
    const dependence = isEligibleDependency(lead.dependencia) ? lead.dependencia : "Sin dependencia";
    const input = {
      fecha: utc.toISOString(),
      slot_key: slotKey(localDate, localTime),
      titulo: `Cita préstamo — ${lead.nombre ?? "Sin nombre"} — ${dependence}`,
      notas: [
        `Estatus: ${lead.estatus ?? "no proporcionado"}`,
        `Dependencia: ${lead.dependencia ?? "no proporcionada"}`,
        `Monto: ${lead.monto_solicitado ?? "no definido"}`,
        `Crédito vigente: ${lead.credito_vigente ?? "no proporcionado"}`,
        `Teléfono: ${lead.telefono ?? "no proporcionado"}`,
        `Ubicación: ${ADDRESS}`,
      ].join("\n"),
    };
    try {
      const appointment = current
        ? await this.repo.update(current.id, input)
        : await this.repo.create({ lead: lead.id, ...input });
      return { ok: true, appointment };
    } catch {
      // Una restricción UNIQUE sobre slot_key es la defensa final contra carreras.
      const alternatives = await this.availableSlots(localDate, now, current?.id);
      return { ok: false, reason: "error_base_datos", alternatives: alternatives.slice(0, 2) };
    }
  }
}
