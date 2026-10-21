import { test } from "node:test";
import assert from "node:assert/strict";
import { construirEventoEtapa, construirUserData, sha, EVENTO_POR_ETAPA } from "@/lib/meta-capi.ts";

const lead = {
  id: "abc123",
  telefono: "656 123 4567",
  nombre: "José María",
  apellido: "Pérez López",
  email: "Jose@Correo.com ",
  origen: "web_form",
  meta_fbc: "fb.1.1700000000000.IwAR123",
  meta_fbp: "fb.1.1700000000000.987",
  meta_ip: "201.1.2.3",
  meta_ua: "Mozilla/5.0",
};

test("etapa 'nuevo' no genera evento", () => {
  assert.equal(construirEventoEtapa(lead, "nuevo"), null);
});

test("documentos → LeadCalificado con datos hasheados y señales de click", () => {
  const ev = construirEventoEtapa(lead, "documentos", 1_800_000_000_000)!;
  assert.equal(ev.event_name, "LeadCalificado");
  assert.equal(ev.event_id, "abc123:documentos");
  assert.equal(ev.event_time, 1_800_000_000);
  assert.equal(ev.action_source, "system_generated");
  const u = ev.user_data as Record<string, unknown>;
  assert.deepEqual(u.ph, [sha("526561234567")]);
  assert.deepEqual(u.em, [sha("jose@correo.com")]);
  assert.deepEqual(u.fn, [sha("jose")]);
  assert.deepEqual(u.ln, [sha("perez")]);
  assert.deepEqual(u.external_id, [sha("abc123")]);
  assert.equal(u.fbc, lead.meta_fbc);
  assert.equal(u.fbp, lead.meta_fbp);
  assert.equal(u.client_ip_address, "201.1.2.3");
  // Ningún dato personal en claro
  assert.ok(!JSON.stringify(ev).includes("6561234567"));
  assert.ok(!JSON.stringify(ev).toLowerCase().includes("correo.com"));
  // No usar la especificación de Conversion Leads (solo formularios instantáneos)
  assert.ok(!("lead_event_source" in (ev.custom_data as object)));
});

test("lead de WhatsApp sin cookies sigue mandando teléfono y external_id", () => {
  const u = construirUserData({ leadId: "w1", telefono: "+52 1 656 999 8877" });
  assert.deepEqual(u.ph, [sha("526569998877")]);
  assert.ok(!("fbc" in u));
});

test("todas las etapas cerradas tienen evento", () => {
  for (const s of ["contactado", "en_seguimiento", "documentos", "cerrado_ganado", "cerrado_perdido"]) {
    assert.ok(EVENTO_POR_ETAPA[s], s);
  }
});
