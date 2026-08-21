import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/pocketbase-server";
import { UserRoleSelect } from "@/components/crm/UserRoleSelect";
import type { PbUser } from "@/lib/types";

export default async function UsuariosPage() {
  const pb = await createServerClient();
  const user = pb.authStore.model as { id: string; role?: string } | null;
  if (!user) redirect("/crm/login");

  if (user.role !== "admin") {
    redirect("/crm");
  }

  const result = await pb.collection("users").getList(1, 500, {
    sort: "created",
  });
  const profiles = result.items as unknown as PbUser[];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold text-blue-900">Usuarios</h1>
      <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm">
        {(profiles ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">
                {p.full_name ?? p.name ?? "Sin nombre"}
              </p>
              <p className="text-xs text-slate-400">{p.email}</p>
            </div>
            <UserRoleSelect profileId={p.id} role={p.role ?? "asesor"} />
          </div>
        ))}
      </div>
    </div>
  );
}
