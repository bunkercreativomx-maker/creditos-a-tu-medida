import { createServerClient } from "@/lib/pocketbase-server";
import { Pipeline } from "@/components/crm/Pipeline";
import type { PbLead, PbUser } from "@/lib/types";

export default async function CrmDashboard() {
  const pb = await createServerClient();
  const user = pb.authStore.model as { role?: string } | null;
  const isAdmin = user?.role === "admin";

  const [leadsResult, usersResult] = await Promise.all([
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
    pb.collection("users").getList(1, 500, { sort: "id" }),
  ]);

  const leads = leadsResult.items as unknown as PbLead[];
  const users = usersResult.items as unknown as PbUser[];

  const vendedores = (users ?? [])
    .filter((u) => u.role === "asesor")
    .map((u) => ({ id: u.id, name: u.full_name || u.name || u.email || "" }));

  return (
    <div>
      <Pipeline leads={leads ?? []} vendedores={vendedores} isAdmin={isAdmin} />
    </div>
  );
}
