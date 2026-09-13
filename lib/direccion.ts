// Dirección oficial (única fuente de verdad). Gemini la alucina en el texto
// libre del turno normal; esta constante y el saneo se usan en el webhook.
export const DIRECCION_OFICIAL =
  "Benjamín Franklin 3220, Local 22D, Plaza de las Américas, Zona Pronaf, C.P. 32315, Cd. Juárez, Chihuahua";

/**
 * Reemplaza cualquier dirección que Gemini haya inventado por la oficial.
 * Conserva intacto el texto si ya contiene la dirección correcta.
 */
export function sanearDireccion(texto: string): string {
  if (!texto) return texto;
  // Ya trae la dirección oficial → no tocar.
  if (texto.includes("Benjamín Franklin 3220")) return texto;
  let out = texto;
  // Bloque "📍 <dirección>" (con o sin markdown **).
  out = out.replace(/📍\s*\*{0,2}[^\n]*/g, `📍 ${DIRECCION_OFICIAL}`);
  // Frase "Estamos ubicados en: <línea>" → anclar la oficial.
  out = out.replace(
    /(?:ubicad[oa]s?\s+en|estamos\s+en|direcci[oó]n)[:\s]*[^\n]*/gi,
    (m) => `${m.trim() ? m.match(/^[^:\n]{0,20}/)?.[0] ?? "" : ""} ${DIRECCION_OFICIAL}`
  );
  // Patrón de dirección tipo "Calle/Avenida X #N, ... Ciudad"
  out = out.replace(
    /(?:Calle|Avenida|Av\.|Ave\.|Blvd|Prolongaci[oó]n|C\.|A\.)[^.\n]{4,}(?:Chihuahua|Ciudad Ju[aá]rez|Cd\. Ju[aá]rez)[^.\n]*/gi,
    DIRECCION_OFICIAL
  );
  return out;
}
