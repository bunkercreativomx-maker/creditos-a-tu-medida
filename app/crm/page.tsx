import { createServerClient } from "@/lib/pocketbase-server";
import { Dashboard } from "@/components/crm/Dashboard";
import type { PbLead, PbFinanciera, PbOperacion } from "@/lib/types";

export default async function CrmDashboard() {
  const pb = await createServerClient();

  const [leadsResult, financierasResult, opsResult] = await Promise.all([
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
    pb.collection("financieras").getList(1, 200, { sort: "nombre" }),
    pb.collection("operaciones").getList(1, 1000, { sort: "-id" }),
  ]);

  const leads = leadsResult.items as unknown as PbLead[];
  const financieras = financierasResult.items as unknown as PbFinanciera[];
  const operaciones = opsResult.items as unknown as PbOperacion[];

  return (
    <Dashboard
      operaciones={operaciones ?? []}
      leads={leads ?? []}
      financieras={financieras ?? []}
    />
  );
}
