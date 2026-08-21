import { createServerClient } from "@/lib/pocketbase-server";
import { Calendario } from "@/components/crm/Calendario";
import type { PbCita, PbLead } from "@/lib/types";

export default async function CalendarioPage() {
  const pb = await createServerClient();

  const [citasResult, leadsResult] = await Promise.all([
    pb.collection("citas").getList(1, 500, { sort: "fecha" }),
    pb.collection("leads").getList(1, 500, { sort: "-id" }),
  ]);

  const citas = citasResult.items as unknown as PbCita[];
  const leads = leadsResult.items as unknown as PbLead[];

  return (
    <Calendario
      citas={citas ?? []}
      leads={leads ?? []}
    />
  );
}
