"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/pocketbase-client";
import { PushNotifier } from "@/components/crm/PushNotifier";

const TABS = [
  { href: "/crm", label: "Dashboard", icon: "📊" },
  { href: "/crm/pipeline", label: "Pipeline", icon: "🗂️" },
  { href: "/crm/conversaciones", label: "Conversaciones", icon: "💬" },
  { href: "/crm/financieras", label: "Financieras", icon: "🏦" },
  { href: "/crm/comisiones", label: "Comisiones", icon: "💰" },
  { href: "/crm/renovaciones", label: "Renovaciones", icon: "🔔" },
  { href: "/crm/calendario", label: "Calendario", icon: "📅" },
  { href: "/crm/vendedores", label: "Vendedores", icon: "👥" },
];

export function CrmNav({ fullName, role, leadsNuevosHoy, conversacionesParaAsesor }: { fullName: string; role: string; leadsNuevosHoy?: number; conversacionesParaAsesor?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Badge numérico en el ícono de la app (PWA) con el conteo de leads nuevos.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const n = typeof leadsNuevosHoy === "number" ? leadsNuevosHoy : 0;
    try {
      if ("setAppBadge" in navigator) {
        const anyNav = navigator as unknown as {
          setAppBadge?: (n?: number) => Promise<void>;
          clearAppBadge?: () => Promise<void>;
        };
        if (n > 0) void anyNav.setAppBadge?.(n);
        else void anyNav.clearAppBadge?.();
      }
    } catch {
      /* badge no soportado (iOS) — se ignora */
    }
  }, [leadsNuevosHoy]);

  async function handleLogout() {
    const pb = createClient();
    pb.authStore.clear();
    router.push("/crm/login");
    router.refresh();
  }

  // Un tab está activo si la ruta coincide con su href (o el dashboard en /crm exacto)
  const activeTab = TABS.find((t) =>
    t.href === "/crm" ? pathname === "/crm" : pathname === t.href || pathname.startsWith(t.href + "/")
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col px-4 sm:px-6">
        <div className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Menú"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
            <Link href="/crm" className="font-bold text-blue-900">
              CRM · Créditos a tu medida
            </Link>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <PushNotifier />
            <span className="hidden text-slate-600 sm:inline">
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

        {/* Tabs - desktop */}
        <nav className="-mb-px hidden gap-1 md:flex">
          {TABS.map((tab) => {
            const active = activeTab?.href === tab.href;
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

        {/* Tabs - mobile dropdown */}
        {menuOpen && (
          <nav className="mb-2 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg md:hidden">
            {TABS.map((tab) => {
              const active = activeTab?.href === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                    active ? "bg-blue-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </Link>
              );
            })}
            <div className="mt-1 border-t border-slate-100 pt-2 sm:hidden">
              <span className="px-3 text-xs text-slate-400">
                {fullName} · <span className="uppercase">{role}</span>
              </span>
            </div>
          </nav>
        )}

        {/* Aviso de conversaciones que necesitan asesor */}
        {typeof conversacionesParaAsesor === "number" && conversacionesParaAsesor > 0 && (
          <Link
            href="/crm/conversaciones"
            onClick={() => setMenuOpen(false)}
            className="mb-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 transition-colors hover:bg-amber-100"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
            </span>
            <span className="font-semibold">
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white">
                {conversacionesParaAsesor}
              </span>{" "}
              {conversacionesParaAsesor === 1
                ? "conversación lista y espera a un asesor"
                : "conversaciones listas y esperan a un asesor"}
            </span>
            <span className="ml-auto text-xs text-amber-600">Atender →</span>
          </Link>
        )}

        {/* Aviso de leads nuevos */}
        {typeof leadsNuevosHoy === "number" && leadsNuevosHoy > 0 && (
          <Link
            href="/crm/pipeline"
            onClick={() => setMenuOpen(false)}
            className="mb-2 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 transition-colors hover:bg-red-100"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <span className="font-semibold">
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white">
                {leadsNuevosHoy}
              </span>{" "}
              {leadsNuevosHoy === 1 ? "lead nuevo" : "leads nuevos"}
            </span>
            <span className="ml-auto text-xs text-red-600">Ver pipeline →</span>
          </Link>
        )}
      </div>
    </header>
  );
}
