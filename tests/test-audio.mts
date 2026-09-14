// Audios de WhatsApp (notas de voz) — regresiones del reporte del usuario
// "no lo leyó el audio que mandé".
//
// Se ejercita el código REAL: el webhook entrante (`lib/webhook-entrante.ts` →
// `procesarEntrante`), el turno (`lib/turno.ts` → `procesarTurnoBot`) y la
// transcripción (`lib/transcribe.ts` → `transcribirAudioUrl`), con el payload
// con la FORMA REAL de Zernio:
//   message.attachments = [{ type: "audio",
//                            url: "https://<base>/v1/whatsapp/media/<id>",  // AUTENTICADO
//                            payload: { id: "<mediaId>" } }]
// y `fetch` stubbeado (Zernio + fal). Nunca se usa una URL pública falsa: si el
// código volviera a pasarle la URL del adjunto a fal, la descarga con credencial
// no ocurriría y el test falla.
//
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-audio.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { transcribirAudioUrl } from "@/lib/transcribe.ts";
import {
  procesarEntrante,
  type EntrantePb,
  type EntranteDeps,
} from "@/lib/webhook-entrante.ts";
import { parseInboundMessage } from "@/lib/zernio.ts";
import { makeMockPb, type MockPb } from "./helpers/mock-pb.mts";

const C = "c1";
const MEDIA_ID = "MEDIA1234567890";
const ACCOUNT_ID = "6a97367b77555aae01b11e1a";
const TELEFONO = "6564535107";

// ---------- utilidades ----------

/** Evento `message.received` con la forma REAL (audio entrante de WhatsApp). */
function audioEvent(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt-audio-1",
    event: "message.received",
    timestamp: "2026-09-14T05:00:00Z",
    message: {
      id: "zm-1",
      conversationId: "zc-1",
      platform: "whatsapp",
      platformMessageId: "wamid.TEST",
      direction: "incoming",
      text: null,
      attachments: [
        {
          type: "audio",
          // Endpoint AUTENTICADO de Zernio: NO es un enlace público.
          url: `https://zernio.com/api/v1/whatsapp/media/${MEDIA_ID}?accountId=${ACCOUNT_ID}`,
          payload: { id: MEDIA_ID, mime_type: "audio/ogg" },
        },
      ],
      sender: { id: TELEFONO, phoneNumber: `+52${TELEFONO}`, name: "Juan Pérez" },
      sentAt: "2026-09-14T05:00:00Z",
      isRead: false,
    },
    conversation: {
      id: "zc-1",
      platformConversationId: "pc-1",
      participantId: TELEFONO,
      participantName: "Juan Pérez",
      status: "active",
    },
    account: { id: ACCOUNT_ID, platform: "whatsapp", username: "creditos" },
    ...over,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function audioResponse(bytes = 4096, mime = "audio/ogg"): Response {
  return new Response(new Uint8Array(bytes).fill(7), {
    status: 200,
    headers: { "content-type": mime },
  });
}

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
};
type Handler = (call: FetchCall) => Response | Promise<Response> | null;

/** Instala un `fetch` falso y devuelve las llamadas registradas. */
function installFetch(handler: Handler) {
  const original = globalThis.fetch;
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers: Record<string, string> = {};
    const rawHeaders = (init?.headers ?? {}) as Record<string, string>;
    for (const [k, v] of Object.entries(rawHeaders)) headers[k.toLowerCase()] = String(v);
    const call: FetchCall = {
      url,
      method: init?.method ?? "GET",
      headers,
      body: init?.body,
      signal: init?.signal ?? undefined,
    };
    calls.push(call);
    const res = await handler(call);
    if (!res) throw new Error(`fetch no stubbeado: ${call.method} ${url}`);
    return res;
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = original;
    },
    byPath: (re: RegExp) => calls.filter((c) => re.test(c.url)),
  };
}

/** Handler feliz: Zernio (con credencial) + storage de fal + whisper. */
function handlerFeliz(transcript: string, sobre: { mediaStatus?: number } = {}): Handler {
  return (call) => {
    if (/\/v1\/whatsapp\/media\//.test(call.url)) {
      if (sobre.mediaStatus && sobre.mediaStatus !== 200) {
        return new Response("no autorizado", { status: sobre.mediaStatus });
      }
      return audioResponse();
    }
    if (/\/storage\/upload\/initiate/.test(call.url)) {
      return jsonResponse({
        file_url: "https://fal-cdn.example/file/nota.ogg",
        upload_url: "https://fal-cdn.example/upload/nota.ogg",
      });
    }
    if (/fal-cdn\.example\/upload\//.test(call.url)) {
      return new Response(null, { status: 200 });
    }
    if (/queue\.fal\.run\/.+\/requests\/.+\/status/.test(call.url)) {
      return jsonResponse({ status: "COMPLETED" });
    }
    if (/queue\.fal\.run\/.+\/requests\/[^/]+$/.test(call.url)) {
      return jsonResponse({ text: transcript, chunks: [{ text: transcript }] });
    }
    if (/queue\.fal\.run\//.test(call.url)) {
      return jsonResponse({
        request_id: "req-1",
        status_url: "https://queue.fal.run/fal-ai/whisper/requests/req-1/status",
        response_url: "https://queue.fal.run/fal-ai/whisper/requests/req-1",
      });
    }
    return null;
  };
}

/** Handler de Zernio: nunca responde (para probar el tope de tiempo). */
function fetchQueCuelga(): Handler {
  return (call) => {
    if (/\/v1\/whatsapp\/media\//.test(call.url)) return audioResponse();
    if (/\/storage\/upload\/initiate/.test(call.url)) {
      return jsonResponse({
        file_url: "https://fal-cdn.example/file/nota.ogg",
        upload_url: "https://fal-cdn.example/upload/nota.ogg",
      });
    }
    if (/fal-cdn\.example\/upload\//.test(call.url)) return new Response(null, { status: 200 });
    return new Promise<Response>((_res, rej) => {
      const abortar = () => rej(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
      if (call.signal?.aborted) abortar();
      else call.signal?.addEventListener("abort", abortar);
    });
  };
}

/** Semilla de una conversación a media charla (ya hay mensaje del bot). */
function seedDoc(msgOver: Record<string, unknown> = {}) {
  return {
    leads: [{ id: "l1", nombre: "Juan Pérez", telefono: TELEFONO }],
    conversations: [{ id: C, lead: "l1", telefono: TELEFONO, bot_activo: true, necesita_asesor: false }],
    messages: [
      {
        id: "m-bot",
        conversation: C,
        remitente: "bot",
        contenido: "¿En qué le puedo ayudar?",
        // En el pasado: el mensaje del cliente que crea el webhook debe ser el MÁS
        // reciente (el guard anti-doble-respuesta descarta el turno si no lo es).
        created: "2026-09-13T04:00:00Z",
        ...msgOver,
      },
    ],
  };
}

function makeDeps(mock: MockPb, overrides: Partial<EntranteDeps> = {}) {
  const sent: string[] = [];
  const pendientes: Promise<void>[] = [];
  const deps: EntranteDeps = {
    pb: mock.pb as unknown as EntrantePb,
    send: async (_cid: string, _aid: string, text: string) => {
      sent.push(text);
    },
    runBotTurn: async () => ({ reply: null, escalate: false, leadData: null, cita: null }),
    transcribirAudio: transcribirAudioUrl,
    notifyNeedsAdvisor: async () => {},
    notifyNewLead: async () => {},
    notifyNewLeadToSlack: async () => {},
    // La ruta usa `after()` (trabajo post-ACK); aquí se recolecta y se espera.
    after: (fn: () => Promise<void>) => {
      pendientes.push(fn());
    },
    accountIdEsperado: ACCOUNT_ID,
    ...overrides,
  };
  return { deps, sent, pendientes, esperarAfter: () => Promise.all(pendientes) };
}

function trazas(mock: MockPb) {
  return (mock.collections["webhook_debug"] ?? []) as Record<string, unknown>[];
}

// ---------- entorno de las pruebas ----------

process.env.ZERNIO_API_KEY = "zk-test";
process.env.FAL_KEY = "fal-test";
process.env.STT_PROVIDER = "fal";

// ---------- (0) el parser conserva el mediaId del adjunto ----------

test("parser: el adjunto de audio conserva url autenticada y payload.id (mediaId)", () => {
  const parsed = parseInboundMessage(audioEvent() as never);
  assert.equal(parsed.text, null, "una nota de voz llega con text: null");
  assert.equal(parsed.attachments.length, 1);
  assert.equal(parsed.attachments[0].type, "audio");
  assert.equal(parsed.attachments[0].payload?.id, MEDIA_ID);
  assert.match(parsed.attachments[0].url, /\/v1\/whatsapp\/media\//);
  assert.equal(parsed.direction, "incoming");
});

// ---------- (1) caso REAL de punta a punta ----------

test("audio real: descarga con la credencial de Zernio, sube a fal, transcribe y responde el texto", async () => {
  const transcript = "me gustaría saber más de sus servicios";
  const fetchStub = installFetch(handlerFeliz(transcript));
  const mock = makeMockPb(seedDoc());
  let history: { role: string; content: string }[] = [];
  let llmCalls = 0;
  const { deps, sent, esperarAfter } = makeDeps(mock, {
    runBotTurn: async (h: { role: "user" | "assistant"; content: string }[]) => {
      llmCalls++;
      history = h;
      return { reply: "Claro, contamos con varios servicios de préstamo.", escalate: false, leadData: null, cita: null };
    },
  });

  try {
    const resultado = await procesarEntrante(audioEvent() as never, deps);
    assert.equal(resultado.ok, true);
    assert.equal(resultado.accepted, true, "el entrante con audio se ACEPTA (no cae en 'payload incompleto')");
    await esperarAfter();
  } finally {
    fetchStub.restore();
  }

  // 1. Descargó el media usando el endpoint autenticado y la credencial.
  const descargas = fetchStub.byPath(/\/v1\/whatsapp\/media\//);
  assert.equal(descargas.length, 1, "descargó el audio UNA vez desde el endpoint de Zernio");
  assert.match(descargas[0].url, new RegExp(MEDIA_ID), "usó el mediaId del payload.id");
  assert.equal(descargas[0].headers.authorization, "Bearer zk-test", "descargó CON la credencial de Zernio");

  // 2. Subió los bytes al storage de fal (fal rechaza data URLs).
  const init = fetchStub.byPath(/\/storage\/upload\/initiate/);
  assert.equal(init.length, 1, "pidió un slot de subida a fal");
  assert.equal(init[0].headers.authorization, "Key fal-test");
  const put = fetchStub.byPath(/fal-cdn\.example\/upload\//);
  assert.equal(put.length, 1, "subió los bytes al upload_url");
  assert.equal(put[0].method, "PUT");

  // 3. Transcribió la URL PÚBLICA de fal (no la del adjunto).
  const submit = fetchStub.byPath(/queue\.fal\.run\/fal-ai\/whisper$/);
  assert.equal(submit.length, 1, "sometió el trabajo de whisper");
  const cuerpo = JSON.parse(String(submit[0].body)) as { audio_url: string };
  assert.equal(cuerpo.audio_url, "https://fal-cdn.example/file/nota.ogg");

  // 4. El turno respondió al TEXTO transcrito (nunca como imagen).
  assert.equal(llmCalls, 1, "el LLM corrió con el texto del audio");
  assert.equal(history.at(-1)?.content, transcript);
  assert.ok(!history.some((m) => /imagen|foto/.test(m.content)), "el audio NO se clasificó como imagen");
  assert.match(sent.join("\n"), /servicios/, "respuesta congruente con la transcripción");

  // 5. El mensaje del cliente queda persistido con media_type audio y el texto.
  const cli = (mock.collections["messages"] ?? []).find((m) => m.remitente === "cliente");
  assert.equal(cli?.media_type, "audio");
  assert.equal(cli?.contenido, transcript);
  assert.match(String(cli?.media_url), /\/v1\/whatsapp\/media\//, "guarda la referencia del media");

  // 6. Traza: el entrante quedó marcado como procesado.
  assert.equal(trazas(mock).length, 1);
  assert.equal(trazas(mock)[0].motivo, "procesado");
  assert.equal(trazas(mock)[0].has_attachments, true);
  assert.equal(trazas(mock)[0].attachment_types, "audio");
});

// ---------- (2) descarga 401/403 ----------

test("descarga 401/403: transcribir devuelve null (NO reintenta como URL pública)", async () => {
  const fetchStub = installFetch(handlerFeliz("nunca", { mediaStatus: 403 }));
  try {
    const texto = await transcribirAudioUrl({
      url: `https://zernio.com/api/v1/whatsapp/media/${MEDIA_ID}?accountId=${ACCOUNT_ID}`,
      mediaId: MEDIA_ID,
      accountId: ACCOUNT_ID,
    });
    assert.equal(texto, null);
    // Ni siquiera intentó pasarle la URL autenticada a fal.
    assert.equal(fetchStub.byPath(/storage\/upload\/initiate/).length, 0);
    assert.equal(fetchStub.byPath(/queue\.fal\.run/).length, 0);
  } finally {
    fetchStub.restore();
  }
});

test("audio no transcribible → deriva a asesor con mensaje honesto, nunca lo trata como imagen", async () => {
  const fetchStub = installFetch(handlerFeliz("x", { mediaStatus: 403 }));
  const mock = makeMockPb(seedDoc());
  let llmCalls = 0;
  const { deps, sent, esperarAfter } = makeDeps(mock, {
    runBotTurn: async () => {
      llmCalls++;
      return { reply: "no debería llegar aquí", escalate: false, leadData: null, cita: null };
    },
  });

  try {
    const resultado = await procesarEntrante(audioEvent() as never, deps);
    assert.equal(resultado.accepted, true, "el entrante igual se procesa y se guarda");
    await esperarAfter();
  } finally {
    fetchStub.restore();
  }

  assert.equal(llmCalls, 0, "no mandó un audio vacío al LLM");
  assert.match(sent.join("\n"), /asesor/i, "deriva a asesor de forma visible");
  assert.doesNotMatch(sent.join("\n"), /imagen|foto/i, "nunca dice 'imagen'");
  assert.equal(mock.collections["conversations"][0]?.necesita_asesor, true, "marca para asesor");
  const cli = (mock.collections["messages"] ?? []).find((m) => m.remitente === "cliente");
  assert.equal(cli?.media_type, "audio", "el audio conserva su tipo");
});

// ---------- (3) upload a fal caído ----------

test("fal storage caído: devuelve null y no somete el trabajo de STT", async () => {
  const fetchStub = installFetch((call) => {
    if (/\/v1\/whatsapp\/media\//.test(call.url)) return audioResponse();
    if (/\/storage\/upload\/initiate/.test(call.url)) {
      return new Response("boom", { status: 500 });
    }
    return null;
  });
  try {
    const texto = await transcribirAudioUrl({
      url: `https://zernio.com/api/v1/whatsapp/media/${MEDIA_ID}`,
      mediaId: MEDIA_ID,
      accountId: ACCOUNT_ID,
    });
    assert.equal(texto, null);
    assert.equal(fetchStub.byPath(/queue\.fal\.run/).length, 0, "no llegó a pedir la transcripción");
  } finally {
    fetchStub.restore();
  }
});

test("PUT del storage de fal falla: devuelve null", async () => {
  const fetchStub = installFetch((call) => {
    if (/\/v1\/whatsapp\/media\//.test(call.url)) return audioResponse();
    if (/\/storage\/upload\/initiate/.test(call.url)) {
      return jsonResponse({
        file_url: "https://fal-cdn.example/file/nota.ogg",
        upload_url: "https://fal-cdn.example/upload/nota.ogg",
      });
    }
    if (/fal-cdn\.example\/upload\//.test(call.url)) return new Response("nope", { status: 500 });
    return null;
  });
  try {
    assert.equal(
      await transcribirAudioUrl({ mediaId: MEDIA_ID, accountId: ACCOUNT_ID }),
      null
    );
    assert.equal(fetchStub.byPath(/queue\.fal\.run/).length, 0);
  } finally {
    fetchStub.restore();
  }
});

// ---------- (4) tope de tiempo propio ----------

test("tope de tiempo: si el STT se pasa del presupuesto devuelve null (no muere la función)", async () => {
  const anterior = process.env.STT_AUDIO_BUDGET_MS;
  process.env.STT_AUDIO_BUDGET_MS = "400";
  const fetchStub = installFetch(fetchQueCuelga());

  const inicio = Date.now();
  let texto: string | null = null;
  try {
    texto = await transcribirAudioUrl({ mediaId: MEDIA_ID, accountId: ACCOUNT_ID });
  } finally {
    fetchStub.restore();
    if (anterior === undefined) delete process.env.STT_AUDIO_BUDGET_MS;
    else process.env.STT_AUDIO_BUDGET_MS = anterior;
  }
  const transcurrido = Date.now() - inicio;

  assert.equal(texto, null, "sin transcripción => el turno deriva a asesor");
  assert.ok(transcurrido < 5_000, `respetó el tope (tardó ${transcurrido} ms)`);
});

// ---------- (5) traza de los descartes ----------

test("entrante ignorado: queda traza con el motivo (nada desaparece en silencio)", async () => {
  const mock = makeMockPb({});
  const { deps } = makeDeps(mock);

  const sinContenido = await procesarEntrante(
    {
      id: "evt-vacio",
      event: "message.received",
      message: {
        conversationId: "zc-1",
        text: null,
        attachments: [],
        sender: { id: TELEFONO },
        direction: "incoming",
      },
      conversation: { id: "zc-1", participantId: TELEFONO },
      account: { id: ACCOUNT_ID },
    } as never,
    deps
  );
  assert.equal(sinContenido.ignored, "payload incompleto");
  assert.equal(trazas(mock).length, 1);
  assert.equal(trazas(mock)[0].motivo, "payload incompleto");
  assert.equal(trazas(mock)[0].has_attachments, false);

  const telefonoMalo = await procesarEntrante(
    {
      id: "evt-tel",
      event: "message.received",
      message: { conversationId: "zc-1", text: "hola", attachments: [], sender: { id: "0245580093" } },
      conversation: { id: "zc-1", participantId: "0245580093" },
      account: { id: ACCOUNT_ID },
    } as never,
    deps
  );
  assert.equal(telefonoMalo.ignored, "telefono invalido");
  assert.equal(trazas(mock)[1].motivo, "telefono invalido");

  const cuentaAjena = await procesarEntrante(
    {
      id: "evt-cuenta",
      event: "message.received",
      message: { conversationId: "zc-1", text: "hola", attachments: [], sender: { id: TELEFONO } },
      conversation: { id: "zc-1", participantId: TELEFONO },
      account: { id: "otra-cuenta" },
    } as never,
    deps
  );
  assert.equal(cuentaAjena.ignored, "cuenta no es de creditos");
  assert.equal(trazas(mock)[2].motivo, "cuenta no es de creditos");

  const otroEvento = await procesarEntrante(
    { id: "evt-test", event: "webhook.test" } as never,
    deps
  );
  assert.equal(otroEvento.ignored, "webhook.test");
  assert.equal(trazas(mock)[3].motivo, "evento:webhook.test");

  // El payload crudo quedó guardado para poder diagnosticar (sin secretos).
  assert.ok(trazas(mock)[0].payload, "guarda el payload crudo");
  assert.equal(typeof trazas(mock)[0].telefono, "string");
});

test("dedupe: el mismo event.id no se procesa dos veces", async () => {
  const mock = makeMockPb(seedDoc());
  const { deps } = makeDeps(mock);
  const ev = audioEvent({ id: "evt-dup" });

  const fetchStub = installFetch(handlerFeliz("hola"));
  try {
    const primera = await procesarEntrante(ev as never, deps);
    const segunda = await procesarEntrante(ev as never, deps);
    assert.equal(primera.accepted, true);
    assert.equal(segunda.deduped, true);
  } finally {
    fetchStub.restore();
  }
  const clientes = (mock.collections["messages"] ?? []).filter((m) => m.remitente === "cliente");
  assert.equal(clientes.length, 1, "un solo mensaje persistido");
});
