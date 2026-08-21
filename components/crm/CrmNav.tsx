"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/pocketbase-client";

export function CrmNav({ fullName, role }: { fullName: string; role: string }) {
  const router = useRouter();

  async function handleLogout() {
    const pb = createClient();
    pb.authStore.clear();
    router.push("/crm/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/crm" className="font-bold text-blue-900">
            CRM · Créditos a tu medida
          </Link>
          <nav className="hidden gap-4 text-sm font-medium text-slate-600 sm:flex">
            <Link href="/crm" className="hover:text-blue-900">
              Leads
            </Link>
            {role === "admin" && (
              <Link href="/crm/admin/usuarios" className="hover:text-blue-900">
                Usuarios
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-600">
            {fullName} · <span className="uppercase text-slate-400">{role}</span>
          </span>
          <button onClick={handleLogout} className="font-medium text-red-600 hover:underline">
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
