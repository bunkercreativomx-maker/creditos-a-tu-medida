import type { LeadStatus } from "@/lib/types";

export const PIPELINE_STAGES: { status: LeadStatus; label: string; color: string; bg: string }[] = [
  {
    status: "nuevo",
    label: "Nuevo",
    color: "bg-sky-500",
    bg: "bg-sky-50",
  },
  {
    status: "contactado",
    label: "Contactado",
    color: "bg-indigo-500",
    bg: "bg-indigo-50",
  },
  {
    status: "en_seguimiento",
    label: "En seguimiento",
    color: "bg-amber-500",
    bg: "bg-amber-50",
  },
  {
    status: "documentos",
    label: "Documentos",
    color: "bg-violet-500",
    bg: "bg-violet-50",
  },
  {
    status: "cerrado_ganado",
    label: "Cerrado (ganado)",
    color: "bg-emerald-500",
    bg: "bg-emerald-50",
  },
  {
    status: "cerrado_perdido",
    label: "Cerrado (perdido)",
    color: "bg-rose-500",
    bg: "bg-rose-50",
  },
];

export const STATUS_LABEL: Record<LeadStatus, string> = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.status, s.label])
) as Record<LeadStatus, string>;
