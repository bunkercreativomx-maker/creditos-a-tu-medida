import type PocketBase from "pocketbase";
import type { AppointmentRecord, AppointmentRepository, LeadData, LeadRepository } from "./types";
import { localDayUtcRange } from "./time";

function appointment(record: Record<string, unknown>): AppointmentRecord {
  return {
    id: String(record.id),
    lead: String(record.lead),
    fecha: String(record.fecha),
    slot_key: String(record.slot_key),
    titulo: record.titulo == null ? null : String(record.titulo),
    notas: record.notas == null ? null : String(record.notas),
  };
}

export class PocketBaseAppointmentRepository implements AppointmentRepository {
  private readonly pb: PocketBase;

  constructor(pb: PocketBase) {
    this.pb = pb;
  }

  async listForLocalDay(localDate: string): Promise<AppointmentRecord[]> {
    const range = localDayUtcRange(localDate);
    if (!range) return [];
    const filter = this.pb.filter("fecha >= {:start} && fecha < {:end}", {
      start: range.start.toISOString(), end: range.end.toISOString(),
    });
    const records = await this.pb.collection("citas").getFullList({ filter, sort: "+fecha" });
    return records.map((r) => appointment(r));
  }

  async findFutureForLead(leadId: string, nowIso: string): Promise<AppointmentRecord | null> {
    const filter = this.pb.filter("lead = {:lead} && fecha >= {:now}", { lead: leadId, now: nowIso });
    try {
      const record = await this.pb.collection("citas").getFirstListItem(filter, { sort: "+fecha" });
      return appointment(record);
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  async create(input: Omit<AppointmentRecord, "id">): Promise<AppointmentRecord> {
    return appointment(await this.pb.collection("citas").create(input));
  }

  async update(id: string, input: Partial<Omit<AppointmentRecord, "id" | "lead">>): Promise<AppointmentRecord> {
    return appointment(await this.pb.collection("citas").update(id, input));
  }

  async delete(id: string): Promise<void> {
    await this.pb.collection("citas").delete(id);
  }
}

export class PocketBaseLeadRepository implements LeadRepository {
  private readonly pb: PocketBase;

  constructor(pb: PocketBase) {
    this.pb = pb;
  }

  async get(id: string): Promise<LeadData> {
    return await this.pb.collection("leads").getOne(id) as unknown as LeadData;
  }

  async update(id: string, input: Partial<LeadData>): Promise<LeadData> {
    return await this.pb.collection("leads").update(id, input) as unknown as LeadData;
  }

  async isLatestInboundMessage(leadId: string, messageId: string): Promise<boolean> {
    const filter = this.pb.filter("lead = {:lead} && remitente = 'cliente'", { lead: leadId });
    const page = await this.pb.collection("mensajes").getList(1, 1, { filter, sort: "-created" });
    const latest = page.items[0];
    return !latest?.id || latest.id === messageId;
  }
}

