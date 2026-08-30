"use client";

import { useTransition } from "react";
import Link from "next/link";
import { updateLead } from "@/app/crm/actions";
import type { PbUser, PbLead, LeadStatus } from "@/lib/types";

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: "nuevo", label: "Nuevo" },
  { value: "contactado", label: "Contactado" },
  { value: "en_seguimiento", label: "En seguimiento" },
  { value: "documentos", label: "Documentos" },
  { value: "cerrado_ganado", label: "Cerrado (ganado)" },
  { value: "cerrado_perdido", label: "Cerrado (perdido)" },
];

export function VendedoresBoard({ vendedores, leads }: { vendedores: PbUser[]; leads: PbLead[] }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex h-[calc(100dvh-170px)] flex-col">
      <div className="mb-4 rounded-xl bg-slate-900 px-5 py-4 text-white shadow-lg">
        <h1 className="text-lg font-bold tracking-tight">Vendedores / Representantes</h1>
        <p className="text-xs text-slate-400">{vendedores.length} vendedores · {leads.length} leads</p>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-auto md:grid-cols-2 xl:grid-cols-3">
        {vendedores.map((v) => {
          const misLeads = leads.filter((l) => l.asignado_a === v.id);
          return (
            <div key={v.id} className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-900 font-bold text-white">
                  {(v.full_name || v.name || v.email || "?").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{v.full_name || v.name || v.email}</h3>
                  <p className="text-xs text-slate-400">{misLeads.length} leads asignados</p>
                </div>
              </div>
              <div className="flex-1 divide-y divide-slate-50 overflow-auto">
                {misLeads.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">Sin leads asignados</p>
                )}
                {misLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <Link href={`/crm/leads/${l.id}`} className="text-sm font-medium text-slate-700 hover:text-blue-700 hover:underline">
                      {l.nombre || "Sin nombre"} {l.apellido ?? ""}
                    </Link>
                    <select
                      value={l.status}
                      onChange={(e) => startTransition(() => updateLead(l.id, { status: e.target.value }))}
                      className="rounded-md border border-slate-200 px-1.5 py-0.5 text-xs"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {vendedores.length === 0 && (
          <p className="col-span-full text-center text-slate-400">Sin vendedores registrados</p>
        )}
      </div>

      {isPending && (
        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg">
          Guardando...
        </div>
      )}
    </div>
  );
}
