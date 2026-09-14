// Tests end-to-end del handler REAL (lib/turno.ts → procesarTurnoBot) con
// adaptadores mock: PocketBase en memoria, envío capturado, LLM simulado y
// notificaciones no-op. NO se duplica la lógica del handler: se ejercita el
// código de producción con entradas anonimizadas y se aserta el efecto
// persistido (mensajes guardados, citas creadas/actualizadas, envíos).
//
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-turno.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarTurnoBot, type TurnoDeps } from "@/lib/turno.ts";
import { makeMockPb, type MockPb } from "./helpers/mock-pb.mts";

const C = "c1"; // conversationId fijo para todos los tests

// ---------- utilidades ----------

function makeDeps(mock: MockPb, overrides: Partial<TurnoDeps> = {}) {
  const sent: string[] = [];
  const deps: TurnoDeps = {
    pb: mock.pb,
    send: async (_cid, _aid, text) => {
      sent.push(text);
    },
    runBotTurn: async () => ({ reply: null, escalate: false, leadData: null, cita: null }),
    notifyNeedsAdvisor: async () => {},
    notifyNewLead: async () => {},
    notifyNewLeadToSlack: async () => {},
    ...overrides,
  };
  return { deps, sent };
}

/** Mensaje histórico de la conversación (con el campo `conversation` que filtra PB). */
function msg(over: Record<string, unknown>): Record<string, unknown> {
  return { conversation: C, created: "2026-09-13T09:00:00Z", ...over };
}

/**
 * Estado base de una conversación "a media charla": hay un mensaje previo del
 * bot (para que NO se dispare el saludo fijo) y el mensaje del cliente que
 * dispara este turno YA persistido como el más reciente (id = mensajeId), tal
 * como lo hace la ruta real antes de llamar a after().
 */
function seedMidConversation(textoCliente: string, extraMessages: Record<string, unknown>[] = []) {
  return [
    msg({ remitente: "bot", contenido: "¿En qué le puedo ayudar?", created: "2026-09-13T09:00:00Z" }),
    ...extraMessages,
    msg({ id: "m-cli", remitente: "cliente", contenido: textoCliente, created: "2026-09-13T09:05:00Z" }),
  ];
}

function timedArgs(texto: string, over: Record<string, unknown> = {}) {
  return {
    parsed: {
      text: texto,
      telefono: "6564535107",
      nombre: "Juan Pérez",
      conversationId: "zc-1",
      accountId: "za-cr",
      attachments: [],
    },
    leadId: "l1",
    conversationId: C,
    esLeadNuevo: false,
    mensajeId: "m-cli",
    ...over,
  };
}

function citas(mock: MockPb) {
  return mock.collections["citas"] ?? [];
}

// ---------- casos ----------

test("ubicación → responde la dirección oficial directo, sin cierre en bucle", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("Dónde están ubicados"),
    leads: [{ id: "l1", nombre: "Juan Pérez", telefono: "6564535107" }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("Dónde están ubicados"), deps);

  const respuesta = sent.join("\n");
  assert.match(respuesta, /Benjamín Franklin 3220/);
  assert.doesNotMatch(respuesta, /ya quedó registrada su información/i, "no debe mandar Cierre B");
});

test("pregunta por SU cita → devuelve día/hora reales de la cita persistida", async () => {
  const citaFecha = new Date(Date.UTC(2026, 8, 14, 16, 0, 0)).toISOString();
  const mock = makeMockPb({
    messages: seedMidConversation("Para qué día me quedó la cita y a qué hora"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    citas: [{ id: "cita-1", lead: "l1", fecha: citaFecha }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("Para qué día me quedó la cita y a qué hora"), deps);

  assert.match(sent.join("\n"), /Su cita está agendada para el/);
});

test("corrección de datos → una cifra se guarda como monto, no como hora de cita", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("15,000"),
    leads: [{ id: "l1", nombre: "Juan Pérez", institucion: "IMSS" }],
  });
  let runCount = 0;
  const { deps } = makeDeps(mock, {
    runBotTurn: async () => {
      runCount++;
      return {
        reply: "Perfecto. ¿Tiene otro préstamo vigente?",
        escalate: false,
        leadData: { monto_solicitado: "15000" },
        cita: null,
      };
    },
  });

  await procesarTurnoBot(timedArgs("15,000"), deps);

  assert.equal(citas(mock).length, 0, "no debe crear cita por una cifra de dinero");
  assert.equal(runCount, 1, "debe dejarlo en el turno normal del LLM (no forzar agendado)");
  // Y el monto se persistió en el lead.
  assert.equal(mock.collections["leads"][0]?.monto_aproximado, "15000");
});

test("no tengo identificador → NO bloquea el agendado (minimización de datos)", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("no lo tengo a la mano pero quiero agendar el jueves"),
    leads: [{ id: "l1", nombre: "Juan Pérez", institucion: "IMSS" }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("no lo tengo a la mano pero quiero agendar el jueves"), deps);

  const respuesta = sent.join("\n");
  assert.doesNotMatch(respuesta, /NSS|seguro social|curp|rfc/i, "no debe pedir identificador");
  assert.match(respuesta, /cita|disponible|confirmada|le puedo ofrecer/i, "debe ofrecer/confirmar cita");
});

test("agendar hora concreta → persiste la cita y luego confirma", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("agéndame el jueves a las 10:00"),
    leads: [{ id: "l1", nombre: "Juan Pérez", institucion: "IMSS" }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("agéndame el jueves a las 10:00"), deps);

  assert.equal(citas(mock).length, 1, "debe crear UNA cita");
  assert.match(sent.join("\n"), /confirmada/);
  const fecha = String(citas(mock)[0].fecha);
  assert.match(fecha, /T16:00:00/, "jueves 10:00 local = 16:00 UTC (verano -6)");
});

test("reagendar → actualiza la cita existente (no duplica)", async () => {
  const oldDate = new Date(Date.UTC(2026, 8, 15, 16, 0, 0)).toISOString();
  const mock = makeMockPb({
    messages: seedMidConversation("cambiemos la cita para el viernes a las 12:00"),
    leads: [{ id: "l1", nombre: "Juan Pérez", institucion: "IMSS" }],
    citas: [{ id: "cita-original", lead: "l1", fecha: oldDate }],
  });
  const { deps } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("cambiemos la cita para el viernes a las 12:00"), deps);

  assert.equal(citas(mock).length, 1, "sigue habiendo UNA cita (reagendó, no duplicó)");
  assert.equal(citas(mock)[0].id, "cita-original", "actualiza la cita existente");
});

test("mensaje compuesto con pregunta de asesor → escala, no inventa", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("Ya me autorizaron el préstamo? cuánto me van a prestar"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: [{ id: C, bot_activo: true, necesita_asesor: false }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("Ya me autorizaron el préstamo? cuánto me van a prestar"), deps);

  assert.match(sent.join("\n"), /asesor/);
  const conv = mock.collections["conversations"]?.[0];
  assert.equal(conv?.necesita_asesor, true);
});

test("ráfaga (turno obsoleto) → no responde cuando ya hay un mensaje más reciente", async () => {
  // El mensaje más reciente es OTRO (posterior al que disparó este turno).
  const mock = makeMockPb({
    messages: [
      msg({ remitente: "bot", contenido: "¿En qué le ayudo?", created: "2026-09-13T09:00:00Z" }),
      msg({ id: "m-cli", remitente: "cliente", contenido: "hola", created: "2026-09-13T09:05:00Z" }),
      msg({ id: "m-mas-reciente", remitente: "cliente", contenido: "dame la dirección", created: "2026-09-13T09:06:00Z" }),
    ],
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
  });
  const { deps, sent } = makeDeps(mock);

  // Este turno fue disparado por "m-cli" (el penúltimo); el más reciente ya es otro.
  await procesarTurnoBot(timedArgs("hola"), deps);

  assert.equal(sent.length, 0, "turno obsoleto NO debe responder");
});

test("error del LLM (timeout) → fallback honesto, no Cierre B en bucle", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("quiero saber cuánto me prestan"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
  });
  const { deps, sent } = makeDeps(mock, {
    runBotTurn: async () => {
      throw new Error("timeout simulado");
    },
  });

  await procesarTurnoBot(timedArgs("quiero saber cuánto me prestan"), deps);

  assert.ok(sent.length > 0, "no debe quedar en silencio");
  assert.doesNotMatch(sent.join("\n"), /ya quedó registrada su información/i, "no Cierre B en bucle");
});

test("error de PocketBase al leer → el handler no revienta (sin excepción)", async () => {
  const mock = makeMockPb();
  const { deps } = makeDeps(mock, {
    runBotTurn: async () => ({ reply: "Hola", escalate: false, leadData: null, cita: null }),
  });

  await assert.doesNotReject(
    procesarTurnoBot(
      timedArgs("hola", { esLeadNuevo: true })
        // sin history: primer turno
      , deps)
  );
});

test("pedir hablar con una persona → avisa asesor y marca la conversación", async () => {
  const mock = makeMockPb({
    messages: seedMidConversation("quiero hablar con una persona"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: [{ id: C, bot_activo: true, necesita_asesor: false }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("quiero hablar con una persona"), deps);

  assert.match(sent.join("\n"), /asesor/);
  assert.equal(mock.collections["conversations"]?.[0]?.necesita_asesor, true);
});

test("saludo del primer contacto es fijo (no pasa por LLM)", async () => {
  let llamoLLM = false;
  const mock = makeMockPb({ leads: [{ id: "l1" }] });
  const { deps, sent } = makeDeps(mock, {
    runBotTurn: async () => {
      llamoLLM = true;
      return { reply: null, escalate: false, leadData: null, cita: null };
    },
  });

  await procesarTurnoBot(timedArgs("hola", { esLeadNuevo: true }), deps);

  assert.equal(llamoLLM, false, "el saludo no pasa por el LLM");
  assert.match(sent.join("\n"), /Créditos a tu medida/);
  assert.match(sent.join("\n"), /nombre completo/);
});

test("cliente recurrente en sesión nueva → lo saluda por su nombre", async () => {
  const mock = makeMockPb({
    messages: [
      msg({ remitente: "bot", contenido: "hola anterior", created: "2026-09-10T08:00:00Z" }),
      msg({ id: "m-cli", remitente: "cliente", contenido: "hola de nuevo", created: "2026-09-10T09:00:00Z" }),
    ],
    leads: [{ id: "l1", nombre: "Juan Pérez López" }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(
    timedArgs("hola de nuevo", { esRecurrente: true, mensajeId: "m-cli" }),
    deps
  );

  assert.match(sent.join("\n"), /Hola de nuevo, Juan Pérez/);
});