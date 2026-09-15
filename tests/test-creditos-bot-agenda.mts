// Tests del núcleo determinista del motor OpenAI (lib/creditos-bot).
// Porto los tests incluidos en el paquete creditos-openai-replacement al runner
// nativo del proyecto (node --test), igual que el resto de tests/.
//
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-creditos-bot-agenda.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { AgendaService, slotKey } from "@/lib/creditos-bot/agenda.ts";
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
    if (this.rows.some((r) => r.slot_key === input.slot_key)) throw new Error("UNIQUE slot_key");
    const row = { id: `a${++this.sequence}`, ...input };
    this.rows.push(row);
    return row;
  }
  async update(id: string, input: Partial<Omit<AppointmentRecord, "id" | "lead">>) {
    const row = this.rows.find((r) => r.id === id);
    if (!row) throw new Error("not found");
    if (input.slot_key && this.rows.some((r) => r.id !== id && r.slot_key === input.slot_key)) throw new Error("UNIQUE slot_key");
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

test("no agenda domingo y respeta sábado", async () => {
  const service = new AgendaService(new FakeAppointments());
  assert.equal((await service.validateSlot("2026-09-20", "10:00", now)).reason, "domingo_requiere_asesor");
  assert.equal((await service.validateSlot("2026-09-19", "10:00", now)).ok, true);
  assert.equal((await service.validateSlot("2026-09-19", "14:00", now)).reason, "fuera_de_horario");
});

test("rechaza hora faltante, pasada y fuera de jornada", async () => {
  const service = new AgendaService(new FakeAppointments());
  assert.equal((await service.validateSlot("2026-09-21", "", now)).reason, "hora_invalida");
  assert.equal((await service.validateSlot("2026-09-15", "10:00", now)).reason, "horario_pasado");
  assert.equal((await service.validateSlot("2026-09-21", "14:00", now)).reason, "fuera_de_horario");
});

test("cita ocupada no crea y consultar luego refleja ocupación", async () => {
  const repo = new FakeAppointments();
  const service = new AgendaService(repo);
  assert.equal((await service.bookOrReschedule(lead("l1"), "2026-09-21", "10:00", now)).ok, true);
  assert.equal((await service.bookOrReschedule(lead("l2"), "2026-09-21", "10:00", now)).ok, false);
  assert.ok(!(await service.availableSlots("2026-09-21", now)).includes("10:00"));
});

test("dos clientes simultáneos solo consiguen un mismo slot", async () => {
  const repo = new FakeAppointments();
  const service = new AgendaService(repo);
  const results = await Promise.all([
    service.bookOrReschedule(lead("l1"), "2026-09-21", "11:00", now),
    service.bookOrReschedule(lead("l2"), "2026-09-21", "11:00", now),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(repo.rows.filter((r) => r.slot_key === slotKey("2026-09-21", "11:00")).length, 1);
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