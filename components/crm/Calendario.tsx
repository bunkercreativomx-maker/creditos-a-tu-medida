"use client";

import { useMemo, useState, useTransition } from "react";
import { createCita, updateCita, deleteCita } from "@/app/crm/actions";
import type { PbCita, PbLead, CitaTipo } from "@/lib/types";

const TIPO_LABEL: Record<string, string> = {
  llamada: "📞 Llamada",
  cita: "🤝 Cita",
  seguimiento: "🔁 Seguimiento",
  documentos: "📄 Documentos",
};

const TIPO_COLOR: Record<string, string> = {
  llamada: "bg-sky-100 text-sky-700",
  cita: "bg-violet-100 text-violet-700",
  seguimiento: "bg-amber-100 text-amber-700",
  documentos: "bg-emerald-100 text-emerald-700",
};

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const WEEKDAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];

export function Calendario({ citas, leads }: { citas: PbCita[]; leads: PbLead[] }) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const leadName = (id: string | null) => {
    if (!id) return "";
    const l = leads.find((x) => x.id === id);
    return l ? `${l.nombre || "Sin nombre"} ${l.apellido ?? ""}`.trim() : "";
  };

  const days = useMemo(() => {
    const first = new Date(current.year, current.month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(current.year, current.month, d));
    return cells;
  }, [current]);

  const citasDeFecha = (d: Date) => {
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    return citas.filter((c) => c.fecha?.startsWith(key));
  };

  const prevMonth = () => setCurrent(({year,month}) => month===0 ? {year:year-1,month:11} : {year,month:month-1});
  const nextMonth = () => setCurrent(({year,month}) => month===11 ? {year:year+1,month:0} : {year,month:month+1});

  return (
    <div className="flex h-[calc(100dvh-170px)] flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Calendario</h1>
          <p className="text-xs text-slate-400">{citas.length} citas agendadas</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600">←</button>
            <span className="text-sm font-semibold">{MONTHS[current.month]} {current.year}</span>
            <button onClick={nextMonth} className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600">→</button>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold hover:bg-blue-500"
          >
            + Nueva cita
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-7 border-b bg-slate-50">
          {WEEKDAYS.map((w) => (
            <div key={w} className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="min-h-[70px] border-b border-r border-slate-100 bg-slate-50/40 sm:min-h-[110px]" />;
            const c = citasDeFecha(d);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div
                key={d.toISOString()}
                onClick={() => setSelectedDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`)}
                className={`min-h-[70px] cursor-pointer border-b border-r border-slate-100 p-1 transition-colors hover:bg-blue-50/40 sm:min-h-[110px] sm:p-1.5 ${isToday ? "bg-blue-50/60" : ""}`}
              >
                <span className={`text-xs font-medium ${isToday ? "text-blue-700" : "text-slate-500"}`}>{d.getDate()}</span>
                <div className="mt-1 space-y-1">
                  {c.slice(0,3).map((cita) => (
                    <div key={cita.id} className={`truncate rounded px-1 py-0.5 text-[10px] font-medium ${TIPO_COLOR[cita.tipo ?? "llamada"]}`}>
                      {TIPO_LABEL[cita.tipo ?? "llamada"]}
                      {cita.titulo ? `: ${cita.titulo}` : ""}
                    </div>
                  ))}
                  {c.length > 3 && <div className="text-[10px] text-slate-400">+{c.length-3} más</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <DayDetail
          date={selectedDate}
          citas={citas.filter((c) => c.fecha?.startsWith(selectedDate))}
          leads={leads}
          leadName={leadName}
          onClose={() => setSelectedDate(null)}
          onSave={(data) => startTransition(() => createCita(data))}
          onUpdate={(id, data) => startTransition(() => updateCita(id, data))}
          onDelete={(id) => startTransition(() => deleteCita(id))}
        />
      )}

      {showAdd && (
        <AddCita
          date={selectedDate}
          leads={leads}
          leadName={leadName}
          onClose={() => setShowAdd(false)}
          onSave={(data) => {
            startTransition(() => createCita(data));
            setShowAdd(false);
          }}
        />
      )}

      {isPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Guardando...
        </div>
      )}
    </div>
  );
}

function DayDetail({
  date,
  citas,
  leads,
  leadName,
  onClose,
  onSave,
  onUpdate,
  onDelete,
}: {
  date: string;
  citas: PbCita[];
  leads: PbLead[];
  leadName: (id: string | null) => string;
  onClose: () => void;
  onSave: (d: Record<string, unknown>) => void;
  onUpdate: (id: string, d: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<CitaTipo>("llamada");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-800">Citas — {date}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="mt-3 space-y-2">
          {citas.length === 0 && <p className="text-sm text-slate-400">Sin citas este día</p>}
          {citas.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2">
              <div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TIPO_COLOR[c.tipo ?? "llamada"]}`}>
                  {TIPO_LABEL[c.tipo ?? "llamada"]}
                </span>
                <p className="mt-1 text-sm text-slate-700">{c.titulo || leadName(c.lead) || "Sin título"}</p>
                {c.notas && <p className="text-xs text-slate-400">{c.notas}</p>}
              </div>
              <button onClick={() => onDelete(c.id)} className="text-rose-500 hover:bg-rose-50 rounded p-1">🗑️</button>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="flex gap-2">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Título de la cita"
              className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            />
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as CitaTipo)}
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            >
              {Object.entries(TIPO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button
              onClick={() => {
                if (titulo.trim()) {
                  onSave({ titulo, fecha: `${date}T12:00:00`, tipo });
                  setTitulo("");
                }
              }}
              className="rounded-lg bg-blue-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-800"
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddCita({
  date,
  leads,
  leadName,
  onClose,
  onSave,
}: {
  date: string | null;
  leads: PbLead[];
  leadName: (id: string | null) => string;
  onClose: () => void;
  onSave: (d: Record<string, unknown>) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<CitaTipo>("llamada");
  const [fecha, setFecha] = useState(date ?? "");
  const [lead, setLead] = useState("");
  const [notas, setNotas] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-bold text-slate-800">Nueva cita</h3>
        <div className="mt-3 space-y-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título"
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as CitaTipo)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          >
            {Object.entries(TIPO_LABEL).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={lead}
            onChange={(e) => setLead(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          >
            <option value="">Sin lead</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{leadName(l.id)}</option>)}
          </select>
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Notas"
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={() => {
              if (fecha) {
                onSave({ titulo: titulo || null, fecha: `${fecha}T12:00:00`, tipo, lead: lead || null, notas: notas || null });
              }
            }}
            className="rounded-lg bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
