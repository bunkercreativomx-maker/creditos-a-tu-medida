"use client";

import { useState, useTransition } from "react";
import { createOperacion, updateOperacion, deleteOperacion } from "@/app/crm/actions";
import type { PbLead, PbFinanciera, PbOperacion, OperacionStatus, OperacionTipo } from "@/lib/types";

const STATUS_OPTIONS: { value: OperacionStatus; label: string }[] = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En proceso" },
  { value: "aprobado", label: "Aprobado" },
  { value: "finalizado", label: "Finalizado" },
  { value: "no_cumple", label: "No cumple" },
];

const TIPO_OPTIONS: { value: OperacionTipo; label: string }[] = [
  { value: "pensionado", label: "Pensionado" },
  { value: "jubilado", label: "Jubilado" },
];

/** Convierte fecha PB (ISO) a valor para <input type="date"> (YYYY-MM-DD). */
function toDateValue(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function FinancierasBoard({
  leads,
  financieras,
  operaciones,
}: {
  leads: PbLead[];
  financieras: PbFinanciera[];
  operaciones: PbOperacion[];
}) {
  const [isPending, startTransition] = useTransition();
  const [filterTipo, setFilterTipo] = useState<string>("");

  const leadName = (id: string) => {
    const l = leads.find((x) => x.id === id);
    return l ? `${l.nombre || "Sin nombre"} ${l.apellido ?? ""}`.trim() : "—";
  };
  const finName = (id: string | null) => {
    if (!id) return "—";
    const f = financieras.find((x) => x.id === id);
    return f?.nombre ?? "—";
  };

  const filtered = filterTipo
    ? operaciones.filter((o) => o.tipo === filterTipo)
    : operaciones;

  // leads sin operación aún (para poder asignar)
  const leadsSinOp = leads.filter(
    (l) => !operaciones.some((o) => o.lead === l.id)
  );

  return (
    <div className="flex h-[calc(100vh-160px)] flex-col">
      {/* Cabecera */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Tablero de Financieras</h1>
          <p className="text-xs text-slate-400">Montos, comisiones y estatus por financiera</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-white"
          >
            <option value="">Todas</option>
            {TIPO_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Lead</th>
              <th className="px-4 py-3 font-semibold">Monto prestado</th>
              <th className="px-4 py-3 font-semibold">Comisión</th>
              <th className="px-4 py-3 font-semibold">Financiera</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Comentarios</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Fecha desembolso</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((op) => (
              <Row
                key={op.id}
                op={op}
                leadName={leadName(op.lead)}
                financieras={financieras}
                onUpdate={(data) =>
                  startTransition(() => updateOperacion(op.id, data))
                }
                onDelete={() => startTransition(() => deleteOperacion(op.id))}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-slate-400">
                  Sin operaciones registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Agregar nueva operación */}
      {leadsSinOp.length > 0 && (
        <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">➕ Nueva operación</h3>
          <AddForm
            leadsSinOp={leadsSinOp}
            leadName={leadName}
            financieras={financieras}
            onCreate={(data) => startTransition(() => createOperacion(data))}
          />
        </div>
      )}
      {isPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Guardando...
        </div>
      )}
    </div>
  );
}

function Row({
  op,
  leadName,
  financieras,
  onUpdate,
  onDelete,
}: {
  op: PbOperacion;
  leadName: string;
  financieras: PbFinanciera[];
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [monto, setMonto] = useState(op.monto_prestado ?? "");
  const [comision, setComision] = useState(op.comision ?? "");
  const [comentarios, setComentarios] = useState(op.comentarios ?? "");
  const [fechaDesembolso, setFechaDesembolso] = useState(toDateValue(op.fecha_desembolso));

  const commit = (data: Record<string, unknown>) => onUpdate(data);

  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-4 py-2.5 font-medium text-slate-800">{leadName}</td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          value={monto}
          placeholder="$0"
          onChange={(e) => setMonto(e.target.value)}
          onBlur={() => monto !== op.monto_prestado && commit({ monto_prestado: monto })}
          className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2.5">
        <input
          type="number"
          value={comision}
          placeholder="$0"
          onChange={(e) => setComision(e.target.value)}
          onBlur={() => comision !== op.comision && commit({ comision: comision })}
          className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2.5">
        <select
          value={op.financiera ?? ""}
          onChange={(e) => commit({ financiera: e.target.value || null })}
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">—</option>
          {financieras.map((f) => (
            <option key={f.id} value={f.id}>{f.nombre}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <select
          value={op.status ?? "pendiente"}
          onChange={(e) => commit({ status: e.target.value })}
          className={`rounded-full border-0 px-3 py-1 text-xs font-semibold ${
            op.status === "aprobado" || op.status === "finalizado"
              ? "bg-emerald-100 text-emerald-700"
              : op.status === "no_cumple"
              ? "bg-rose-100 text-rose-700"
              : op.status === "en_proceso"
              ? "bg-amber-100 text-amber-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <input
          type="text"
          value={comentarios}
          placeholder="Comentarios..."
          onChange={(e) => setComentarios(e.target.value)}
          onBlur={() => comentarios !== op.comentarios && commit({ comentarios: comentarios })}
          className="w-48 rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2.5">
        <select
          value={op.tipo ?? ""}
          onChange={(e) => commit({ tipo: e.target.value || null })}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">—</option>
          {TIPO_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </td>
      <td className="px-4 py-2.5">
        <input
          type="date"
          value={fechaDesembolso}
          onChange={(e) => setFechaDesembolso(e.target.value)}
          onBlur={() => fechaDesembolso !== toDateValue(op.fecha_desembolso) && commit({ fecha_desembolso: fechaDesembolso || null })}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </td>
      <td className="px-4 py-2.5 text-right">
        <button
          onClick={onDelete}
          className="rounded-md px-2 py-1 text-xs text-rose-500 hover:bg-rose-50"
          title="Eliminar"
        >
          🗑️
        </button>
      </td>
    </tr>
  );
}

function AddForm({
  leadsSinOp,
  leadName,
  financieras,
  onCreate,
}: {
  leadsSinOp: PbLead[];
  leadName: (id: string) => string;
  financieras: PbFinanciera[];
  onCreate: (data: Record<string, unknown>) => void;
}) {
  const [lead, setLead] = useState("");
  const [financiera, setFinanciera] = useState("");
  const [monto, setMonto] = useState("");
  const [comision, setComision] = useState("");
  const [tipo, setTipo] = useState<OperacionTipo>("pensionado");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-slate-500">
        Lead
        <select
          value={lead}
          onChange={(e) => setLead(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
        >
          <option value="">Selecciona...</option>
          {leadsSinOp.map((l) => (
            <option key={l.id} value={l.id}>{leadName(l.id)}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Financiera
        <select
          value={financiera}
          onChange={(e) => setFinanciera(e.target.value)}
          className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
        >
          <option value="">—</option>
          {financieras.map((f) => (
            <option key={f.id} value={f.id}>{f.nombre}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Monto
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          placeholder="$0"
          className="mt-1 w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Comisión
        <input
          type="number"
          value={comision}
          onChange={(e) => setComision(e.target.value)}
          placeholder="$0"
          className="mt-1 w-24 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>
      <label className="flex flex-col text-xs text-slate-500">
        Tipo
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as OperacionTipo)}
          className="mt-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-800"
        >
          {TIPO_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <button
        disabled={!lead}
        onClick={() => {
          onCreate({
            lead,
            financiera: financiera || null,
            monto_prestado: monto || null,
            comision: comision || null,
            tipo,
            status: "pendiente",
          });
          setLead(""); setFinanciera(""); setMonto(""); setComision("");
        }}
        className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
      >
        Agregar
      </button>
    </div>
  );
}
