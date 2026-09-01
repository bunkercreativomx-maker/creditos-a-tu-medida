"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { claimLead, deleteLead } from "@/app/crm/actions";
import { calcularEdad } from "@/lib/edad";
import type { PbLead } from "@/lib/types";

export function LeadCard({
  lead,
  onDragStart,
  onDragEnd,
  isDragging,
  isAdmin,
  asignadoNombre,
}: {
  lead: PbLead;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isAdmin?: boolean;
  asignadoNombre?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justClaimed, setJustClaimed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nombre = `${lead.nombre || "Sin nombre"} ${lead.apellido ?? ""}`.trim();
  const origen = lead.origen === "whatsapp" ? "WhatsApp" : "Web";
  const asignado = lead.asignado_a ? true : false;
  const duenoNombre = asignadoNombre || "Asignado";

  function handleClaim() {
    startTransition(async () => {
      await claimLead(lead.id);
      setJustClaimed(true);
      setTimeout(() => setJustClaimed(false), 2000);
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteLead(lead.id);
        router.refresh();
      } catch (err) {
        setError((err as Error)?.message ?? "Error al eliminar el lead");
        setConfirmingDelete(false);
      }
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
      <Link href={`/crm/leads/${lead.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-slate-800 group-hover:text-blue-700">
            {nombre}
          </span>
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

        {lead.fecha_nacimiento && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                clipRule="evenodd"
              />
            </svg>
            {lead.fecha_nacimiento}
            {calcularEdad(lead.fecha_nacimiento) !== null && (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {calcularEdad(lead.fecha_nacimiento)} años
              </span>
            )}
          </div>
        )}

        {lead.monto_aproximado && (
          <div className="mt-2">
            <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
              {lead.monto_aproximado}
            </span>
          </div>
        )}
      </Link>

      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2">
        <span
          className={`inline-flex items-center gap-1 text-[10px] font-medium ${
            asignado || justClaimed ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          {asignado || justClaimed ? (
            <>
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[9px]">
                👤
              </span>
              {justClaimed ? "Asignado a ti" : duenoNombre}
            </>
          ) : (
            "Sin asignar"
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {!asignado && (
            <button
              disabled={isPending}
              onClick={handleClaim}
              className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
            >
              Tomar
            </button>
          )}
          {isAdmin && !confirmingDelete && (
            <button
              disabled={isPending}
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              Borrar
            </button>
          )}
        </div>
      </div>

      {confirmingDelete && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2">
          <p className="text-[11px] font-medium text-red-700">
            ¿Eliminar a <span className="font-bold">{nombre}</span>? Se borrarán también sus operaciones, citas y notas.
          </p>
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              disabled={isPending}
              onClick={handleDelete}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isPending ? "Borrando..." : "Sí, eliminar"}
            </button>
            <button
              disabled={isPending}
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
