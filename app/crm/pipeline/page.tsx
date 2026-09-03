import { createServerClient } from "@/lib/pocketbase-server";
import { Pipeline } from "@/components/crm/Pipeline";
import type { PbLead, PbUser } from "@/lib/types";

export default async function CrmPipelinePage() {
  const pb = await createServerClient();
  const user = pb.authStore.model as { id?: string; role?: string } | null;
  const isAdmin = user?.role === "admin";
  const currentUserId = user?.id ?? "";

  const [leadsResult, usersResult] = await Promise.all([
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
    pb.collection("users").getList(1, 500, { sort: "id" }),
  ]);

  const leads = leadsResult.items as unknown as PbLead[];
  const users = usersResult.items as unknown as PbUser[];

  const vendedores = (users ?? []).map((u) => ({
    id: u.id,
    name: u.full_name || u.name || u.email || "",
  }));

  return (
    <div>
      <Pipeline leads={leads ?? []} vendedores={vendedores} isAdmin={isAdmin} currentUserId={currentUserId} />
    </div>
  );
}
