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

/** Horarios hábiles propuestos (9-18 h, sin domingo). */
export function HORARIOS_BASE(): string[] {
  return ["09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00"];
}

/**
 * Horarios libres de una fecha, consultando las citas existentes en PocketBase.
 * `pb` es el cliente admin; `ocupadas` ya extraído (horas HH:MM ocupadas).
 */
export function horariosLibres(ocupadas: string[]): string[] {
  const ocup = new Set(ocupadas);
  return HORARIOS_BASE().filter((h) => !ocup.has(h));
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

/** ¿El texto pide agendar / menciona un día u hora? */
export function pideAgendar(texto: string): boolean {
  const t = (texto || "").toLowerCase();
  return /(agendar|agenda|agendarme|cita|horario|qué día|que día|mañana|pasado mañana|lo antes posible|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|a las \d|:\d\d)/.test(t);
}

/** Detecta el día pedido en el texto → fecha YYYY-MM-DD (próximo día hábil). */
export function detectarDia(texto: string): string | null {
  const t = (texto || "").toLowerCase();
  const hoy = hoyJuarez();
  if (/hoy/.test(t)) return hoy.iso;
  if (/pasado mañana/.test(t)) return sumarDiasHabiles(2);
  if (/mañana/.test(t)) return sumarDiasHabiles(1);
  const dias = [
    ["lunes", 1],
    ["martes", 2],
    ["mi[ée]rcoles", 3],
    ["jueves", 4],
    ["viernes", 5],
    ["s[aá]bado", 6],
  ] as const;
  for (const [pat, objetivo] of dias) {
    if (new RegExp(pat).test(t)) {
      // Cuenta días hábiles hasta alcanzar ese weekday objetivo.
      let i = 0;
      for (;;) {
        const f = sumarDiasHabiles(i + 1);
        const wd = new Date(`${f}T12:00:00Z`).getUTCDay();
        if (wd === objetivo) return f;
        i++;
      }
    }
  }
  return null;
}
