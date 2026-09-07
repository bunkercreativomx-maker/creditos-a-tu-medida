// Red de seguridad en código. Nada sale a WhatsApp sin pasar por aquí.
// En un negocio de préstamos, una cifra inventada no es un error de
// calidad: es un problema legal.

const PROHIBIDOS = /\b(tasa|intereses?|CAT|mensualidad(es)?|plazos?|comisi[oó]n|amortizaci[oó]n)\b/i;
const PROMESAS = /\b(aprobad[oa]|autorizad[oa]|s[ií] califica|le prestamos|est[aá] aprobado|seguro se lo)\b/i;
const PORCENTAJE = /\d+\s*(%|por ciento)/i;
const NEGATIVAS = /\b(no tengo esa informaci[oó]n|no puedo ayudar|no s[eé]|soy una? (IA|bot|inteligencia))\b/i;

function normalizarCifra(s) {
  return s.replace(/[\s,]/g, "").replace(/MXN|pesos/gi, "");
}

export function violaReglas(texto, lead) {
  if (!texto || !texto.trim()) return "vacio";
  if (PORCENTAJE.test(texto)) return "porcentaje";
  if (PROHIBIDOS.test(texto)) return "termino_prohibido";
  if (PROMESAS.test(texto)) return "promesa_aprobacion";
  if (NEGATIVAS.test(texto)) return "negativa_seca";

  // Solo se permiten: los $500 del referido y el monto que dijo el cliente
  const permitidas = new Set(["$500", "$500.00"]);
  if (lead?.montoSolicitado) permitidas.add(normalizarCifra(`$${lead.montoSolicitado}`));

  const cifras = texto.match(/\$\s?[\d][\d,\.]*/g) ?? [];
  for (const c of cifras) {
    if (!permitidas.has(normalizarCifra(c))) return "cifra_inventada";
  }

  if (texto.length > 700) return "demasiado_largo";
  return null;
}

export const MENSAJE_ESCALAMIENTO =
  "Con gusto, esa información se la da directamente un asesor para que sea exacta. " +
  "Permítame comunicarlo, en un momento le responden por aquí.";

