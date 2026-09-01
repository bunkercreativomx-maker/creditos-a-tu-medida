"use client";

import { useEffect, useState } from "react";

// Zona horaria de Ciudad Juárez, Chihuahua (Mountain Time, con horario de verano).
const TZ = "America/Ciudad_Juarez";
// Hora de corte: 3:00 pm (15:00).
const CORTE_HORA = 15;

function getTzParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    year: +get("year"),
    month: +get("month"),
    day: +get("day"),
    hour: +get("hour") % 24,
    minute: +get("minute"),
    second: +get("second"),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Contador en vivo: hora de Ciudad Juárez y cuenta regresiva hasta las 3:00 pm.
 *  Si ya pasaron las 3:00 pm, cuenta hasta las 3:00 pm del día siguiente. */
export function Countdown() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = getTzParts(now);
  const segundosDelDia = t.hour * 3600 + t.minute * 60 + t.second;
  const segundosCorte = CORTE_HORA * 3600;
  let restante = segundosCorte - segundosDelDia;
  if (restante <= 0) restante += 24 * 3600; // ya pasó el corte → siguiente día

  const h = Math.floor(restante / 3600);
  const m = Math.floor((restante % 3600) / 60);
  const s = restante % 60;

  const esHoy = segundosDelDia < segundosCorte;

  return (
    <div className="inline-flex flex-col items-center gap-1.5 rounded-2xl border border-gold-500/30 bg-gold-500/10 px-6 py-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-gold-300">
        Hora en Ciudad Juárez · {pad(t.hour)}:{pad(t.minute)}:{pad(t.second)}
      </span>
      <span className="font-display text-4xl font-bold tabular-nums leading-none text-cream-50 sm:text-5xl">
        {esHoy ? "Quedan" : "Siguiente corte en"}{" "}
        <span className="text-gold-300">
          {pad(h)}:{pad(m)}:{pad(s)}
        </span>
      </span>
      <span className="text-sm font-medium text-cream-50/70">
        {esHoy ? "para tu crédito el mismo día" : "para tu crédito mañana"}
      </span>
    </div>
  );
}
