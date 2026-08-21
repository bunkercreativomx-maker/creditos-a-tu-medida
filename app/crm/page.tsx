import { createServerClient } from "@/lib/pocketbase-server";
import { LeadCard } from "@/components/crm/LeadCard";
import type { PbLead, LeadStatus } from "@/lib/types";

const COLUMNS: { status: LeadStatus; label: string }[] = [
  { status: "nuevo", label: "Nuevo" },
  { status: "contactado", label: "Contactado" },
  { status: "en_seguimiento", label: "En seguimiento" },
  { status: "documentos", label: "Documentos" },
  { status: "cerrado_ganado", label: "Cerrado (ganado)" },
  { status: "cerrado_perdido", label: "Cerrado (perdido)" },
];

export default async function CrmDashboard() {
  const pb = await createServerClient();
  const result = await pb.collection("leads").getList(1, 500, {
    sort: "-created",
  });
  const leads = result.items as unknown as PbLead[];

  const byStatus = (status: LeadStatus): PbLead[] =>
    (leads ?? []).filter((l) => l.status === status);

  return (
    <div>
      <h1 className="text-xl font-bold text-blue-900">Leads</h1>
      <div className="mt-4 grid grid-cols-1 gap-4 overflow-x-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {COLUMNS.map((col) => (
          <div key={col.status} className="min-w-[240px]">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">
              {col.label} ({byStatus(col.status).length})
            </h2>
            <div className="space-y-3">
              {byStatus(col.status).map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
              {byStatus(col.status).length === 0 && (
                <p className="text-xs text-slate-400">Sin leads</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
