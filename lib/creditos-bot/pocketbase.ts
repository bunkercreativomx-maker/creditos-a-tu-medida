import type PocketBase from "pocketbase";
import type { AppointmentRecord, AppointmentRepository, LeadData, LeadRepository } from "./types";
import { localDayUtcRange } from "./time";

/**
 * Adaptación al esquema REAL de la DB (pb-creditos).
 *
 * El motor nuevo (`lib/creditos-bot`) trabaja con un modelo lógico de lead:
 *   estatus, dependencia, monto_solicitado, credito_vigente, bot_activo...
 * Pero la colección `leads` real usa OTROS nombres para esos datos y reparte
 * `bot_activo`/`necesita_asesor` en la colección `conversations` (no en leads).
 *
 * Este repositorio TRADUCE entre el modelo lógico y los campos reales, como
 * pide la regla 6 (entregable "campo cuyo nombre no coincide"). No cambia
 * reglas de negocio: solo conecta el motor nuevo con los nombres existentes.
 *
 * Mapeo lógico -> DB real:
 *   estatus           -> leads.sector          (select: pensionado/jubilado/otro...)
 *   dependencia       -> leads.institucion     (text)
 *   monto_solicitado  -> leads.monto_aproximado(text)
 *   credito_vigente   -> leads.otra_financiera (text)
 *   empresa_credito   -> leads.empresa_credito
 *   antiguedad_credito-> leads.antiguedad_credito
 *   bot_activo        -> conversations.bot_activo  (relation lead -> conversations)
 *   cita_propuesta_*  -> leads.cita_propuesta_fecha/hora  (campos a migrar, SCHEMA.md)
 */

/** Convierte un registro real de `leads` al modelo lógico LeadData que usa el motor. */
function toLeadData(record: Record<string, unknown>): LeadData {
  return {
    id: String(record.id),
    telefono: record.telefono == null ? null : String(record.telefono),
    nombre: record.nombre == null ? null : String(record.nombre),
    nombre_confirmado: record.nombre_confirmado === true,
    estatus: (record.sector as LeadData["estatus"]) ?? null,
    dependencia: institutionToDependency(record.institucion),
    monto_solicitado: record.monto_aproximado == null ? null : String(record.monto_aproximado),
    credito_vigente: otraFinancieraToSiNo(record.otra_financiera),
    empresa_credito: record.empresa_credito == null ? null : String(record.empresa_credito),
    antiguedad_credito: record.antiguedad_credito == null ? null : String(record.antiguedad_credito),
    cita_propuesta_fecha: record.cita_propuesta_fecha == null ? null : String(record.cita_propuesta_fecha),
    cita_propuesta_hora: record.cita_propuesta_hora == null ? null : String(record.cita_propuesta_hora),
    ultimo_mensaje_procesado: record.ultimo_mensaje_procesado == null ? null : String(record.ultimo_mensaje_procesado),
    // bot_activo NO vive en leads: se inyecta por el repositorio desde conversations.
    bot_activo: record.bot_activo as boolean | undefined,
  };
}

/** `institucion` real -> dependencia lógica; si trae una dependencia elegible la conserva. */
function institutionToDependency(v: unknown): LeadData["dependencia"] {
  const s = v == null ? "" : String(v).trim().toUpperCase();
  const dep: LeadData["dependencia"] = ["IMSS", "ISSSTE", "CFE", "SNTE", "PEMEX"].includes(s) ? s as LeadData["dependencia"] : null;
  // "otra"/texto libre de institución -> "otra" (dependencia no elegible) pero se preserva.
  return dep ?? (s ? "otra" : null);
}

/** `otra_financiera` real ("si"/"no" o texto) -> credito_vigente lógico. */
function otraFinancieraToSiNo(v: unknown): LeadData["credito_vigente"] {
  const s = v == null ? "" : String(v).trim().toLowerCase();
  if (s === "si" || s === "yes" || s === "sí" || s === "1") return "si";
  if (s === "") return null;
  if (s === "no" || s === "0") return "no";
  // Un texto (nombre de empresa) implica que SÍ hay crédito vigente.
  return "si";
}

/** Convierte el modelo lógico LeadData al payload que entiende la colección `leads` real. */
function fromLeadPatch(input: Partial<LeadData>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.nombre !== undefined) out.nombre = input.nombre;
  if (input.nombre_confirmado !== undefined) out.nombre_confirmado = input.nombre_confirmado;
  if (input.telefono !== undefined) out.telefono = input.telefono;
  if (input.estatus !== undefined) out.sector = input.estatus;
  if (input.dependencia !== undefined) out.institucion = input.dependencia;
  if (input.monto_solicitado !== undefined) out.monto_aproximado = input.monto_solicitado;
  if (input.credito_vigente !== undefined) out.otra_financiera = input.credito_vigente;
  if (input.empresa_credito !== undefined) out.empresa_credito = input.empresa_credito;
  if (input.antiguedad_credito !== undefined) out.antiguedad_credito = input.antiguedad_credito;
  if (input.cita_propuesta_fecha !== undefined) out.cita_propuesta_fecha = input.cita_propuesta_fecha;
  if (input.cita_propuesta_hora !== undefined) out.cita_propuesta_hora = input.cita_propuesta_hora;
  if (input.ultimo_mensaje_procesado !== undefined) out.ultimo_mensaje_procesado = input.ultimo_mensaje_procesado;
  return out;
}

export class PocketBaseAppointmentRepository implements AppointmentRepository {
  private readonly pb: PocketBase;

  constructor(pb: PocketBase) {
    this.pb = pb;
  }

  private appointment(record: Record<string, unknown>): AppointmentRecord {
    return {
      id: String(record.id),
      lead: String(record.lead),
      fecha: String(record.fecha),
      slot_key: record.slot_key == null ? "" : String(record.slot_key),
      titulo: record.titulo == null ? null : String(record.titulo),
      notas: record.notas == null ? null : String(record.notas),
    };
  }

  async listForLocalDay(localDate: string): Promise<AppointmentRecord[]> {
    const range = localDayUtcRange(localDate);
    if (!range) return [];
    const filter = this.pb.filter("fecha >= {:start} && fecha < {:end}", {
      start: range.start.toISOString(), end: range.end.toISOString(),
    });
    const records = await this.pb.collection("citas").getFullList({ filter, sort: "+fecha" });
    return records.map((r) => this.appointment(r));
  }

  async findFutureForLead(leadId: string, nowIso: string): Promise<AppointmentRecord | null> {
    const filter = this.pb.filter("lead = {:lead} && fecha >= {:now}", { lead: leadId, now: nowIso });
    try {
      const record = await this.pb.collection("citas").getFirstListItem(filter, { sort: "+fecha" });
      return this.appointment(record);
    } catch (error) {
      if ((error as { status?: number }).status === 404) return null;
      throw error;
    }
  }

  async create(input: Omit<AppointmentRecord, "id">): Promise<AppointmentRecord> {
    return this.appointment(await this.pb.collection("citas").create(input));
  }

  async update(id: string, input: Partial<Omit<AppointmentRecord, "id" | "lead">>): Promise<AppointmentRecord> {
    return this.appointment(await this.pb.collection("citas").update(id, input));
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
    const lead = await this.pb.collection("leads").getOne(id) as Record<string, unknown>;
    const data = toLeadData(lead);
    // bot_activo vive en conversations (una por lead). La inyectamos en el modelo lógico.
    const convs = await this.pb.collection("conversations")
      .getFullList({ filter: this.pb.filter("lead = {:lead}", { lead: id }) });
    data.bot_activo = convs.length > 0 && convs.every((c) => c.bot_activo === true && c.necesita_asesor !== true);
    return data;
  }

  async update(id: string, input: Partial<LeadData>): Promise<LeadData> {
    const payload = fromLeadPatch(input);
    const updated = await this.pb.collection("leads").update(id, payload) as Record<string, unknown>;
    if (input.nombre_confirmado === true && updated.nombre_confirmado !== true) {
      throw new Error("Falta migrar leads.nombre_confirmado; no se pudo guardar la confirmación del nombre");
    }
    return toLeadData(updated);
  }

  async isLatestInboundMessage(leadId: string, messageId: string): Promise<boolean> {
    // La colección real es `messages`, keyed por `conversation` (no por lead).
    // Buscamos las conversaciones del lead y luego la más reciente con remitente cliente.
    const convs = await this.pb.collection("conversations")
      .getFullList({ filter: this.pb.filter("lead = {:lead}", { lead: leadId }) });
    const ids = (convs as { id?: string }[]).filter((c) => c.id).map((c) => c.id as string);
    if (ids.length === 0 || !messageId) return false;
    const conversationFilter = ids.map((id) => this.pb.filter("conversation = {:id}", { id })).join(" || ");
    const filter = `(${conversationFilter}) && remitente = 'cliente'`;
    const page = await this.pb.collection("messages").getList(1, 1, { filter, sort: "-created" });
    const latest = page.items[0] as { id?: string } | undefined;
    return latest?.id === messageId;
  }
}
