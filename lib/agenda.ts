// Agendado determinista de citas — fallback cuando Gemini no logra agendar.
// Gemini encadena herramientas (consultar_disponibilidad → agendar_cita) y a
// veces se queda sin respuesta; el fallback anti-silencio mandaba el Cierre B
// y escalaba SIN crear la cita. Aquí el webhook agenda por código, sin LLM.

import {
  ZONA_HORARIA,
  HORARIOS_LUN_VIE as _HORARIOS_LUN_VIE,
  HORARIOS_SABADO as _HORARIOS_SABADO,
  HORARIOS_DOMINGO as _HORARIOS_DOMINGO,
} from "@/lib/politicas";

const TZ = ZONA_HORARIA;

/** Fecha actual en Cd. Juárez como { yyyy, mm, dd, iso, weekday, hora }. */
export function hoyJuarez(): {
  yyyy: string;
  mm: string;
  dd: string;
  iso: string;
  weekday: string;
  hora: string;
} {
  const ahora = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "long",
  }).formatToParts(ahora);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hora = `${g("hour").padStart(2, "0")}:${g("minute").padStart(2, "0")}`;
  return {
    yyyy: g("year"),
    mm: g("month"),
    dd: g("day"),
    iso: `${g("year")}-${g("month")}-${g("day")}`,
    weekday: g("weekday"),
    hora,
  };
}

/** Suma n días hábiles (lun-sáb, salta domingo) a partir de hoy. */
export function sumarDiasHabiles(dias: number): string {
  const { iso } = hoyJuarez();
  const d = new Date(`${iso}T12:00:00Z`);
  let contados = 0;
  while (contados < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0) contados++; // domingo (0) no cuenta
  }
  return d.toISOString().slice(0, 10);
}

/** Día de la semana en español de una fecha YYYY-MM-DD. */
export function diaSemanaEsp(fechaIso: string): string {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", { timeZone: "UTC", weekday: "long" }).format(d);
}

/** Formatea fecha como "lunes 14 de septiembre". */
export function fechaEsp(fechaIso: string): string {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
}

/** Horarios hábiles entre semana (lun-vie), hasta las 17:00. */
export function HORARIOS_BASE(): string[] {
  return [..._HORARIOS_LUN_VIE];
}

/** Horarios de sábado (hasta las 14:00). */
export function HORARIOS_SABADO(): string[] {
  return [..._HORARIOS_SABADO];
}

/** Horarios de domingo (solo con cita; horario reducido 10:00–14:00). */
export function HORARIOS_DOMINGO(): string[] {
  return [..._HORARIOS_DOMINGO];
}

/**
 * Horarios base según el día de la semana (fecha YYYY-MM-DD).
 * Lunes-Viernes 9-17h; sábado 9-14h; domingo 10-14h (solo cita).
 */
export function horariosParaDia(fechaIso: string): string[] {
  const wd = new Date(`${fechaIso}T12:00:00Z`).getUTCDay();
  if (wd === 6) return HORARIOS_SABADO();
  if (wd === 0) return HORARIOS_DOMINGO();
  return HORARIOS_BASE();
}

/**
 * Horarios libres de una fecha, consultando las citas existentes en PocketBase.
 * `ocupadas` ya extraído (horas HH:MM ocupadas).
 */
export function horariosLibres(ocupadas: string[], fechaIso?: string): string[] {
  const ocup = new Set(ocupadas);
  const base = fechaIso ? horariosParaDia(fechaIso) : HORARIOS_BASE();
  return base.filter((h) => !ocup.has(h));
}

/**
 * Recorta los horarios libres que ya pasaron, para permitir agendar HOY mismo
 * hasta las 17:00. `horaActualHHMM` en hora local (ej. "14:30").
 */
export function recortarHorasPasadas(libres: string[], horaActualHHMM: string): string[] {
  return libres.filter((h) => h > horaActualHHMM);
}

/** Extrae una hora HH:MM mencionada en un texto ("a las 10", "5 de la tarde"). */
export function extraerHora(texto: string): string | null {
  const t = String(texto ?? "").toLowerCase();
  // \b + (?![\d,.]) evita confundir montos con horas: "10000" o "10,000" NO
  // son "10:00" (antes "15,000 pesos" agendaba una cita a las 3 de la tarde).
  const m = t.match(
    /\b(\d{1,2})(?::(\d{2}))?(?![\d,.])(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?|de la (mañana|tarde|noche|madrugada)|del (día|dia|mediodía|mediodia)|hrs?\.?|horas?))?/
  );
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (Number.isNaN(h)) return null;
  const min = m[2] ? m[2].padStart(2, "0") : "00";
  const sufijo = (m[3] || "").toLowerCase();
  const esPm = /p\.?\s*m/.test(sufijo) || /tarde|noche/.test(sufijo);
  const esAm = /a\.?\s*m/.test(sufijo) || /mañana|madrugada/.test(sufijo) || /mediod/.test(sufijo);
  let ajustado = false;
  if (esPm && h < 12) {
    h += 12;
    ajustado = true;
  } else if (esAm && h === 12 && /madrugada/.test(sufijo)) h = 0;
  // Sin a.m./p.m., una hora de 1 a 7 es de la tarde: nadie cita a las 5 de la
  // mañana ("a las 2" → 14:00, "a las 5" → 17:00).
  else if (!esAm && !esPm && h <= 7) {
    h += 12;
    ajustado = true;
  }
  // Un número mayor a 12 sin sufijo ni ":minutos" es una fecha, no una hora
  // ("el 14 de septiembre"): no se agenda. (Se exceptúa lo ya interpretado
  // como hora de la tarde, ej. "a las 2".)
  if (h > 12 && !sufijo && !m[2] && !ajustado) return null;
  if (h < 8 || h > 20) return null;
  return `${String(h).padStart(2, "0")}:${min}`;
}

/**
 * ¿La hora cae dentro del horario de atención del día? Lun-Vie 9:00-17:00,
 * Sáb 9:00-14:00, Dom 10:00-14:00. Sirve para NO agendar (ni contestar "esa
 * hora ya pasó") cuando el cliente dice una hora en la que no abrimos.
 */
export function horaEnHorarioDia(fechaIso: string, horaHHMM: string): boolean {
  const slots = horariosParaDia(fechaIso);
  if (slots.length === 0) return false;
  return horaHHMM >= slots[0] && horaHHMM <= slots[slots.length - 1];
}

/**
 * Offset UTC (en minutos) de la zona America/Ciudad_Juarez para una fecha dada.
 * Cd. Juárez usa horario de verano (CDT, UTC-6) en verano y MST (UTC-7) en
 * invierno, así que el offset depende de la fecha, no es fijo.
 */
export function offsetJuarezMin(fechaIso: string): number {
  const d = new Date(`${fechaIso}T12:00:00Z`);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Ciudad_Juarez",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(d)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    (+parts.hour) % 24,
    +parts.minute,
    +parts.second
  );
  return (asUtc - d.getTime()) / 60000; // + si la zona está detrás de UTC
}

/**
 * Convierte una fecha YYYY-MM-DD y hora local HH:MM (Cd. Juárez) al ISO UTC.
 * Ej: "2026-09-14" + "10:00" → "2026-09-14T16:00:00Z" (verano, UTC-6).
 * Esto evita que el calendario muestre la cita a las 4:00 am cuando el cliente
 * pidió las 10:00 (la hora local se guardaba como si fuera UTC).
 */
export function horaLocalAUtc(fechaIso: string, horaHHMM: string): string {
  const hh = parseInt(horaHHMM.slice(0, 2), 10);
  const mm = parseInt(horaHHMM.slice(3, 5), 10) || 0;
  const offset = offsetJuarezMin(fechaIso); // ej. -360 (UTC-6)
  // local = utc + offset  →  utc = local - offset
  const utcMs = Date.UTC(
    +fechaIso.slice(0, 4),
    +fechaIso.slice(5, 7) - 1,
    +fechaIso.slice(8, 10),
    hh,
    mm,
    0
  ) - offset * 60000;
  return new Date(utcMs).toISOString();
}

/**
 * ¿El texto parece un número de identificación (NSS, número de empleado, RFC)?
 * Acepta 6+ dígitos seguidos, o cadenas alfanuméricas de 10+ (RFC/CURP).
 */
export function pareceIdentificador(texto: string): boolean {
  const t = (texto || "").trim();
  if (/^\d{6,}$/.test(t)) return true; // NSS / ficha / número de empleado
  if (/^[A-Za-z0-9]{10,18}$/.test(t) && /\d/.test(t) && /[A-Za-z]/.test(t)) return true; // RFC/CURP
  return false;
}

/*
 * ¿Pregunta por la ubicación? → vive en lib/intenciones.ts (versión amplia:
 * "a dónde tengo que ir", "en qué parte están", "me manda la ubicacion?").
 * Se importa desde ahí para que exista UNA sola versión del detector.
 */

/** ¿El texto pide reagendar/cambiar una cita existente? */
export function pideReagendar(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  return /(reagendar|re-agendar|reagenda|cambiar (mi )?cita|cambiar (mi )?hora|mover (la )?cita|otra hora|otro d[ií]a|m[aá]s tarde|adelantar|atrasar|no puedo|me queda mal)/.test(t);
}

/**
 * ¿El texto parece una hora o un día (aunque sea una respuesta corta como
 * "10", "10am", "mañana", "el lunes")? Sirve para agendar cuando el bot ya
 * preguntó la hora y el cliente contesta con un número suelto.
 */
export function pareceHoraODia(texto: string): boolean {
  const t = String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!t) return false;
  // Número suelto (1-2 dígitos) o con am/pm, ej. "10", "10 am", "4pm", "11:30".
  if (/^\d{1,2}(\s*(:\d{2})?)\s*(a\.?\s*m\.?|p\.?\s*m\.?)?$/.test(t)) return true;
  // Hora en cualquier parte.
  if (/\b\d{1,2}(:\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?)\b/.test(t)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(t)) return true;
  // Día.
  return /(hoy|mañana|pasado mañana|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)/.test(t);
}

/** ¿El texto pide agendar / menciona un día u hora? */
export function pideAgendar(texto: string): boolean {
  const t = String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return /(agendar|agenda|agendarme|cita|horario|que dia|que dias|cuando puedo|puedo ir|puedo pasar|quiero ir|me gustaria ir|paso por|hay lugar|hay espacio|disponibilidad|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|a las \d|:\d\d|de la tarde|de la manana)/.test(
    t
  );
}

/** Suma n días de calendario a partir de hoy (sin saltar domingos). */
export function sumarDiasCalendario(dias: number): string {
  const { iso } = hoyJuarez();
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Próximo lunes (inicio de semana) a partir de hoy. Si hoy es lunes, devuelve
 * hoy. Es el día por defecto para ofrecer citas cuando el cliente no especifica
 * día — los fines de semana solo se agendan si el cliente los pide.
 */
export function proximoLunes(): string {
  const { iso } = hoyJuarez();
  const hoyWD = new Date(`${iso}T12:00:00Z`).getUTCDay();
  const diff = hoyWD === 1 ? 0 : (8 - hoyWD) % 7;
  return sumarDiasCalendario(diff);
}

/** Detecta el día pedido en el texto → fecha YYYY-MM-DD (día de calendario). */
export function detectarDia(texto: string): string | null {
  // Sin acentos: "manana", "miercoles" y "sabado" se escriben así en WhatsApp.
  const t = String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const hoy = hoyJuarez();
  if (/hoy/.test(t)) return hoy.iso;
  if (/pasado\s+manana/.test(t)) return sumarDiasCalendario(2);
  if (/manana/.test(t)) return sumarDiasCalendario(1);
  const dias: [RegExp, number][] = [
    [/\blunes\b|\blun\b/, 1],
    [/\bmartes\b|\bmar\b/, 2],
    [/\bmiercoles\b|\bmie\b/, 3],
    [/\bjueves\b|\bjue\b/, 4],
    [/\bviernes\b|\bvie\b/, 5],
    [/\bsabado\b|\bsab\b/, 6],
    [/\bdomingo\b|\bdom\b/, 0],
  ];
  const hoyWD = new Date(`${hoy.iso}T12:00:00Z`).getUTCDay();
  for (const [pat, objetivo] of dias) {
    if (pat.test(t)) {
      // Próximo día de calendario con ese weekday (hoy cuenta si ya es ese día).
      let diff = (objetivo - hoyWD + 7) % 7;
      if (diff === 0) diff = 7; // si ya es ese día, el siguiente igual
      return sumarDiasCalendario(diff);
    }
  }
  return null;
}
