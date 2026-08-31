import { createServerClient } from "@/lib/pocketbase-server";
import { ComisionesBoard } from "@/components/crm/ComisionesBoard";
import type { PbLead, PbOperacion, PbUser } from "@/lib/types";

export default async function ComisionesPage() {
  const pb = await createServerClient();

  const [leadsResult, opsResult, usersResult] = await Promise.all([
    pb.collection("leads").getList(1, 2000, { sort: "-id" }),
    pb.collection("operaciones").getList(1, 2000, { sort: "-id" }),
    pb.collection("users").getList(1, 500, { sort: "id" }),
  ]);

  const leads = leadsResult.items as unknown as PbLead[];
  const operaciones = opsResult.items as unknown as PbOperacion[];
  const usuarios = usersResult.items as unknown as PbUser[];

  return (
    <ComisionesBoard
      operaciones={operaciones ?? []}
      leads={leads ?? []}
      usuarios={usuarios ?? []}
    />
  );
}
