import { createServerClient } from "@/lib/pocketbase-server";
import { Pipeline } from "@/components/crm/Pipeline";
import type { PbLead } from "@/lib/types";

export default async function CrmDashboard() {
  const pb = await createServerClient();
  const result = await pb.collection("leads").getList(1, 500, {
    sort: "-id",
  });
  const leads = result.items as unknown as PbLead[];

  return (
    <div>
      <Pipeline leads={leads ?? []} />
    </div>
  );
}
