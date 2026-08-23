"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/pocketbase-client";

const TABS = [
  { href: "/crm", label: "Pipeline", icon: "📊" },
  { href: "/crm/financieras", label: "Financieras", icon: "🏦" },
  { href: "/crm/renovaciones", label: "Renovaciones", icon: "🔔" },
  { href: "/crm/calendario", label: "Calendario", icon: "📅" },
  { href: "/crm/vendedores", label: "Vendedores", icon: "👥" },
];

export function CrmNav({ fullName, role }: { fullName: string; role: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    const pb = createClient();
    pb.authStore.clear();
    router.push("/crm/login");
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6">
        <div className="flex items-center justify-between py-3">
          <Link href="/crm" className="font-bold text-blue-900">
            CRM · Créditos a tu medida
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-slate-600">
              {fullName} · <span className="uppercase text-slate-400">{role}</span>
            </span>
            {role === "admin" && (
              <Link href="/crm/admin/usuarios" className="font-medium text-slate-500 hover:text-blue-900">
                Usuarios
              </Link>
            )}
            <button onClick={handleLogout} className="font-medium text-red-600 hover:underline">
              Salir
            </button>
          </div>
        </div>
        {/* Tabs */}
        <nav className="-mb-px flex gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-900 bg-blue-50/60 text-blue-900"
                    : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
