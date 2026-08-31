"use client";

import { useMemo, useState } from "react";
import type { PbOperacion, PbLead, PbUser } from "@/lib/types";

const GANADORAS: string[] = ["aprobado", "finalizado"];

function fmt(n: number | null): string {
  if (n == null) return "—";
  return `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function fmtFecha(f: string | null | undefined): string {
  if (!f) return "—";
  const d = new Date(f);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export function ComisionesBoard({
  operaciones,
  leads,
  usuarios,
}: {
  operaciones: PbOperacion[];
  leads: PbLead[];
  usuarios: PbUser[];
}) {
  const [filtroVendedor, setFiltroVendedor] = useState<string>("");
  const [filtroMes, setFiltroMes] = useState<string>("");

  const hoy = new Date();
  const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;

  const leadDe = (id: string) => leads.find((l) => l.id === id) ?? null;
  const userDe = (id: string) => usuarios.find((u) => u.id === id) ?? null;
  const nombreUser = (id: string | null | undefined) => {
    if (!id) return "Sin asignar";
    const u = userDe(id);
    return u ? (u.full_name || u.name || u.email || "—") : "Sin asignar";
  };
  const nombreLead = (id: string | null | undefined) => {
    if (!id) return "—";
    const l = leadDe(id);
    return l ? `${l.nombre || "Sin nombre"} ${l.apellido ?? ""}`.trim() : "—";
  };

  // Operaciones ganadoras con su vendedor y mes
  const ganadoras = useMemo(() => {
    return operaciones
      .filter((o) => o.status && GANADORAS.includes(o.status))
      .map((o) => {
        const lead = leadDe(o.lead);
        const vendedorId = lead?.asignado_a ?? "";
        const d = o.fecha_desembolso || o.created;
        const dt = new Date(d);
        const mesKey = isNaN(dt.getTime())
          ? ""
          : `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
        return { o, vendedorId, mesKey };
      })
      .filter((x) => x.vendedorId !== "");
  }, [operaciones, leads]);

  // Resumen por vendedor
  const resumen = useMemo(() => {
    const map = new Map<string, { count: number; monto: number; comision: number }>();
    for (const g of ganadoras) {
      if (filtroMes && g.mesKey !== filtroMes) continue;
      const cur = map.get(g.vendedorId) ?? { count: 0, monto: 0, comision: 0 };
      cur.count += 1;
      cur.monto += Number(g.o.monto_prestado) || 0;
      cur.comision += Number(g.o.comision) || 0;
      map.set(g.vendedorId, cur);
    }
    return Array.from(map.entries())
      .map(([id, s]) => ({ id, nombre: nombreUser(id), ...s }))
      .sort((a, b) => b.comision - a.comision);
  }, [ganadoras, filtroMes]);

  // Detalle filtrado
  const detalle = useMemo(() => {
    return ganadoras.filter(
      (g) => (!filtroVendedor || g.vendedorId === filtroVendedor) && (!filtroMes || g.mesKey === filtroMes)
    );
  }, [ganadoras, filtroVendedor, filtroMes]);

  const totalComision = resumen.reduce((s, r) => s + r.comision, 0);
  const totalMonto = resumen.reduce((s, r) => s + r.monto, 0);
  const totalCount = resumen.reduce((s, r) => s + r.count, 0);

  function exportCSV() {
    const header = "Vendedor;Operaciones;Monto total;Comision total";
    const rows = resumen.map(
      (r) => `${r.nombre};${r.count};${r.monto};${r.comision}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comisiones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const vendedores = usuarios.filter((u) => u.role !== "admin" || true);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold tracking-tight">💰 Comisiones por vendedor</h1>
          <p className="text-xs text-slate-400">
            Préstamos aprobados y finalizados · montos y comisiones por asesor
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          ⬇️ Exportar CSV
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filtroVendedor}
          onChange={(e) => setFiltroVendedor(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos los vendedores</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.full_name || v.name || v.email}
            </option>
          ))}
        </select>
        <select
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <option value="">Todos los meses</option>
          <option value={mesActualKey}>Este mes</option>
          <option value="">—</option>
        </select>
        {filtroMes && (
          <input
            type="month"
            value={filtroMes}
            onChange={(e) => setFiltroMes(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Operaciones</p>
          <p className="mt-1 text-2xl font-bold text-slate-800">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Monto total</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{fmt(totalMonto)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Comisiones</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{fmt(totalComision)}</p>
        </div>
      </div>

      {/* Tabla resumen por vendedor */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-blue-900">Resumen por vendedor</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Vendedor</th>
                <th className="px-4 py-2.5 font-semibold">Operaciones</th>
                <th className="px-4 py-2.5 font-semibold">Monto total</th>
                <th className="px-4 py-2.5 font-semibold text-right">Comisión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {resumen.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{r.nombre}</td>
                  <td className="px-4 py-2.5 text-slate-600">{r.count}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmt(r.monto)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">
                    {fmt(r.comision)}
                  </td>
                </tr>
              ))}
              {resumen.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Sin operaciones ganadoras registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalle de operaciones filtradas */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="font-semibold text-blue-900">
            Detalle {filtroVendedor ? `· ${nombreUser(filtroVendedor)}` : "· todos los vendedores"}
          </h2>
          <span className="text-xs text-slate-400">{detalle.length} operaciones</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Vendedor</th>
                <th className="px-4 py-2.5 font-semibold">Monto</th>
                <th className="px-4 py-2.5 font-semibold">Comisión</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detalle.map(({ o, vendedorId, mesKey }) => (
                <tr key={o.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-2.5 font-medium text-slate-800">{nombreLead(o.lead)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{nombreUser(vendedorId)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{fmt(o.monto_prestado)}</td>
                  <td className="px-4 py-2.5 font-semibold text-emerald-700">{fmt(o.comision)}</td>
                  <td className="px-4 py-2.5 text-slate-400">{fmtFecha(o.fecha_desembolso || o.created)}</td>
                </tr>
              ))}
              {detalle.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Sin operaciones para los filtros seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
