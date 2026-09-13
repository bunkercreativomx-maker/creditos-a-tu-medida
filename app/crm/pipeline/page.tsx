import { createServerClient } from "@/lib/pocketbase-server";
import { Pipeline } from "@/components/crm/Pipeline";
import type { PbLead, PbUser } from "@/lib/types";

export default async function CrmPipelinePage() {
  const pb = await createServerClient();
  const user = pb.authStore.model as { id?: string; role?: string } | null;
  const isAdmin = user?.role === "admin";
  const currentUserId = user?.id ?? "";

  const [leadsResult, usersResult, convsResult] = await Promise.all([
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
    pb.collection("users").getList(1, 500, { sort: "id" }),
    pb
      .collection("conversations")
      .getList(1, 500, { filter: `necesita_asesor = true` })
      .catch(() => ({ items: [] })),
  ]);

  const leads = leadsResult.items as unknown as PbLead[];
  const users = usersResult.items as unknown as PbUser[];
  // Ids de leads cuya conversación de WhatsApp necesita un asesor.
  const leadsNecesitanAsesor = (convsResult.items as unknown as { lead?: string }[])
    .map((c) => c.lead)
    .filter(Boolean) as string[];

  const vendedores = (users ?? []).map((u) => ({
    id: u.id,
    name: u.full_name || u.name || u.email || "",
  }));

  return (
    <div>
      <Pipeline
        leads={leads ?? []}
        vendedores={vendedores}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        leadsNecesitanAsesor={leadsNecesitanAsesor}
      />
    </div>
  );
}
