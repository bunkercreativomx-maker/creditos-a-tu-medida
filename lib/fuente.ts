// Atribución de leads de WhatsApp (oct 2026).
//
// El sitio (components/site/WhatsAppAttribution.tsx) agrega al mensaje
// prellenado de WhatsApp una referencia "(Ref: CODIGO)" según de dónde llegó
// la visita (anuncio de Facebook/Instagram, otra campaña con UTM o el sitio).
// El webhook guarda ese código en `leads.fuente` para que cada lead que vino
// por la publicidad quede registrado en el CRM.

/** Normaliza un fragmento para usarlo dentro del código (A-Z, 0-9, guiones). */
export function slugCodigo(s: string, max = 24): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Extrae el código de "(Ref: CODIGO)" de un mensaje; null si no trae. */
export function extraerFuente(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const m = texto.match(/\(\s*Ref\s*:\s*([A-Za-z0-9][A-Za-z0-9-]{0,40})\s*\)/i);
  return m ? m[1].toUpperCase() : null;
}

/** Etiqueta legible para el CRM. */
export function etiquetaFuente(codigo: string | null | undefined): string | null {
  if (!codigo) return null;
  const c = codigo.toUpperCase();
  if (c.startsWith("FB")) return "Anuncio Facebook/Instagram";
  if (c.startsWith("GG")) return "Anuncio Google";
  if (c.startsWith("TT")) return "Anuncio TikTok";
  if (c.startsWith("CAMP")) return "Campaña";
  if (c === "WEB") return "Sitio web";
  return "Campaña";
}
