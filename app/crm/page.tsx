import { createServerClient } from "@/lib/pocketbase-server";
import { Dashboard } from "@/components/crm/Dashboard";
import type { PbLead, PbFinanciera, PbOperacion, PbCita, PbUser } from "@/lib/types";

export default async function CrmDashboard() {
  const pb = await createServerClient();
  const user = pb.authStore.model as { id?: string; role?: string } | null;
  const currentUserId = user?.id ?? "";

  const [leadsResult, financierasResult, opsResult, citasResult, usersResult] = await Promise.all([
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
    pb.collection("financieras").getList(1, 200, { sort: "nombre" }),
    pb.collection("operaciones").getList(1, 1000, { sort: "-id" }),
    pb.collection("citas").getList(1, 1000, { sort: "fecha" }),
    pb.collection("users").getList(1, 500, { sort: "id" }),
  ]);

  const leads = leadsResult.items as unknown as PbLead[];
  const financieras = financierasResult.items as unknown as PbFinanciera[];
  const operaciones = opsResult.items as unknown as PbOperacion[];
  const citas = citasResult.items as unknown as PbCita[];
  const usuarios = usersResult.items as unknown as PbUser[];

  return (
    <Dashboard
      operaciones={operaciones ?? []}
      leads={leads ?? []}
      financieras={financieras ?? []}
      citas={citas ?? []}
      usuarios={usuarios ?? []}
      currentUserId={currentUserId}
    />
  );
}
