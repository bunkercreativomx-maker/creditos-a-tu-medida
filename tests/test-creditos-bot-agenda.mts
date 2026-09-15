// Tests del núcleo determinista del motor OpenAI (lib/creditos-bot).
// REGLA DE NEGOCIO: hasta 4 asesores => un mismo horario admite HASTA 4 citas.
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-creditos-bot-agenda.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgendaService, slotKey, MAX_CITAS_POR_SLOT } from "@/lib/creditos-bot/agenda.ts";
import type { AppointmentRecord, AppointmentRepository, LeadData } from "@/lib/creditos-bot/types.ts";
import { localDateTimeToUtc, utcToLocalParts } from "@/lib/creditos-bot/time.ts";

class FakeAppointments implements AppointmentRepository {
  rows: AppointmentRecord[] = [];
  sequence = 0;

  async listForLocalDay(localDate: string) {
    return this.rows.filter((r) => r.slot_key.startsWith(`${localDate}|`));
  }
  async findFutureForLead(leadId: string, nowIso: string) {
    return (
      this.rows
        .filter((r) => r.lead === leadId && r.fecha >= nowIso)
        .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] ?? null
    );
  }
  async create(input: Omit<AppointmentRecord, "id">) {
    await Promise.resolve();
    const row = { id: `a${++this.sequence}`, ...input };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: Partial<Omit<AppointmentRecord, "id" | "lead">>) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("not found");
    Object.assign(row, input);
    return row;
  }
  async delete(id: string) {
    this.rows = this.rows.filter((r) => r.id !== id);
  }
}

const lead = (id: string): LeadData => ({
  id,
  nombre: "María López",
  estatus: "pensionado",
  dependencia: "IMSS",
  monto_solicitado: "50000",
  credito_vigente: "no",
  telefono: "6560000000",
});

const now = new Date("2026-09-15T18:00:00.000Z");

test("convierte UTC y hora local sin confundir el slot", () => {
  const utc = localDateTimeToUtc("2026-09-21", "10:00")!;
  assert.deepEqual(utcToLocalParts(utc), { date: "2026-09-21", time: "10:00" });
});

test("una cita de 17:00 en invierno puede caer al día UTC siguiente", () => {
  const utc = localDateTimeToUtc("2026-01-15", "17:00")!;
  assert.equal(utc.toISOString().slice(0, 10), "2026-01-16");
  assert.deepEqual(utcToLocalParts(utc), { date: "2026-01-15", time: "17:00" });
});

test("no agenda domingo; oddices válidos entre semana (incl 14:00) y sábado", async () => {
  const service = new AgendaService(new FakeAppointments());
  assert.equal((await service.validateSlot("2026-09-20", "10:00", now)).reason, "domingo_requiere_asesor");
  assert.equal((await service.validateSlot("2026-09-19", "10:00", now)).ok, true); // sábado
  // 14:00 ahora es un slot válido entre semana (cliente pide "a las 2")
  assert.equal((await service.validateSlot("2026-09-21", "14:00", now)).ok, true);
  // sábado a las 14:00 no es válido (sáb hasta 13:00)
  assert.equal((await service.validateSlot("2026-09-19", "14:00", now)).reason, "fuera_de_horario");
});

test("rechaza hora faltante, pasada y fuera de jornada", async () => {
  const service = new AgendaService(new FakeAppointments());
  assert.equal((await service.validateSlot("2026-09-21", "", now)).reason, "hora_invalida");
  assert.equal((await service.validateSlot("2026-09-15", "10:00", now)).reason, "horario_pasado");
  // 18:00 está fuera de jornada (última cita 17:00)
  assert.equal((await service.validateSlot("2026-09-21", "18:00", now)).reason, "fuera_de_horario");
});

test("un mismo slot admite HASTA 4 citas (4 asesores)", async () => {
  const repo = new FakeAppointments();
  const service = new AgendaService(repo);
  for (let i = 0; i < MAX_CITAS_POR_SLOT; i++) {
    assert.equal((await service.bookOrReschedule(lead(`l${i}`), "2026-09-21", "10:00", now)).ok, true, `intento ${i + 1} debe pasar`);
  }
  assert.ok((await service.availableSlots("2026-09-21", now)).includes("10:00") === false);
  // slot sigue apareciendo? con 4 citas ya no debe ofrecerse de nuevo
  assert.ok(!(await service.availableSlots("2026-09-21", now)).includes("10:00"));
});

test("cuatro citas llenan el slot; el quinto lo rechaza y ofrece alternativas", async () => {
  const repo = new FakeAppointments();
  const service = new AgendaService(repo);
  for (let i = 0; i < MAX_CITAS_POR_SLOT; i++) {
    await service.bookOrReschedule(lead(`l${i}`), "2026-09-21", "11:00", now);
  }
  const fifth = await service.bookOrReschedule(lead("l9"), "2026-09-21", "11:00", now);
  assert.equal(fifth.ok, false);
  if (!fifth.ok) {
    assert.equal(fifth.reason, "horario_ocupado");
    assert.ok(fifth.alternatives.length > 0, "debe ofrecer alternativas");
  }
});

test("dos clientes simultáneos al mismo slot: ambos caben (cupo 4)", async () => {
  const repo = new FakeAppointments();
  const service = new AgendaService(repo);
  const results = await Promise.all([
    service.bookOrReschedule(lead("l1"), "2026-09-21", "11:00", now),
    service.bookOrReschedule(lead("l2"), "2026-09-21", "11:00", now),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 2);
  assert.equal(repo.rows.filter((r) => r.slot_key === slotKey("2026-09-21", "11:00")).length, 2);
});

test("reagenda la cita futura correcta y no toca la histórica", async () => {
  const repo = new FakeAppointments();
  repo.rows = [
    { id: "old", lead: "l1", fecha: "2026-01-10T17:00:00.000Z", slot_key: "2026-01-10|10:00" },
    { id: "future", lead: "l1", fecha: localDateTimeToUtc("2026-09-21", "10:00")!.toISOString(), slot_key: "2026-09-21|10:00" },
  ];
  const result = await new AgendaService(repo).bookOrReschedule(lead("l1"), "2026-09-22", "12:00", now);
  assert.equal(result.ok, true);
  assert.equal(repo.rows.find((r) => r.id === "old")?.slot_key, "2026-01-10|10:00");
  assert.equal(repo.rows.find((r) => r.id === "future")?.slot_key, "2026-09-22|12:00");
});