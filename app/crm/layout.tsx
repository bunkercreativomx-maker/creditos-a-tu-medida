import { createServerClient } from "@/lib/pocketbase-server";
import { CrmNav } from "@/components/crm/CrmNav";

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const pb = await createServerClient();
  const user = pb.authStore.model as
    | { id: string; email?: string; role?: string; full_name?: string; name?: string }
    | null;

  if (!user) {
    return <>{children}</>;
  }

  // Leads nuevos de hoy (para el aviso de notificación)
  let leadsNuevosHoy = 0;
  try {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const desde = inicioHoy.toISOString();
    const res = await pb
      .collection("leads")
      .getList(1, 1, { filter: `created >= "${desde}"` });
    leadsNuevosHoy = res.totalItems;
  } catch {
    leadsNuevosHoy = 0;
  }

  const fullName = (user as { full_name?: string }).full_name
    ?? (user as { name?: string }).name
    ?? user.email
    ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <CrmNav fullName={fullName} role={user.role ?? "asesor"} leadsNuevosHoy={leadsNuevosHoy} />
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
