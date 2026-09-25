import { createHash } from "crypto";

/**
 * Meta Conversions API (servidor). Se activa solo si existen
 * NEXT_PUBLIC_META_PIXEL_ID y META_CAPI_TOKEN en Vercel.
 * Manda el evento Lead con el MISMO event_id que el Pixel del navegador
 * para que Meta lo deduplique. Datos personales van SOLO hasheados (SHA-256).
 * Nunca rompe el flujo del formulario: cualquier error se registra y se ignora.
 */
const PIXEL = process.env.NEXT_PUBLIC_META_PIXEL_ID || "1401885575462193";
const TOKEN = process.env.META_CAPI_TOKEN ?? "";
const TEST_CODE = process.env.META_CAPI_TEST_CODE ?? ""; // opcional, para "Probar eventos"

const sha = (v: string) => createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

/** Teléfono MX a E.164 sin '+': 52 + 10 dígitos. */
function normalizaTel(t: string): string | null {
  const d = t.replace(/\D/g, "");
  const diez = d.slice(-10);
  return diez.length === 10 ? "52" + diez : null;
}

export async function enviarLeadCapi(opts: {
  eventId: string;
  telefono: string;
  nombre?: string | null;
  sourceUrl?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}) {
  if (!PIXEL || !TOKEN) return;
  const tel = normalizaTel(opts.telefono);
  const user_data: Record<string, unknown> = {
    country: [sha("mx")],
    ct: [sha("ciudadjuarez")],
    st: [sha("ch")],
  };
  if (tel) user_data.ph = [sha(tel)];
  if (opts.nombre) user_data.fn = [sha(opts.nombre.split(/\s+/)[0] ?? "")];
  if (opts.ip) user_data.client_ip_address = opts.ip;
  if (opts.userAgent) user_data.client_user_agent = opts.userAgent;
  if (opts.fbp) user_data.fbp = opts.fbp;
  if (opts.fbc) user_data.fbc = opts.fbc;

  const body: Record<string, unknown> = {
    data: [{
      event_name: "Lead",
      event_time: Math.floor(Date.now() / 1000),
      event_id: opts.eventId,
      action_source: "website",
      event_source_url: opts.sourceUrl ?? "https://creditoatumedida.com/",
      user_data,
      custom_data: { content_name: "solicitud_credito" },
    }],
  };
  if (TEST_CODE) body.test_event_code = TEST_CODE;

  try {
    const res = await fetch(`https://graph.facebook.com/v23.0/${PIXEL}/events?access_token=${TOKEN}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) console.error("Meta CAPI error", res.status, (await res.text()).slice(0, 300));
  } catch (err) {
    console.error("Meta CAPI fallo de red", err);
  }
}
