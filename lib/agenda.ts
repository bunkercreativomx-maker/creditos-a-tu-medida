// Agendado determinista de citas — fallback cuando Gemini no logra agendar.
// Gemini encadena herramientas (consultar_disponibilidad → agendar_cita) y a
// veces se queda sin respuesta; el fallback anti-silencio mandaba el Cierre B
// y escalaba SIN crear la cita. Aquí el webhook agenda por código, sin LLM.

const TZ = "America/Ciudad_Juarez";

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
  return ["09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00"];
}

/** Horarios de sábado (hasta las 14:00). */
export function HORARIOS_SABADO(): string[] {
  return ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
}

/** Horarios de domingo (solo con cita; horario reducido 10:00–14:00). */
export function HORARIOS_DOMINGO(): string[] {
  return ["10:00", "11:00", "12:00", "13:00", "14:00"];
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

/** Extrae una hora HH:MM mencionada en un texto ("a las 10", "10:00", "las 11"). */
export function extraerHora(texto: string): string | null {
  const m = texto.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  if (h < 1 || h > 12) return null;
  const min = m[2] ? m[2].padStart(2, "0") : "00";
  const meridiem = (m[3] || "").toLowerCase();
  if (meridiem.includes("p") && h < 12) h += 12;
  else if (meridiem.includes("a") && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${min}`;
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

/**
 * ¿El texto pregunta por la ubicación o la dirección?
 */
export function pideUbicacion(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  return /(ubicad|direcci[oó]n|d[oó]nde est|donde est|localiza|sucursal|c[oó]mo llego|como llego|domicilio)/.test(t);
}

/** ¿El texto pide reagendar/cambiar una cita existente? */
export function pideReagendar(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  return /(reagendar|re-agendar|reagenda|cambiar (mi )?cita|cambiar (mi )?hora|mover (la )?cita|otra hora|otro d[ií]a|m[aá]s tarde|adelantar|atrasar|no puedo|me queda mal|cancelar)/.test(t);
}

/**
 * ¿El texto parece una hora o un día (aunque sea una respuesta corta como
 * "10", "10am", "mañana", "el lunes")? Sirve para agendar cuando el bot ya
 * preguntó la hora y el cliente contesta con un número suelto.
 */
export function pareceHoraODia(texto: string): boolean {
  const t = (texto || "").trim().toLowerCase();
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
  const t = (texto || "").toLowerCase();
  return /(agendar|agenda|agendarme|cita|horario|qué día|que día|mañana|pasado mañana|lo antes posible|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|a las \d|:\d\d)/.test(t);
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
  const t = (texto || "").toLowerCase();
  const hoy = hoyJuarez();
  if (/hoy/.test(t)) return hoy.iso;
  if (/pasado mañana/.test(t)) return sumarDiasCalendario(2);
  if (/mañana/.test(t)) return sumarDiasCalendario(1);
  const dias = [
    ["lunes", 1],
    ["martes", 2],
    ["mi[ée]rcoles", 3],
    ["jueves", 4],
    ["viernes", 5],
    ["s[aá]bado", 6],
    ["domingo", 0],
  ] as const;
  const hoyWD = new Date(`${hoy.iso}T12:00:00Z`).getUTCDay();
  for (const [pat, objetivo] of dias) {
    if (new RegExp(pat).test(t)) {
      // Próximo día de calendario con ese weekday (hoy cuenta si ya es ese día).
      let diff = (objetivo - hoyWD + 7) % 7;
      if (diff === 0) diff = 7; // si ya es ese día, el siguiente igual
      return sumarDiasCalendario(diff);
    }
  }
  return null;
}
