"use client";

import Link from "next/link";
import { useTransition } from "react";
import { claimLead, updateLeadStatus } from "@/app/crm/actions";
import type { Lead, LeadStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "contactado", label: "Contactado" },
  { value: "en_seguimiento", label: "En seguimiento" },
  { value: "documentos", label: "Documentos" },
  { value: "cerrado_ganado", label: "Cerrado (ganado)" },
  { value: "cerrado_perdido", label: "Cerrado (perdido)" },
];

export function LeadCard({ lead }: { lead: Lead }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <Link href={`/crm/leads/${lead.id}`} className="font-semibold text-blue-900 hover:underline">
          {lead.nombre || "Sin nombre"} {lead.apellido ?? ""}
        </Link>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-500">
          {lead.origen === "whatsapp" ? "WhatsApp" : "Web"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">{lead.telefono}</p>
      {lead.producto_interes && <p className="text-xs text-slate-400">{lead.producto_interes}</p>}

      <div className="mt-3 flex items-center gap-2">
        <select
          defaultValue={lead.status}
          disabled={isPending}
          onChange={(e) =>
            startTransition(() => {
              updateLeadStatus(lead.id, e.target.value as LeadStatus);
            })
          }
          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {!lead.asignado_a && (
        <button
          disabled={isPending}
          onClick={() => startTransition(() => claimLead(lead.id))}
          className="mt-2 w-full rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-900 hover:bg-blue-100"
        >
          Tomar lead
        </button>
      )}
    </div>
  );
}
