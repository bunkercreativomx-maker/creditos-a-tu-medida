"use client";

import { useState } from "react";
import { WHATSAPP_LINK } from "@/lib/site-content";
import { WhatsAppIcon } from "./WhatsAppIcon";

type Estado = "idle" | "enviando" | "ok" | "error";

export function RapidFunnel() {
  const [nombre, setNombre] = useState("");
  const [nss, setNss] = useState("");
  const [telefono, setTelefono] = useState("");
  const [estado, setEstado] = useState<Estado>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (telefono.replace(/\D/g, "").length < 10) {
      setErrorMsg("Escribe un teléfono válido (10 dígitos).");
      setEstado("error");
      return;
    }
    if (nss.replace(/\D/g, "").length < 11) {
      setErrorMsg("El NSS debe tener 11 dígitos.");
      setEstado("error");
      return;
    }
    setEstado("enviando");
    setErrorMsg("");

    const fd = new FormData();
    fd.append("nombre", nombre.trim());
    fd.append("nss", nss.trim());
    fd.append("telefono", telefono.trim());
    fd.append("origen", "web_form");

    try {
      const res = await fetch("/api/leads", { method: "POST", body: fd });
      if (res.ok) {
        setEstado("ok");
      } else {
        const data = await res.json().catch(() => null);
        setErrorMsg(data?.error ?? "No se pudo enviar. Intenta de nuevo.");
        setEstado("error");
      }
    } catch {
      setErrorMsg("Hubo un problema de conexión. Intenta de nuevo.");
      setEstado("error");
    }
  }

  const inputCls =
    "w-full rounded-xl border border-navy-900/12 bg-cream-50 px-4 py-3 text-base text-navy-900 placeholder:text-ink-400 outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30";

  return (
    <section className="relative overflow-hidden py-20 text-cream-50 sm:py-24">
      {/* Fondo de foto real con punch */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/fotos/funnel-bg.webp)" }}
      />
      {/* Velo oscuro para legibilidad (más fuerte a la izquierda donde va el texto) */}
      <div className="absolute inset-0 bg-gradient-to-r from-navy-950 via-navy-950/85 to-navy-950/40" />
      <div className="absolute inset-0 bg-navy-950/30" />

      {/* Resplandores animados dorados y verdes para dar punch */}
      <div className="pointer-events-none absolute -left-20 top-1/3 h-72 w-72 rounded-full bg-gold-500/25 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute right-0 top-1/2 h-80 w-80 rounded-full bg-[#25D366]/20 blur-3xl animate-pulse [animation-delay:0.8s]" />

      {/* Textura de cuadrícula sutil */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
        {/* Hook de impulso */}
        <div className="flex flex-col items-start gap-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_25px_-4px_rgba(37,211,102,0.9)]">
            <span className="inline-block h-2 w-2 animate-ping rounded-full bg-white" />
            ⚡ Acción rápida · 60 segundos
          </span>
          <h2 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            ¿Necesitas tu crédito{" "}
            <span className="italic text-gold-300 drop-shadow-[0_0_18px_rgba(212,175,55,0.7)]">
              HOY?
            </span>
          </h2>
          <ul className="space-y-3 text-lg text-cream-50/90">
            <li className="flex items-start gap-3">
              <span className="mt-1 text-gold-300">✓</span>
              Aprobado y depositado el mismo día si solicitas antes de las 3:00 pm.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 text-gold-300">✓</span>
              Sin aval, sin historial perfecto y sin comisiones ocultas.
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 text-gold-300">✓</span>
              Asesoría personalizada de principio a fin.
            </li>
          </ul>
          <p className="text-sm text-cream-50/70">
            Déjanos tu información y un asesor te contacta de inmediato para revisar tu caso.
          </p>
        </div>

        {/* Formulario exprés */}
        <div className="rounded-3xl bg-white p-7 text-navy-900 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] sm:p-9">
          {estado === "ok" ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]/15 text-3xl text-[#25D366]">
                ✓
              </span>
              <h3 className="font-display text-2xl font-semibold">¡Solicitud recibida!</h3>
              <p className="max-w-sm text-ink-600">
                Un asesor te contactará muy pronto para darle seguimiento a tu crédito.
              </p>
              <a
                href={WHATSAPP_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-6 py-3 font-semibold text-white transition hover:bg-[#1ebe5b]"
              >
                <WhatsAppIcon className="h-5 w-5" />
                O escríbenos por WhatsApp
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="font-display text-2xl font-semibold">Solicita tu crédito ahora</h3>
              <p className="text-sm text-ink-500">
                Solo 3 campos · Entra directo con un asesor.
              </p>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-navy-900">Nombre</label>
                <input
                  className={inputCls}
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Tu nombre completo"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-navy-900">
                  NSS (Número de Seguro Social)
                </label>
                <input
                  className={inputCls}
                  value={nss}
                  onChange={(e) => setNss(e.target.value.replace(/\D/g, "").slice(0, 11))}
                  placeholder="11 dígitos"
                  inputMode="numeric"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-navy-900">Teléfono</label>
                <input
                  className={inputCls}
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="10 dígitos"
                  inputMode="tel"
                  required
                />
              </div>

              {estado === "error" && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={estado === "enviando"}
                className="w-full rounded-full bg-[#25D366] py-3.5 text-base font-semibold text-white shadow-[0_10px_30px_-6px_rgba(37,211,102,0.7)] transition hover:bg-[#1ebe5b] disabled:opacity-60"
              >
                {estado === "enviando" ? "Enviando..." : "Solicitar mi crédito →"}
              </button>

              <p className="text-center text-xs text-ink-400">
                Al enviar aceptas que un asesor te contacte. Sin spam, sin compromiso.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
