import { TIME_ZONE } from "./policy";

export interface LocalParts {
  date: string;
  time: string;
}

function partsMap(date: Date, timeZone = TIME_ZONE): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

export function utcToLocalParts(value: string | Date, timeZone = TIME_ZONE): LocalParts {
  const p = partsMap(value instanceof Date ? value : new Date(value), timeZone);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

function offsetAt(instantMs: number, timeZone: string): number {
  const p = partsMap(new Date(instantMs), timeZone);
  const representedAsUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour), Number(p.minute), Number(p.second),
  );
  return representedAsUtc - instantMs;
}

export function localDateTimeToUtc(localDate: string, localTime: string, timeZone = TIME_ZONE): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime)) return null;
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;
  const wallClockAsUtc = Date.UTC(year!, month! - 1, day!, hour!, minute!, 0, 0);
  let instant = wallClockAsUtc - offsetAt(wallClockAsUtc, timeZone);
  instant = wallClockAsUtc - offsetAt(instant, timeZone);
  const result = new Date(instant);
  const roundTrip = utcToLocalParts(result, timeZone);
  if (roundTrip.date !== localDate || roundTrip.time !== localTime) return null;
  return result;
}

export function localDayUtcRange(localDate: string): { start: Date; end: Date } | null {
  const start = localDateTimeToUtc(localDate, "00:00");
  const nextDate = new Date(`${localDate}T12:00:00Z`);
  if (!start || Number.isNaN(nextDate.valueOf())) return null;
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const nextLocal = nextDate.toISOString().slice(0, 10);
  const end = localDateTimeToUtc(nextLocal, "00:00");
  return end ? { start, end } : null;
}

export function localNow(now = new Date()): LocalParts {
  return utcToLocalParts(now);
}

export function isPastLocalSlot(localDate: string, localTime: string, now = new Date()): boolean {
  const current = localNow(now);
  return localDate < current.date || (localDate === current.date && localTime <= current.time);
}

export function formatLocalAppointment(iso: string): { date: string; time: string; label: string } {
  const instant = new Date(iso);
  const parts = utcToLocalParts(instant);
  const label = new Intl.DateTimeFormat("es-MX", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(instant);
  return { ...parts, label };
}

