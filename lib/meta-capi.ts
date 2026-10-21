import { createHash } from "crypto";

/**
 * Meta Conversions API (servidor). Se activa solo si existe META_CAPI_TOKEN
 * en Vercel (el pixel tiene default público).
 *
 * 1) enviarLeadCapi: evento Lead del formulario web, con el MISMO event_id que
 *    el Pixel del navegador para que Meta lo deduplique.
 * 2) enviarEtapaCapi: eventos de embudo del CRM (contactado, calificado,
 *    crédito otorgado...) al mismo dataset, para crear conversiones
 *    personalizadas y optimizar campañas de SITIO WEB hacia leads de calidad.
 *    OJO: NO es la integración "Conversion Leads" de Meta (esa es solo para
 *    formularios instantáneos con lead_id), por eso no se manda
 *    lead_event_source / event_source=crm.
 *
 * Datos personales van SOLO hasheados (SHA-256). Nunca rompe el flujo:
 * cualquier error se registra y se ignora.
 */
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1401885575462193";
const TOKEN = process.env.META_CAPI_TOKEN ?? "";
const TEST_CODE = process.env.META_CAPI_TEST_CODE ?? ""; // opcional, para "Probar eventos"
const API = "v23.0";

export const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

/** Teléfono MX a E.164 sin '+': 52 + 10 dígitos. */
export function normalizaTel(t: string): string | null {
  const d = (t ?? "").replace(/\D/g, "");
  const diez = d.slice(-10);
  return diez.length === 10 ? "52" + diez : null;
}

/** Minúsculas, sin acentos ni puntuación (formato que pide Meta para fn/ln). */
function normalizaNombre(v: string): string {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-zñ]/g, "");
}

export type DatosPersona = {
  leadId?: string | null;
  telefono?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export function construirUserData(p: DatosPersona): Record<string, unknown> {
  const user_data: Record<string, unknown> = {
    country: [sha("mx")],
    ct: [sha("ciudadjuarez")],
    st: [sha("ch")],
  };
  const tel = p.telefono ? normalizaTel(p.telefono) : null;
  if (tel) user_data.ph = [sha(tel)];
  if (p.email && p.email.includes("@")) user_data.em = [sha(p.email)];
  const fn = p.nombre ? normalizaNombre(p.nombre.split(/\s+/)[0] ?? "") : "";
  if (fn) user_data.fn = [sha(fn)];
  const ln = p.apellido ? normalizaNombre(p.apellido.split(/\s+/)[0] ?? "") : "";
  if (ln) user_data.ln = [sha(ln)];
  if (p.leadId) user_data.external_id = [sha(p.leadId)];
  if (p.ip) user_data.client_ip_address = p.ip;
  if (p.userAgent) user_data.client_user_agent = p.userAgent;
  if (p.fbp) user_data.fbp = p.fbp;
  if (p.fbc) user_data.fbc = p.fbc;
  return user_data;
}

async function postEventos(data: Record<string, unknown>[]): Promise<boolean> {
  if (!PIXEL || !TOKEN) return false;
  const body: Record<string, unknown> = { data };
  if (TEST_CODE) body.test_event_code = TEST_CODE;
  try {
    const res = await fetch(`https://graph.facebook.com/${API}/${PIXEL}/events?access_token=${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("Meta CAPI error", res.status, (await res.text()).slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("Meta CAPI fallo de red", err);
    return false;
  }
}

export async function enviarLeadCapi(opts: DatosPersona & {
  eventId: string;
  telefono: string;
  sourceUrl?: string | null;
}) {
  return postEventos([{
    event_name: "Lead",
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    action_source: "website",
    event_source_url: opts.sourceUrl ?? "https://creditoatumedida.com/",
    user_data: construirUserData(opts),
    custom_data: { content_name: "solicitud_credito" },
  }]);
}

/**
 * Etapa del CRM → nombre del evento en Meta. "nuevo" no se manda (ya existe
 * el Lead del formulario). Con estos nombres se crean las conversiones
 * personalizadas en el Administrador de eventos.
 */
export const EVENTO_POR_ETAPA: Record<string, string> = {
  contactado: "LeadContactado",
  en_seguimiento: "LeadEnSeguimiento",
  documentos: "LeadCalificado",
  cerrado_ganado: "CreditoOtorgado",
  cerrado_perdido: "LeadPerdido",
};

export type LeadParaEtapa = {
  id: string;
  telefono?: string | null;
  nombre?: string | null;
  apellido?: string | null;
  email?: string | null;
  origen?: string | null;
  meta_ip?: string | null;
  meta_ua?: string | null;
  meta_fbp?: string | null;
  meta_fbc?: string | null;
};

export function construirEventoEtapa(lead: LeadParaEtapa, status: string, ahora = Date.now()) {
  const event_name = EVENTO_POR_ETAPA[status];
  if (!event_name) return null;
  return {
    event_name,
    event_time: Math.floor(ahora / 1000),
    // Mismo lead + misma etapa = mismo id → Meta deduplica si el asesor
    // mueve la tarjeta de ida y vuelta.
    event_id: `${lead.id}:${status}`,
    action_source: "system_generated",
    user_data: construirUserData({
      leadId: lead.id,
      telefono: lead.telefono,
      nombre: lead.nombre,
      apellido: lead.apellido,
      email: lead.email,
      ip: lead.meta_ip,
      userAgent: lead.meta_ua,
      fbp: lead.meta_fbp,
      fbc: lead.meta_fbc,
    }),
    custom_data: { etapa: status, origen: lead.origen ?? "desconocido" },
  };
}

export async function enviarEtapaCapi(lead: LeadParaEtapa, status: string) {
  const evento = construirEventoEtapa(lead, status);
  if (!evento) return false;
  return postEventos([evento]);
}
