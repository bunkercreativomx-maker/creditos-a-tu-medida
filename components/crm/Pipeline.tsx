"use client";

import { useState, useTransition, useCallback } from "react";
import { LeadCard } from "./LeadCard";
import { PIPELINE_STAGES } from "./pipeline-stages";
import { updateLeadStatus } from "@/app/crm/actions";
import type { PbLead, LeadStatus } from "@/lib/types";

export function Pipeline({ leads }: { leads: PbLead[] }) {
  const [isPending, startTransition] = useTransition();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<LeadStatus | null>(null);

  const byStatus = useCallback(
    (status: LeadStatus) => leads.filter((l) => l.status === status),
    [leads]
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
    <div className="flex h-[calc(100vh-140px)] flex-col">
      {/* Cabecera del pipeline estilo GHL */}
      <div className="mb-4 flex items-center justify-between rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Pipeline de Leads</h1>
          <p className="text-xs text-slate-400">
            {total} leads en el embudo · arrastra entre etapas para mover
          </p>
        </div>
        <div className="hidden items-center gap-3 text-xs text-slate-300 sm:flex">
          <span className="rounded-full bg-slate-700 px-3 py-1">
            <span className="font-bold text-white">{total}</span> total
          </span>
        </div>
      </div>

      {/* Columnas del pipeline */}
      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
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
              className={`flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50/80 transition-all ${
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
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
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

      {isPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Moviendo lead...
        </div>
      )}
    </div>
  );
}
