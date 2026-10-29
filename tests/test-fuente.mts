// Atribución de leads: "(Ref: CODIGO)" del mensaje prellenado del sitio → leads.fuente.
// Ejercita el webhook REAL (procesarEntrante) con el mock de PocketBase.
// Ejecutar: node --import ./tests/loader.mjs --test tests/test-fuente.mts

import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerFuente, etiquetaFuente, slugCodigo } from "@/lib/fuente.ts";
import { procesarEntrante, type EntrantePb, type EntranteDeps } from "@/lib/webhook-entrante.ts";
import { makeMockPb, type MockPb } from "./helpers/mock-pb.mts";

const ACCOUNT_ID = "6a97367b77555aae01b11e1a";
const TELEFONO = "6564535107";

function textEvent(text: string, id = "evt-f-1"): Record<string, unknown> {
  return {
    id,
    event: "message.received",
    timestamp: "2026-10-28T18:00:00Z",
    message: {
      id: `zm-${id}`,
      conversationId: "zc-1",
      platform: "whatsapp",
      platformMessageId: `wamid.${id}`,
      direction: "incoming",
      text,
      attachments: [],
      sender: { id: TELEFONO, phoneNumber: `+52${TELEFONO}`, name: "Juan Pérez" },
      sentAt: "2026-10-28T18:00:00Z",
      isRead: false,
    },
    conversation: { id: "zc-1", platformConversationId: "pc-1", participantId: TELEFONO, participantName: "Juan Pérez", status: "active" },
    account: { id: ACCOUNT_ID, platform: "whatsapp", username: "creditos" },
  };
}

function makeDeps(mock: MockPb): { deps: EntranteDeps; esperar: () => Promise<unknown> } {
  const pend: Promise<void>[] = [];
  const deps: EntranteDeps = {
    pb: mock.pb as unknown as EntrantePb,
    send: async () => {},
    runBotTurn: async () => ({ reply: null, escalate: false, leadData: null, cita: null }),
    transcribirAudio: async () => "",
    notifyNeedsAdvisor: async () => {},
    notifyNewLead: async () => {},
    notifyNewLeadToSlack: async () => {},
    after: (fn: () => Promise<void>) => {
      pend.push(fn().catch(() => {}));
    },
    accountIdEsperado: ACCOUNT_ID,
  } as EntranteDeps;
  return { deps, esperar: () => Promise.all(pend) };
}

test("extraerFuente: lee el código de la referencia y tolera mayúsculas/espacios", () => {
  assert.equal(extraerFuente("Hola, quiero información sobre un crédito. (Ref: FB-VIDEO-OCT26)"), "FB-VIDEO-OCT26");
  assert.equal(extraerFuente("hola (ref:web)"), "WEB");
  assert.equal(extraerFuente("Hola, quiero un crédito"), null);
  assert.equal(extraerFuente(null), null);
  assert.equal(etiquetaFuente("FB-X"), "Anuncio Facebook/Instagram");
  assert.equal(etiquetaFuente("WEB"), "Sitio web");
  assert.equal(slugCodigo("Video Ad · Octubre 2026"), "VIDEO-AD-OCTUBRE-2026");
});

test("lead nuevo por WhatsApp con (Ref: FB-…) guarda leads.fuente", async () => {
  const mock = makeMockPb({});
  const { deps, esperar } = makeDeps(mock);
  await procesarEntrante(textEvent("Hola, quiero información sobre un crédito. (Ref: FB-VIDEO1)") as never, deps);
  await esperar();
  const leads = mock.collections["leads"] ?? [];
  assert.equal(leads.length, 1);
  assert.equal(leads[0].fuente, "FB-VIDEO1");
  assert.equal(leads[0].origen, "whatsapp");
});

test("lead nuevo sin referencia no inventa fuente", async () => {
  const mock = makeMockPb({});
  const { deps, esperar } = makeDeps(mock);
  await procesarEntrante(textEvent("Hola buenas tardes") as never, deps);
  await esperar();
  const leads = mock.collections["leads"] ?? [];
  assert.equal(leads.length, 1);
  assert.equal(leads[0].fuente ?? null, null);
});

test("lead existente: se registra la fuente si no tenía y NUNCA se sobrescribe", async () => {
  const mock = makeMockPb({ leads: [{ id: "l1", nombre: "Juan", telefono: TELEFONO, origen: "whatsapp", status: "nuevo" }] });
  const { deps, esperar } = makeDeps(mock);
  await procesarEntrante(textEvent("Hola (Ref: FB-A)", "e1") as never, deps);
  await esperar();
  assert.equal(mock.collections["leads"][0].fuente, "FB-A");
  await procesarEntrante(textEvent("Otra vez (Ref: WEB)", "e2") as never, deps);
  await esperar();
  assert.equal(mock.collections["leads"][0].fuente, "FB-A");
});
