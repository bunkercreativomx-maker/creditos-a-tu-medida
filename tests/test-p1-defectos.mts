// Regresiones de los 6 defectos P1 del informe /opt/data/review-creditos-3556c3e.md
// ejecutando el handler REAL (lib/turno.ts → procesarTurnoBot) con adaptadores
// mock, más los escenarios exigidos (conversación >20 mensajes, ráfaga durante
// LLM, takeover, error de PocketBase, envío fallido). Las aserciones comprueban
// el comportamiento CORREGIDO: deben fallar contra 3556c3e y pasar con el fix.
//
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-p1-defectos.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { procesarTurnoBot, type TurnoDeps } from "@/lib/turno.ts";
import { mergeLeadData } from "@/lib/bot.ts";
import { pideUbicacion, pideCancelarCita } from "@/lib/intenciones.ts";
import { makeMockPb, type MockPb } from "./helpers/mock-pb.mts";

const C = "c1";

// ---------- utilidades ----------

function convSeed() {
  return [{ id: C, lead: "l1", telefono: "6564535107", bot_activo: true, necesita_asesor: false }];
}

function msg(over: Record<string, unknown>): Record<string, unknown> {
  return { conversation: C, remitente: "cliente", contenido: "", created: "2026-09-13T09:00:00Z", ...over };
}

function midChat(textoCliente: string, extra: Record<string, unknown>[] = []) {
  return [
    msg({ remitente: "bot", contenido: "¿En qué le puedo ayudar?" }),
    ...extra,
    msg({ id: "m-cli", remitente: "cliente", contenido: textoCliente, created: "2026-09-13T09:05:00Z" }),
  ];
}

function makeDeps(mock: MockPb, overrides: Partial<TurnoDeps> = {}) {
  const sent: string[] = [];
  const advisorCalls: number[] = [];
  const base: TurnoDeps = {
    pb: mock.pb,
    send: async (_cid: string, _aid: string, text: string) => {
      sent.push(text);
    },
    runBotTurn: async () => ({ reply: null, escalate: false, leadData: null, cita: null }),
    notifyNeedsAdvisor: async () => {
      advisorCalls.push(advisorCalls.length);
    },
    notifyNewLead: async () => {},
    notifyNewLeadToSlack: async () => {},
    ...overrides,
  };
  return { deps: base, sent, advisorCalls };
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

// ---------- P1-1 : historial (últimos N, no los 10 más viejos) ----------

test("P1-1 historial: con >20 mensajes el LLM recibe los ÚLTIMOS, incluido el disparador", async () => {
  const total = 24;
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < total; i++) {
    rows.push(
      msg({
        id: `m${i}`,
        remitente: i % 2 ? "cliente" : "bot",
        contenido: i % 2 ? `mensaje cliente ${i}` : `mensaje bot ${i}`,
        created: new Date(Date.UTC(2026, 8, 13, 9, 0, i)).toISOString(),
      })
    );
  }
  // El disparador (el más reciente) CAMBIA de intención al final.
  const disparador = "mejor lo dejamos en pausa por ahora";
  rows.push(msg({ id: "m-cli", remitente: "cliente", contenido: disparador, created: new Date(Date.UTC(2026, 8, 14, 10, 0, 0)).toISOString() }));

  let history: { role: string; content: string }[] = [];
  let calls = 0;
  const mock = makeMockPb({ messages: rows, leads: [{ id: "l1", nombre: "Juan Pérez" }], conversations: convSeed() });
  const { deps, sent } = makeDeps(mock, {
    runBotTurn: async (h) => {
      calls++;
      history = h;
      return { reply: "entendido", escalate: false, leadData: null, cita: null };
    },
  });

  await procesarTurnoBot(timedArgs(disparador), deps);

  assert.equal(calls, 1, "debe llamar al LLM");
  assert.ok(history.length >= 21, `historial debe incluir >20 mensajes, recibió ${history.length}`);
  assert.equal(history.at(-1)?.content, disparador, "el último mensaje del LLM es el disparador actual");
  assert.ok(history.some((m) => m.content.includes("mensaje cliente 11")), "incluye mensajes que los 10-más-viejos excluían");
  assert.equal(sent[0], "entendido");
});

// ---------- P1-2 : audio → transcripción → respuesta congruente; fallo → asesor ----------

test("P1-2 audio: transcribe, clasifica como audio (no imagen) y responde al texto", async () => {
  const url = "https://media.invalid/nota.ogg";
  const transcript = "me gustaría saber más de sus servicios";
  const rows = [
    msg({ remitente: "bot", contenido: "Hola" }),
    msg({ id: "m-cli", remitente: "cliente", contenido: "", media_type: "audio", media_url: url, created: "2026-09-13T09:05:00Z" }),
  ];
  const mock = makeMockPb({ messages: rows, leads: [{ id: "l1", nombre: "Juan Pérez" }], conversations: convSeed() });
  const transcribes: { url?: string | null; mediaId?: string | null; accountId?: string | null }[] = [];
  let history: { role: string; content: string }[] = [];
  const { deps, sent } = makeDeps(mock, {
    transcribirAudio: async (audio: {
      url?: string | null;
      mediaId?: string | null;
      accountId?: string | null;
    }) => {
      transcribes.push(audio);
      return transcript;
    },
    runBotTurn: async (h) => {
      history = h;
      return { reply: "Claro, contamos con varios servicios de préstamo.", escalate: false, leadData: null, cita: null };
    },
  });

  await procesarTurnoBot(
    {
      parsed: {
        text: "",
        telefono: "6564535107",
        nombre: "Juan Pérez",
        conversationId: "zc-1",
        accountId: "za-cr",
        attachments: [{ type: "audio", url }],
      },
      leadId: "l1",
      conversationId: C,
      esLeadNuevo: false,
      mensajeId: "m-cli",
    },
    deps
  );

  assert.equal(transcribes.length, 1, "llamó al STT con el adjunto de audio");
  assert.equal(transcribes[0]?.url, url, "le pasó la url del adjunto");
  assert.equal(transcribes[0]?.accountId, "za-cr", "le pasó el accountId (para descargar con credencial)");
  assert.ok(!history.some((m) => /imagen|foto/.test(m.content)), "el audio NO se clasificó como imagen");
  assert.equal(history.at(-1)?.content, transcript, "la transcripción es el texto del cliente en el historial");
  assert.match(sent[0], /servicios/, "respuesta congruente con el texto transcribido");
  const cliMsg = mock.collections["messages"].find((m) => m.id === "m-cli");
  assert.equal(cliMsg?.contenido, transcript, "persiste el texto utilizable en el mensaje");
});

test("P1-2 audio: STT falla → deriva a asesor (no inventa, no ignora)", async () => {
  const url = "https://media.invalid/nota.ogg";
  const mock = makeMockPb({
    messages: [
      msg({ remitente: "bot", contenido: "Hola" }),
      msg({ id: "m-cli", remitente: "cliente", contenido: "", media_type: "audio", media_url: url, created: "2026-09-13T09:05:00Z" }),
    ],
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  let transcribes = 0;
  let llmCalls = 0;
  const { deps, sent, advisorCalls } = makeDeps(mock, {
    transcribirAudio: async () => {
      transcribes++;
      return null; // STT no pudo transcribir
    },
    runBotTurn: async () => {
      llmCalls++;
      return { reply: "x", escalate: false, leadData: null, cita: null };
    },
  });

  await procesarTurnoBot(
    {
      parsed: {
        text: "",
        telefono: "6564535107",
        nombre: "Juan Pérez",
        conversationId: "zc-1",
        accountId: "za-cr",
        attachments: [{ type: "audio", url }],
      },
      leadId: "l1",
      conversationId: C,
      esLeadNuevo: false,
      mensajeId: "m-cli",
    },
    deps
  );

  assert.equal(transcribes, 1, "intentó transcribir");
  assert.equal(llmCalls, 0, "no mandó un audio vacío al LLM");
  assert.match(sent[0], /asesor/i, "deriva a asesor de forma visible");
  assert.doesNotMatch(sent[0], /imagen|foto/, "nunca dice 'imagen'");
  assert.equal(mock.collections["conversations"][0]?.necesita_asesor, true, "marca para asesor");
  assert.equal(advisorCalls.length, 1, "notifica que necesita asesor");
});

// ---------- P1-3 : fallo técnico ≠ consentimiento ----------

test("P1-3: fallo del LLM en mensaje que NO pide cita → NO ofrece cita y deriva", async () => {
  const mock = makeMockPb({
    messages: midChat("No entendí la pregunta"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  let calls = 0;
  const { deps, sent, advisorCalls } = makeDeps(mock, {
    runBotTurn: async () => {
      calls++;
      throw new Error("timeout simulado");
    },
  });

  await procesarTurnoBot(timedArgs("No entendí la pregunta"), deps);

  assert.equal(calls, 1, "el LLM sí se invocó (el fallo es real)");
  assert.doesNotMatch(sent.join("\n"), /cita|disponible a las/i, "NO ofrece cita por defecto tras el fallo");
  assert.equal(mock.collections["conversations"][0]?.necesita_asesor, true, "marca para asesor");
  assert.ok(advisorCalls.length >= 1, "notifica que necesita asesor");
});

// ---------- P1-4 : cancelar / cambiar cita ----------

test("P1-4: cancelar mi cita → elimina el registro y confirma (no confirma la vieja)", async () => {
  const mock = makeMockPb({
    messages: midChat("Quiero cancelar mi cita"),
    leads: [{ id: "l1", nombre: "Juan Pérez", institucion: "IMSS" }],
    conversations: convSeed(),
    citas: [{ id: "cita1", lead: "l1", fecha: "2026-09-17T16:00:00Z" }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("Quiero cancelar mi cita"), deps);

  assert.equal(mock.collections["citas"].length, 0, "la cita se eliminó");
  assert.match(sent[0], /cancelada/i);
  assert.doesNotMatch(sent.join("\n"), /Su cita está agendada/, "no confirma la cita anterior");
});

test("P1-4: cambiar mi cita → actualiza (no duplica) y confirma", async () => {
  const mock = makeMockPb({
    messages: midChat("quiero cambiar mi cita para el viernes a las 11:00"),
    leads: [{ id: "l1", nombre: "Juan Pérez", institucion: "IMSS" }],
    conversations: convSeed(),
    citas: [{ id: "cita-original", lead: "l1", fecha: "2026-09-17T16:00:00Z" }],
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("quiero cambiar mi cita para el viernes a las 11:00"), deps);

  assert.equal(mock.collections["citas"].length, 1, "sigue una sola cita");
  assert.equal(mock.collections["citas"][0].id, "cita-original", "no creó una nueva");
  assert.notEqual(mock.collections["citas"][0].fecha, "2026-09-17T16:00:00Z", "cambió la fecha");
  assert.match(sent[0], /confirmada|listo/i, "confirma el cambio");
});

// ---------- P1-5 : petición compuesta (asesor + dirección) ----------

test("P1-5: pedir asesor y dirección → atiende AMBAS (no pierde la humana)", async () => {
  const mock = makeMockPb({
    messages: midChat("Quiero hablar con un asesor y saber la dirección"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  const { deps, sent } = makeDeps(mock);

  await procesarTurnoBot(timedArgs("Quiero hablar con un asesor y saber la dirección"), deps);

  const reply = sent.join("\n");
  assert.match(reply, /Benjamín Franklin 3220/, "entrega la dirección");
  assert.match(reply, /asesor/, "también escala a asesor");
  assert.equal(mock.collections["conversations"][0]?.necesita_asesor, true, "marca para asesor");
});

test("P1-5: pideUbicacion endurecido no confunde 'mi domicilio' con pedir dirección", () => {
  assert.equal(pideUbicacion("el asesor anotó mi domicilio para la cita"), false);
  assert.equal(pideUbicacion("fui a su oficina ayer"), false);
  assert.equal(pideUbicacion("dame la dirección"), true);
  assert.equal(pideUbicacion("¿cuál es su oficina?"), true);
  assert.equal(pideCancelarCita("quiero cancelar mi cita"), true);
});

// ---------- P1-6 : envío fallido → sin registro fantasma + handoff ----------

test("P1-6: envío fallido → no se registra mensaje fantasma y se deriva", async () => {
  const mock = makeMockPb({
    messages: [
      msg({ remitente: "bot", contenido: "¿En qué le ayudo?" }),
      msg({ id: "m-cli", remitente: "cliente", contenido: "Dame la dirección", created: "2026-09-13T09:05:00Z" }),
    ],
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  let sends = 0;
  const { deps, sent, advisorCalls } = makeDeps(mock, {
    send: async () => {
      sends++;
      throw new Error("simulated delivery failure");
    },
  });

  await procesarTurnoBot(timedArgs("Dame la dirección"), deps);

  assert.ok(sends >= 2, "intentó el envío (con reintento)");
  assert.equal(sent.length, 0, "ningún envío tuvo éxito");
  assert.equal(mock.collections["messages"].filter((m) => m.remitente === "bot").length, 1, "NO persistió mensaje fantasma (solo el seed)");
  assert.equal(mock.collections["conversations"][0]?.necesita_asesor, true, "handoff visible");
  assert.ok(advisorCalls.length >= 1, "notifica que necesita asesor");
});

// ---------- Escenarios adicionales exigidos ----------

test("extra: ráfaga DURANTE el LLM → no responde (turno quedó obsoleto)", async () => {
  const mock = makeMockPb({
    messages: midChat("hola, ¿cómo estás?"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  const { deps, sent } = makeDeps(mock, {
    runBotTurn: async () => {
      // Mientras el LLM "procesa", llega otro mensaje del cliente.
      await mock.pb.collection("messages").create({
        conversation: C,
        remitente: "cliente",
        contenido: "dame la dirección",
        created: new Date(Date.UTC(2026, 8, 14, 12, 0, 0)).toISOString(),
      });
      return { reply: "respuesta que ya no aplica", escalate: false, leadData: null, cita: null };
    },
  });

  await procesarTurnoBot(timedArgs("hola, ¿cómo estás?"), deps);

  assert.equal(sent.length, 0, "el turno obsoleto no responde");
});

test("extra: takeover del asesor durante el LLM → no contesta el bot", async () => {
  const mock = makeMockPb({
    messages: midChat("ok, adelante"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  const { deps, sent } = makeDeps(mock, {
    runBotTurn: async () => {
      // Un asesor toma la conversación durante el await.
      await mock.pb.collection("conversations").update(C, { necesita_asesor: true });
      return { reply: "respuesta del bot que ya no debe mandarse", escalate: false, leadData: null, cita: null };
    },
  });

  await procesarTurnoBot(timedArgs("ok, adelante"), deps);

  assert.equal(sent.length, 0, "el bot calla porque el asesor se quedó con la conversación");
});

test("extra: error de lectura de PocketBase con recuperación y respuesta", async () => {
  const mock = makeMockPb({
    messages: midChat("hola"),
    leads: [{ id: "l1", nombre: "Juan Pérez" }],
    conversations: convSeed(),
  });
  // Envolvemos el pb para que el PRIMER getList de "messages" falle y se recupere.
  let reads = 0;
  const inner = mock.pb;
  const flaky = {
    collection(n: string) {
      const rec = inner.collection(n);
      if (n === "messages") {
        const orig = rec.getList.bind(rec);
        rec.getList = async (...a: unknown[]) => {
          reads++;
          if (reads === 1) throw new Error("PB read failure (simulado)");
          return orig(...(a as [number, number, Record<string, unknown>]));
        };
      }
      return rec;
    },
  } as unknown as TurnoDeps["pb"];
  const { deps, sent } = makeDeps(mock, {
    pb: flaky,
    runBotTurn: async () => ({ reply: "estoy aquí", escalate: false, leadData: null, cita: null }),
  });

  await procesarTurnoBot(timedArgs("hola"), deps);

  assert.ok(sent.length >= 1, "recuperó y respondió");
  assert.equal(sent[0], "estoy aquí");
});

test("extra: merge de leadData parcial no pierde campos previos", () => {
  const a = mergeLeadData(null, { nombre: "Ana" });
  const b = mergeLeadData(a, { dependencia: "IMSS" });
  assert.equal(b?.nombre, "Ana", "conserva el nombre de la llamada anterior");
  assert.equal(b?.dependencia, "IMSS", "agrega la dependencia");
});
