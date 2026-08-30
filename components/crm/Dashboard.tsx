"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PbOperacion, PbLead, PbFinanciera, OperacionStatus } from "@/lib/types";

const ACTIVE_STATUS: OperacionStatus[] = ["aprobado", "en_proceso", "pendiente"];

function diasRestantes(fecha: string | null): number | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}

function fmtMonto(n: number | null): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function fmtFecha(fecha: string | null): string {
  if (!fecha) return "—";
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function Dashboard({
  operaciones,
  leads,
  financieras,
}: {
  operaciones: PbOperacion[];
  leads: PbLead[];
  financieras: PbFinanciera[];
}) {
  const hoy = new Date();
  const [reporteOpen, setReporteOpen] = useState(false);

  const leadName = (id: string) => {
    const l = leads.find((x) => x.id === id);
    return l ? `${l.nombre || "Sin nombre"} ${l.apellido ?? ""}`.trim() : "—";
  };
  const leadTel = (id: string) => leads.find((x) => x.id === id)?.telefono ?? "";
  const finName = (id: string | null) => {
    if (!id) return "—";
    const f = financieras.find((x) => x.id === id);
    return f?.nombre ?? "—";
  };

  // ===== Alertas de renovación: créditos activos que vencen en <= 60 días (2 meses) =====
  const porRenovar2Meses = useMemo(() => {
    return operaciones
      .filter((op) => op.status && ACTIVE_STATUS.includes(op.status) && op.fecha_vencimiento)
      .map((op) => ({ op, dias: diasRestantes(op.fecha_vencimiento) ?? 9999 }))
      .filter((x) => x.dias <= 60)
      .sort((a, b) => a.dias - b.dias);
  }, [operaciones]);

  // ===== KPIs del mes actual =====
  const mesActual = hoy.getMonth();
  const anioActual = hoy.getFullYear();

  const statsMes = useMemo(() => {
    const aprobadasMes = operaciones.filter((op) => {
      if (op.status !== "aprobado") return false;
      const d = op.fecha_desembolso || op.created;
      const dt = new Date(d);
      return dt.getFullYear() === anioActual && dt.getMonth() === mesActual;
    });
    const totalAprobado = aprobadasMes.reduce((s, o) => s + (Number(o.monto_prestado) || 0), 0);
    const totalComision = aprobadasMes.reduce((s, o) => s + (Number(o.comision) || 0), 0);
    const leadsMes = leads.filter((l) => {
      const d = new Date(l.created);
      return d.getFullYear() === anioActual && d.getMonth() === mesActual;
    });
    return {
      count: aprobadasMes.length,
      totalAprobado,
      totalComision,
      leadsNuevos: leadsMes.length,
    };
  }, [operaciones, leads, mesActual, anioActual]);

  // ===== Serie mensual de préstamos aprobados (últimos 6 meses) =====
  const serie = useMemo(() => {
    const meses: { label: string; total: number; count: number; key: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(anioActual, mesActual - i, 1);
      meses.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: MONTH_NAMES[d.getMonth()].slice(0, 3),
        total: 0,
        count: 0,
      });
    }
    for (const op of operaciones) {
      if (op.status !== "aprobado") continue;
      const d = op.fecha_desembolso ? new Date(op.fecha_desembolso) : new Date(op.created);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = meses.find((m) => m.key === key);
      if (bucket) {
        bucket.total += Number(op.monto_prestado) || 0;
        bucket.count += 1;
      }
    }
    return meses;
  }, [operaciones, mesActual, anioActual]);

  const maxSerie = Math.max(1, ...serie.map((s) => s.total));

  // ===== Reporte mensual detallado =====
  const reporteMes = useMemo(() => {
    const aprobadas = operaciones
      .filter((op) => {
        if (op.status !== "aprobado") return false;
        const d = new Date(op.fecha_desembolso || op.created);
        return d.getFullYear() === anioActual && d.getMonth() === mesActual;
      })
      .sort((a, b) => (a.fecha_desembolso || a.created).localeCompare(b.fecha_desembolso || b.created));
    const total = aprobadas.reduce((s, o) => s + (Number(o.monto_prestado) || 0), 0);
    const comision = aprobadas.reduce((s, o) => s + (Number(o.comision) || 0), 0);
    return { aprobadas, total, comision };
  }, [operaciones, mesActual, anioActual]);

  return (
    <div className="flex flex-col gap-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Dashboard</h1>
          <p className="text-xs text-slate-400">
            Resumen del mes · {MONTH_NAMES[mesActual]} {anioActual}
          </p>
        </div>
        <button
          onClick={() => setReporteOpen(true)}
          className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          📄 Reporte mensual
        </button>
      </div>

      {/* KPIs del mes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          icon="💳"
          label="Préstamos aprobados"
          value={String(statsMes.count)}
          sub={`en ${MONTH_NAMES[mesActual].slice(0, 3)}`}
          color="bg-blue-50 text-blue-700"
        />
        <KpiCard
          icon="💰"
          label="Monto aprobado"
          value={fmtMonto(statsMes.totalAprobado)}
          sub="mes actual"
          color="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          icon="🤝"
          label="Comisiones"
          value={fmtMonto(statsMes.totalComision)}
          sub="mes actual"
          color="bg-amber-50 text-amber-700"
        />
        <KpiCard
          icon="📥"
          label="Leads nuevos"
          value={String(statsMes.leadsNuevos)}
          sub={`en ${MONTH_NAMES[mesActual].slice(0, 3)}`}
          color="bg-violet-50 text-violet-700"
        />
      </div>

      {/* ALERTAS DE RENOVACIÓN a 2 meses */}
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/60 shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-amber-200 px-5 py-3">
          <div>
            <h2 className="font-semibold text-amber-800">🔔 Créditos por renovar (≤ 2 meses)</h2>
            <p className="text-xs text-amber-700">
              Créditos activos que vencen en los próximos 60 días — contacta al cliente
            </p>
          </div>
          <span className="rounded-full bg-amber-500 px-3 py-1 text-sm font-bold text-white">
            {porRenovar2Meses.length}
          </span>
        </div>
        {porRenovar2Meses.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-slate-500">
            🎉 No hay créditos por renovar en los próximos 2 meses.
          </div>
        ) : (
          <div className="divide-y divide-amber-100">
            {porRenovar2Meses.map(({ op, dias }) => {
              const urgente = dias <= 30;
              return (
                <div key={op.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-white/60">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full ${
                        urgente ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      <span className="text-sm font-bold leading-none">{dias}</span>
                      <span className="text-[8px] uppercase leading-tight">días</span>
                    </div>
                    <div>
                      <Link
                        href={`/crm/leads/${op.lead}`}
                        className="font-semibold text-slate-800 hover:text-blue-700"
                      >
                        {leadName(op.lead)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {finName(op.financiera)} · {fmtMonto(op.monto_prestado)} · vence {fmtFecha(op.fecha_vencimiento)}
                      </p>
                      {leadTel(op.lead) && (
                        <p className="text-xs text-slate-400">📞 {leadTel(op.lead)}</p>
                      )}
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    urgente ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                  }`}>
                    {urgente ? "⚠️ Muy pronto" : "Renovación cercana"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* GRÁFICA mensual de préstamos aprobados */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-blue-900">📈 Préstamos aprobados</h2>
            <p className="text-xs text-slate-400">Monto aprobado por mes · últimos 6 meses</p>
          </div>
          <Link href="/crm/financieras" className="text-xs font-semibold text-blue-700 hover:underline">
            Ver financieras →
          </Link>
        </div>
        <div className="mt-4">
          <BarChart serie={serie} max={maxSerie} />
        </div>
      </div>

      {/* Reporte mensual modal */}
      {reporteOpen && (
        <ReporteModal
          mes={mesActual}
          anio={anioActual}
          data={reporteMes}
          leadName={leadName}
          finName={finName}
          onClose={() => setReporteOpen(false)}
        />
      )}
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg ${color}`}>{icon}</span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400">{sub}</p>
    </div>
  );
}

function BarChart({ serie, max }: { serie: { label: string; total: number; count: number; key: string }[]; max: number }) {
  return (
    <div className="flex h-48 items-end gap-2 sm:gap-4">
      {serie.map((m) => {
        const h = m.total > 0 ? Math.max(6, (m.total / max) * 100) : 2;
        return (
          <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-semibold text-slate-600">
              {m.total > 0 ? `$${Math.round(m.total / 1000)}k` : ""}
            </span>
            <div className="flex w-full items-end justify-center" style={{ height: "8.5rem" }}>
              <div
                className={`w-full max-w-[48px] rounded-t-lg ${
                  m.count > 0 ? "bg-gradient-to-t from-blue-700 to-blue-500" : "bg-slate-100"
                }`}
                style={{ height: `${h}%` }}
                title={`${m.label}: ${m.count} préstamos, ${fmtMonto(m.total)}`}
              />
            </div>
            <span className="text-[10px] text-slate-400">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReporteModal({
  mes,
  anio,
  data,
  leadName,
  finName,
  onClose,
}: {
  mes: number;
  anio: number;
  data: { aprobadas: PbOperacion[]; total: number; comision: number };
  leadName: (id: string) => string;
  finName: (id: string | null) => string;
  onClose: () => void;
}) {
  const count = data.aprobadas.length;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-bold text-slate-800">
            📄 Reporte mensual · {MONTH_NAMES[mes]} {anio}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-blue-50 p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{count}</p>
              <p className="text-xs text-slate-500">Aprobados</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{fmtMonto(data.total)}</p>
              <p className="text-xs text-slate-500">Monto total</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{fmtMonto(data.comision)}</p>
              <p className="text-xs text-slate-500">Comisiones</p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Financiera</th>
                  <th className="px-3 py-2 font-semibold">Monto</th>
                  <th className="px-3 py-2 font-semibold text-right">Comisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.aprobadas.map((op) => (
                  <tr key={op.id}>
                    <td className="px-3 py-2 text-slate-500">
                      {fmtFecha(op.fecha_desembolso || op.created)}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{leadName(op.lead)}</td>
                    <td className="px-3 py-2 text-slate-600">{finName(op.financiera)}</td>
                    <td className="px-3 py-2">{fmtMonto(op.monto_prestado)}</td>
                    <td className="px-3 py-2 text-right">{fmtMonto(op.comision)}</td>
                  </tr>
                ))}
                {count === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                      Sin préstamos aprobados este mes.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={3}>Total</td>
                  <td className="px-3 py-2">{fmtMonto(data.total)}</td>
                  <td className="px-3 py-2 text-right">{fmtMonto(data.comision)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
          <button onClick={() => window.print()} className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            🖨️ Imprimir / PDF
          </button>
        </div>
      </div>
    </div>
  );
}
