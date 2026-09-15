import { test } from "node:test";
import assert from "node:assert/strict";
import PocketBase from "pocketbase";
import { ConversationEngine } from "@/lib/creditos-bot/engine.ts";
import { AgendaService } from "@/lib/creditos-bot/agenda.ts";
import { PocketBaseLeadRepository } from "@/lib/creditos-bot/pocketbase.ts";
import { procesarTurnoBot } from "@/lib/turno.ts";
import { makeMockPb } from "./helpers/mock-pb.mts";
import type { LeadData, MessageAnalysis, AppointmentRecord } from "@/lib/creditos-bot/types.ts";

const now = new Date("2026-09-15T21:32:00Z");
function analysis(extracted = {}, extra = {}): MessageAnalysis {
  return {
    intent: "proporcionar_datos", language: "es", confirmation: false,
    needs_human: false, human_reason: null, sensitive_data_detected: false,
    extracted: {
      nombre: null, estatus: null, dependencia: null, dependencia_otra: null,
      monto_solicitado: null, credito_vigente: null, empresa_credito: null,
      antiguedad_credito: null, fecha: null, hora: null, ...extracted,
    }, ...extra,
  };
}
function scenario(initial: Partial<LeadData> = {}) {
  let lead: LeadData = { id: "l1", nombre: "Pako", nombre_confirmado: false, ...initial };
  const appointments: AppointmentRecord[] = [];
  const leads = {
    async get() { return { ...lead }; },
    async update(_id, patch) { lead = { ...lead, ...patch }; return { ...lead }; },
    async isLatestInboundMessage() { return true; },
  };
  const repo = {
    async listForLocalDay(date) { return appointments.filter((a) => a.slot_key.startsWith(date)); },
    async findFutureForLead() { return appointments[0] ?? null; },
    async create(input) { const row = { id: "a1", ...input }; appointments.push(row); return row; },
    async update(id, input) { const row = appointments.find((a) => a.id === id)!; Object.assign(row, input); return row; },
    async delete(id) { appointments.splice(appointments.findIndex((a) => a.id === id), 1); },
  };
  const engine = new ConversationEngine(leads, new AgendaService(repo));
  return { leads, appointments, turn: (a, request = {}) => engine.handle(lead, a, now, request) };
}

test("conversación reportada: pide el nombre del solicitante, pregunta crédito y confirma una sola vez", async () => {
  const s = scenario();
  let r = await s.turn(analysis({}, { intent: "saludo" }));
  assert.match(r.messages[0], /Buenas tardes.*Créditos a tu medida.*nombre completo de la persona que solicita el crédito/);
  assert.doesNotMatch(r.messages[0], /Pako|pensionado/);
  r = await s.turn(analysis({ nombre: "Francisco López" }));
  assert.match(r.messages[0], /Mucho gusto, Francisco.*jubilado o pensionado/);
  assert.equal((await s.leads.get()).nombre_confirmado, true);
  r = await s.turn(analysis({ estatus: "pensionado" }));
  assert.match(r.messages[0], /institución/);
  r = await s.turn(analysis({ dependencia: "IMSS" }));
  assert.match(r.messages[0], /Perfecto.*cantidad/);
  r = await s.turn(analysis({ monto_solicitado: "100000" }));
  assert.match(r.messages[0], /\$100,000.*préstamo vigente/);
  assert.equal(s.appointments.length, 0);
  r = await s.turn(analysis({ credito_vigente: "no" }));
  assert.match(r.messages[0], /asesor revise su solicitud.*día y hora/);
  r = await s.turn(analysis({ fecha: "2026-09-18", hora: "15:00" }, { intent: "pedir_cita" }));
  assert.match(r.messages[0], /viernes.*18 de septiembre a las 3 de la tarde/);
  assert.doesNotMatch(r.messages[0], /2026-09-18/);
  assert.equal(s.appointments.length, 0, "proponer no debe reservar");
  r = await s.turn(analysis({}, { intent: "confirmar_cita", confirmation: true }));
  assert.equal(s.appointments.length, 1);
  assert.equal(r.messages.length, 1);
  assert.match(r.messages[0], /Listo, Francisco.*quedó agendada/);
  assert.doesNotMatch(r.messages[0], /Pako|\.\.|se la pasé al equipo/);
  assert.equal((await s.leads.get()).cita_propuesta_fecha, null);
});

test("crédito vigente sí solicita empresa y antigüedad antes de agenda", async () => {
  const s = scenario({ nombre: "Francisco López", nombre_confirmado: true,
    estatus: "pensionado", dependencia: "IMSS", monto_solicitado: "100000" });
  assert.match((await s.turn(analysis({ credito_vigente: "si" }))).messages[0], /con qué empresa/i);
  assert.match((await s.turn(analysis({ empresa_credito: "Ejemplo" }))).messages[0], /hace cuánto/i);
  assert.match((await s.turn(analysis({ antiguedad_credito: "dos años" }))).messages[0], /día y hora/);
});

test("cambiar hora en una confirmación propone el nuevo horario antes de reservar", async () => {
  const s = scenario({ nombre: "Francisco", nombre_confirmado: true, estatus: "pensionado",
    dependencia: "IMSS", monto_solicitado: "100000", credito_vigente: "no",
    cita_propuesta_fecha: "2026-09-18", cita_propuesta_hora: "15:00" });
  const r = await s.turn(analysis({ hora: "16:00" }, { confirmation: true, intent: "confirmar_cita" }));
  assert.equal(s.appointments.length, 0);
  assert.match(r.messages[0], /4 de la tarde.*confirmo/);
});

test("PocketBase conserva crédito desconocido y distingue nombre de perfil", async () => {
  const sdk = new PocketBase("http://example.invalid");
  for (const [value, expected] of [[null, null], ["", null], ["no", "no"], ["sí", "si"]]) {
    const pb = {
      filter: sdk.filter.bind(sdk),
      collection: (name) => ({
        getOne: async () => ({ id: "l1", nombre: "Pako", otra_financiera: value, institucion: "otra" }),
        getFullList: async () => name === "conversations" ? [{ bot_activo: true }] : [],
      }),
    };
    const lead = await new PocketBaseLeadRepository(pb as never).get("l1");
    assert.equal(lead.credito_vigente, expected);
    assert.equal(lead.nombre_confirmado, false);
    assert.equal(lead.dependencia, "otra");
  }
});

test("PocketBase rechaza confirmación de nombre cuando falta migración", async () => {
  const pb = { collection: () => ({ update: async () => ({ id: "l1", nombre: "Francisco" }) }) };
  await assert.rejects(new PocketBaseLeadRepository(pb as never).update("l1", {
    nombre: "Francisco", nombre_confirmado: true,
  }), /Falta migrar/);
});

test("guard de mensajes usa igualdad de conversaciones y rechaza mensajes viejos", async () => {
  const sdk = new PocketBase("http://example.invalid");
  const pb = { filter: sdk.filter.bind(sdk), collection: () => ({
    getFullList: async () => [{ id: "c1" }, { id: "c2" }],
    getList: async (_page, _size, opts) => {
      assert.equal(opts.filter, '(conversation = "c1" || conversation = "c2") && remitente = \'cliente\'');
      return { items: [{ id: "new" }] };
    },
  }) };
  const repo = new PocketBaseLeadRepository(pb as never);
  assert.equal(await repo.isLatestInboundMessage("l1", "old"), false);
  assert.equal(await repo.isLatestInboundMessage("l1", "new"), true);
});

test("necesita_asesor mantiene el bot disponible hasta que un asesor tome el control", async () => {
  const sdk = new PocketBase("http://example.invalid");
  const pb = { filter: sdk.filter.bind(sdk), collection: () => ({
    getOne: async () => ({ id: "l1" }),
    getFullList: async () => [{ bot_activo: true, necesita_asesor: true }],
  }) };
  const lead = await new PocketBaseLeadRepository(pb as never).get("l1");
  assert.equal(lead.bot_activo, true);
  assert.equal(lead.necesita_asesor, true);
});

test("tras escalar, dirección y cita siguen atendidas aunque falten datos de precalificación", async () => {
  const s = scenario({
    estatus: "pensionado",
    dependencia: "IMSS",
    monto_solicitado: null,
    credito_vigente: null,
    necesita_asesor: true,
  });
  const r = await s.turn(
    analysis({}, { intent: "pedir_direccion" }),
    { pideDireccion: true, pideCita: true },
  );
  assert.match(r.messages[0], /Benjamín Franklin 3220/);
  assert.match(r.messages[0], /Qué día y hora le acomodan/);
  assert.doesNotMatch(r.messages[0], /cantidad le gustaría solicitar/);
});

test("ráfaga de WhatsApp conserva la petición de cita del mensaje anterior", async (t) => {
  const saved = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
  process.env.OPENAI_API_KEY = "test-not-a-real-key";
  process.env.OPENAI_MODEL = "test";
  t.after(() => {
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.key;
    if (saved.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = saved.model;
  });
  const mock = makeMockPb({
    leads: [{ id: "l1", nombre: "Pako", nombre_confirmado: true }],
    conversations: [{ id: "c1", bot_activo: true, necesita_asesor: true }],
    messages: [
      { id: "b1", conversation: "c1", remitente: "bot", contenido: "Un asesor le responde por aquí.", created: "2026-09-15T22:48:00Z" },
      { id: "m1", conversation: "c1", remitente: "cliente", contenido: "Dónde los puedo ver, quisiera una cita", created: "2026-09-15T22:49:00Z" },
      { id: "m2", conversation: "c1", remitente: "cliente", contenido: "Me pasa su dirección", created: "2026-09-15T22:49:01Z" },
    ],
  });
  let received = "";
  await procesarTurnoBot({
    leadId: "l1", conversationId: "c1", mensajeId: "m2", telefono: "6560000000", esLeadNuevo: false,
    parsed: { text: "Me pasa su dirección", nombre: "Pako", telefono: "6560000000", conversationId: "zc1", accountId: "za1", attachments: [] },
  }, {
    pb: mock.pb, send: async () => {}, runBotTurn: async () => ({ reply: null, escalate: false, leadData: null, cita: null }),
    runNewEngineTurn: async (args) => { received = args.text; return true; },
    notifyNeedsAdvisor: async () => {}, notifyNewLead: async () => {}, notifyNewLeadToSlack: async () => {},
  });
  assert.match(received, /quisiera una cita/);
  assert.match(received, /Me pasa su dirección/);
});

for (const fail of [false, true]) {
  test(`motor nuevo recibe audio transcrito e historial; falla de envío=${fail} no ejecuta motor viejo`, async (t) => {
    const saved = { key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL };
    process.env.OPENAI_API_KEY = "test-not-a-real-key";
    process.env.OPENAI_MODEL = "test";
    t.after(() => {
      if (saved.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = saved.key;
      if (saved.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = saved.model;
    });
    const mock = makeMockPb({
      leads: [{ id: "l1", nombre: "Pako" }],
      conversations: [{ id: "c1", bot_activo: true }],
      messages: [
        { id: "m1", conversation: "c1", remitente: "bot", contenido: "¿Me comparte su nombre completo?", created: "2026-09-15T21:30:00Z" },
        { id: "m2", conversation: "c1", remitente: "cliente", contenido: "", media_type: "audio", created: "2026-09-15T21:32:00Z" },
      ],
    });
    let newCalls = 0;
    let oldCalls = 0;
    let notices = 0;
    await procesarTurnoBot({
      leadId: "l1", conversationId: "c1", mensajeId: "m2", telefono: "6560000000", esLeadNuevo: false,
      parsed: { text: null, nombre: "Pako", telefono: "6560000000", conversationId: "zc1", accountId: "za1",
        attachments: [{ type: "audio", url: "https://example.invalid/audio" }] },
    }, {
      pb: mock.pb, send: async () => {},
      runBotTurn: async () => { oldCalls++; return { reply: "viejo", escalate: false, leadData: null, cita: null }; },
      transcribirAudio: async () => "Francisco López",
      runNewEngineTurn: async (args) => {
        newCalls++;
        assert.equal(args.text, "Francisco López");
        assert.deepEqual(args.history, [{ role: "assistant", content: "¿Me comparte su nombre completo?" }]);
        if (fail) throw new Error("envío falló después de procesar el turno");
        return true;
      },
      notifyNeedsAdvisor: async () => { notices++; }, notifyNewLead: async () => {}, notifyNewLeadToSlack: async () => {},
    });
    assert.equal(newCalls, 1);
    assert.equal(oldCalls, 0);
    assert.equal(notices, fail ? 1 : 0);
    assert.equal(mock.collections.messages.find((m) => m.id === "m2")?.contenido, "Francisco López");
  });
}
