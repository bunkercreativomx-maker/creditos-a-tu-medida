"use client";

import Link from "next/link";
import type { PbOperacion, PbLead, PbFinanciera, OperacionStatus } from "@/lib/types";

const ACTIVE_STATUS: OperacionStatus[] = ["aprobado", "en_proceso", "pendiente"];

/** Dias restantes hasta la fecha de vencimiento. */
function diasRestantes(fechaVen: string | null): number | null {
  if (!fechaVen) return null;
  const d = new Date(fechaVen);
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}

function fmtFecha(fechaVen: string | null): string {
  if (!fechaVen) return "—";
  const d = new Date(fechaVen);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function RenovacionesBoard({
  operaciones,
  leads,
  financieras,
}: {
  operaciones: PbOperacion[];
  leads: PbLead[];
  financieras: PbFinanciera[];
}) {
  const leadName = (id: string) => {
    const l = leads.find((x) => x.id === id);
    return l ? `${l.nombre || "Sin nombre"} ${l.apellido ?? ""}`.trim() : "—";
  };
  const leadTel = (id: string) => {
    const l = leads.find((x) => x.id === id);
    return l?.telefono ?? "";
  };
  const finName = (id: string | null) => {
    if (!id) return "—";
    const f = financieras.find((x) => x.id === id);
    return f?.nombre ?? "—";
  };

  // Créditos activos con fecha de vencimiento
  const conVencimiento = operaciones
    .filter((op) => op.status && ACTIVE_STATUS.includes(op.status) && op.fecha_vencimiento)
    .map((op) => ({ op, dias: diasRestantes(op.fecha_vencimiento) ?? 9999 }))
    .sort((a, b) => a.dias - b.dias);

  // Umbral de aviso: 4 meses (120 días)
  const UMBRAL_DIAS = 120;

  // Los que vencen en 120 días o menos (por renovar pronto) y los ya vencidos/por vencer
  const porRenovar = conVencimiento.filter((x) => x.dias <= UMBRAL_DIAS);
  // Los próximos a vencer (más adelante)
  const proximos = conVencimiento.filter((x) => x.dias > UMBRAL_DIAS);

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold tracking-tight">🔔 Créditos por renovar</h1>
          <p className="text-xs text-slate-400">
            Créditos activos que vencen en 120 días (4 meses) o menos — listos para contactar y ofrecer renovación
          </p>
        </div>
        <span className="rounded-full bg-amber-500/90 px-4 py-1.5 text-sm font-bold">
          {porRenovar.length} por renovar
        </span>
      </div>

      {/* Lista por renovar */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {porRenovar.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <div className="text-4xl">🎉</div>
            <p className="mt-3 font-semibold text-slate-600">No hay créditos por renovar próximamente</p>
            <p className="mt-1 text-sm text-slate-400">
              Cuando un crédito esté a 120 días (4 meses) o menos de su vencimiento, aparecerá aquí para que contactes al cliente.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {porRenovar.map(({ op, dias }) => {
              const urgente = dias <= 30;      // dentro de 1 mes
              const muyPronto = dias <= 60;    // dentro de 2 meses
              return (
                <div key={op.id} className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/60">
                  <div className="flex items-center gap-4">
                    {/* badge de dias */}
                    <div
                      className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full ${
                        urgente ? "bg-rose-100 text-rose-700" : muyPronto ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      <span className="text-sm font-bold leading-none">{dias}</span>
                      <span className="text-[9px] uppercase leading-tight">días</span>
                    </div>
                    <div>
                      <Link
                        href={`/crm/leads/${op.lead}`}
                        className="font-semibold text-slate-800 hover:text-blue-700"
                      >
                        {leadName(op.lead)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {finName(op.financiera)} · {op.monto_prestado ? `$${Number(op.monto_prestado).toLocaleString("es-MX")}` : "—"}
                      </p>
                      {leadTel(op.lead) && (
                        <p className="text-xs text-slate-400">📞 {leadTel(op.lead)}</p>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-semibold ${
                      urgente ? "text-rose-600" : muyPronto ? "text-amber-600" : "text-emerald-600"
                    }`}>
                      Vence {fmtFecha(op.fecha_vencimiento)}
                    </span>
                    <div className="mt-1 text-xs text-slate-400">
                      {urgente ? "⚠️ Muy pronto" : muyPronto ? "Renovación cercana" : "Por renovar"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Próximos (más de 60 días) */}
      {proximos.length > 0 && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-600">
            📅 Próximos a vencer ({proximos.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {proximos.map(({ op, dias }) => (
              <Link
                key={op.id}
                href={`/crm/leads/${op.lead}`}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:bg-blue-50"
              >
                {leadName(op.lead)} · vence en {dias} días
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
