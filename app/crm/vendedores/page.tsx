import { createServerClient } from "@/lib/pocketbase-server";
import { VendedoresBoard } from "@/components/crm/VendedoresBoard";
import type { PbUser, PbLead } from "@/lib/types";

export default async function VendedoresPage() {
  const pb = await createServerClient();

  const [usersResult, leadsResult] = await Promise.all([
    pb.collection("users").getList(1, 500, { sort: "id" }),
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
  ]);

  const users = usersResult.items as unknown as PbUser[];
  const leads = leadsResult.items as unknown as PbLead[];

  const vendedores = (users ?? []).filter(
    (u) => u.role === "asesor" && u.id !== "9fbp0m2d248g8ma" // excluye asesor.demo
  );

  return (
    <VendedoresBoard
      vendedores={vendedores}
      leads={leads ?? []}
    />
  );
}
