"use client";

import { useState, useTransition, useCallback } from "react";
import { LeadCard } from "./LeadCard";
import { PIPELINE_STAGES } from "./pipeline-stages";
import { updateLeadStatus, createLead } from "@/app/crm/actions";
import type { PbLead, LeadStatus } from "@/lib/types";

export function Pipeline({ leads, vendedores, isAdmin }: { leads: PbLead[]; vendedores?: { id: string; name: string }[]; isAdmin?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStatus | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const byStatus = useCallback(
    (status: LeadStatus) => leads.filter((l) => l.status === status),
    [leads]
  );

  const asignadoNombre = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const v = vendedores?.find((x) => x.id === id);
      return v?.name ?? null;
    },
    [vendedores]
  );

  const total = leads.length;

  function handleDrop(e: React.DragEvent, targetStatus: LeadStatus) {
    e.preventDefault();
    setOverStage(null);
    const leadId = e.dataTransfer.getData("text/lead-id");
    if (!leadId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.status === targetStatus) return;

    startTransition(() => {
      updateLeadStatus(leadId, targetStatus);
    });
  }

  return (
    <div className="flex h-[calc(100dvh-150px)] flex-col">
      {/* Cabecera del pipeline estilo GHL */}
      <div className="mb-4 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Pipeline de Leads</h1>
            <p className="text-xs text-slate-400">
              {total} leads en el embudo · arrastra entre etapas para mover
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="shrink-0 rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            + Nuevo lead
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-slate-700 px-3 py-1">
            <span className="font-bold text-white">{total}</span> total
          </span>
        </div>
      </div>

      {/* Columnas del pipeline */}
      {/* En móvil se apilan verticalmente; en md+ quedan como kanban con scroll horizontal */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4 md:flex-row md:overflow-x-auto md:overflow-y-hidden">
        {PIPELINE_STAGES.map((stage) => {
          const stageLeads = byStatus(stage.status);
          return (
            <div
              key={stage.status}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage.status);
              }}
              onDragLeave={() => setOverStage(null)}
              onDrop={(e) => handleDrop(e, stage.status)}
              className={`flex w-full shrink-0 flex-col rounded-xl border bg-slate-50/80 transition-all md:w-72 ${
                overStage === stage.status
                  ? "border-blue-400 ring-2 ring-blue-300"
                  : "border-slate-200"
              }`}
            >
              {/* Encabezado de columna */}
              <div className={`flex items-center justify-between rounded-t-xl ${stage.bg} px-3 py-2.5`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${stage.color}`} />
                  <span className="text-sm font-semibold text-slate-700">{stage.label}</span>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 shadow-sm">
                  {stageLeads.length}
                </span>
              </div>

              {/* Tarjetas */}
              <div className="flex flex-1 flex-col gap-2 p-2 md:overflow-y-auto">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    isAdmin={isAdmin}
                    asignadoNombre={asignadoNombre(lead.asignado_a)}
                    isDragging={draggingId === lead.id}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/lead-id", lead.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(lead.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))}
                {stageLeads.length === 0 && (
                  <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 p-4 text-xs text-slate-400">
                    Suelta aquí
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <AddLeadForm
          vendedores={vendedores ?? []}
          onClose={() => setShowAdd(false)}
          onSave={(data) => {
            startTransition(async () => {
              await createLead(data);
              setShowAdd(false);
            });
          }}
        />
      )}

      {isPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Moviendo lead...
        </div>
      )}
    </div>
  );
}

function AddLeadForm({
  vendedores,
  onClose,
  onSave,
}: {
  vendedores: { id: string; name: string }[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [producto, setProducto] = useState("");
  const [monto, setMonto] = useState("");
  const [asignado, setAsignado] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-800">Nuevo lead</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={apellido} onChange={(e) => setApellido(e.target.value)} placeholder="Apellido" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Teléfono (10 dígitos)" className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input value={producto} onChange={(e) => setProducto(e.target.value)} placeholder="Sector (ej. Pensionados)" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <select value={monto} onChange={(e) => setMonto(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Monto aprox...</option>
            <option>Menos de $10,000</option>
            <option>$10,000 - $30,000</option>
            <option>$30,000 - $60,000</option>
            <option>$60,000 - $100,000</option>
            <option>Más de $100,000</option>
          </select>
          <select value={asignado} onChange={(e) => setAsignado(e.target.value)} className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Sin asignar</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-500 hover:bg-slate-100">Cancelar</button>
          <button
            onClick={() => {
              if (telefono.length >= 10) {
                onSave({ nombre, apellido, telefono, email, producto_interes: producto, monto_aproximado: monto, asignado_a: asignado || null });
              }
            }}
            className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            disabled={telefono.length < 10}
          >
            Crear lead
          </button>
        </div>
      </div>
    </div>
  );
}
