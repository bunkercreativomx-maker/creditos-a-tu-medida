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

  const fullName = (user as { full_name?: string }).full_name
    ?? (user as { name?: string }).name
    ?? user.email
    ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <CrmNav fullName={fullName} role={user.role ?? "asesor"} />
      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
