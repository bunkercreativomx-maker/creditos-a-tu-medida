"use client";

import Link from "next/link";
import { useTransition, useState } from "react";
import { claimLead } from "@/app/crm/actions";
import type { PbLead } from "@/lib/types";

export function LeadCard({
  lead,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  lead: PbLead;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [justClaimed, setJustClaimed] = useState(false);

  const nombre = `${lead.nombre || "Sin nombre"} ${lead.apellido ?? ""}`.trim();
  const origen = lead.origen === "whatsapp" ? "WhatsApp" : "Web";
  const asignado = lead.asignado_a ? true : false;

  function handleClaim() {
    startTransition(async () => {
      await claimLead(lead.id);
      setJustClaimed(true);
      setTimeout(() => setJustClaimed(false), 2000);
    });
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-xl border bg-white p-3 shadow-sm transition-all hover:shadow-md active:cursor-grabbing ${
        isDragging ? "opacity-40 ring-2 ring-blue-400" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/crm/leads/${lead.id}`}
          className="text-sm font-semibold text-slate-800 hover:text-blue-700 hover:underline"
        >
          {nombre}
        </Link>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            origen === "WhatsApp"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-sky-100 text-sky-700"
          }`}
        >
          {origen}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 3.5A1.5 1.5 0 013.5 2h1.586l.383 1.912a1 1 0 01-.287.933l-1.1 1.1a.5.5 0 00-.1.536 12.035 12.035 0 005.537 5.537.5.5 0 00.536-.1l1.1-1.1a1 1 0 01.933-.287L14 10.914V12.5A1.5 1.5 0 0112.5 14 12.5 12.5 0 012 3.5z" />
        </svg>
        {lead.telefono}
      </div>

      {lead.producto_interes && (
        <div className="mt-1.5 text-xs text-slate-400">{lead.producto_interes}</div>
      )}

      {lead.monto_aproximado && (
        <div className="mt-2">
          <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {lead.monto_aproximado}
          </span>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
        <span
          className={`text-[10px] font-medium ${
            asignado || justClaimed ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          {asignado || justClaimed ? "✓ Asignado a ti" : "Sin asignar"}
        </span>
        {!asignado && (
          <button
            disabled={isPending}
            onClick={handleClaim}
            className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            Tomar
          </button>
        )}
      </div>
    </div>
  );
}
