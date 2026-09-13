import { createServerClient } from "@/lib/pocketbase-server";
import { CrmNav } from "@/components/crm/CrmNav";
import type { Metadata } from "next";

// El CRM es la única parte instalable como PWA (la landing no debe ofrecerlo).
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Créditos",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/icon-192.png",
  },
};

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

  // Conversaciones que el bot ya calificó y esperan la atención de un asesor.
  let conversacionesParaAsesor = 0;
  try {
    const res = await pb
      .collection("conversations")
      .getList(1, 1, { filter: `necesita_asesor = true` });
    conversacionesParaAsesor = res.totalItems;
  } catch {
    conversacionesParaAsesor = 0;
  }

  // Leads del formulario web sin atender (origen web_form, status nuevo).
  // NO crean conversación WhatsApp, así que no caen en conversacionesParaAsesor;
  // se cuentan aparte para que también aparezcan en el aviso "necesita asesor".
  let leadsWebParaAsesor: { id: string; nombre: string; telefono: string }[] = [];
  try {
    const res = await pb
      .collection("leads")
      .getList(1, 50, { filter: `origen = "web_form" && status = "nuevo"` });
    leadsWebParaAsesor = (res.items ?? []).map((l) => ({
      id: String(l.id),
      nombre: String(l.nombre ?? "").trim() || "Sin nombre",
      telefono: String(l.telefono ?? ""),
    }));
  } catch {
    leadsWebParaAsesor = [];
  }
  const conversacionesParaAsesorCount = conversacionesParaAsesor;
  const totalParaAsesor = conversacionesParaAsesorCount + leadsWebParaAsesor.length;

  const fullName = (user as { full_name?: string }).full_name
    ?? (user as { name?: string }).name
    ?? user.email
    ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <CrmNav
        fullName={fullName}
        role={user.role ?? "asesor"}
        leadsNuevosHoy={leadsNuevosHoy}
        conversacionesParaAsesor={totalParaAsesor}
        leadsWebParaAsesor={leadsWebParaAsesor}
      />
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
