"use client";

import { useEffect } from "react";
import { slugCodigo } from "@/lib/fuente";
import { WHATSAPP_NUMBER } from "@/lib/site-content";

// Agrega a TODOS los enlaces de WhatsApp del sitio un mensaje prellenado con
// "(Ref: CODIGO)" para que el CRM registre de dónde vino el lead:
//   FB-<campaña>  → visita desde anuncio de Facebook/Instagram (fbclid o utm_source fb/ig/meta)
//   GG-<campaña>  → Google (gclid o utm_source google)
//   CAMP-<campaña>→ cualquier otra campaña con UTM
//   WEB           → visita directa al sitio
// Primer contacto gana y dura 30 días (localStorage).

const KEY = "catm_fuente";
const TTL = 30 * 24 * 3600 * 1000;

function detectar(): string | null {
  const q = new URLSearchParams(window.location.search);
  const src = (q.get("utm_source") || "").toLowerCase();
  const camp = slugCodigo(q.get("utm_campaign") || "", 20);
  const suf = camp ? `-${camp}` : "";
  if (q.get("fbclid") || /^(fb|facebook|ig|instagram|meta)$/.test(src)) return `FB${suf}`;
  if (q.get("gclid") || src === "google") return `GG${suf}`;
  if (q.get("ttclid") || src === "tiktok") return `TT${suf}`;
  if (src) return `CAMP-${slugCodigo(src, 12)}${suf}`;
  return null;
}

function fuenteActual(): string {
  try {
    const nueva = detectar();
    const raw = localStorage.getItem(KEY);
    const guardada = raw ? (JSON.parse(raw) as { c: string; t: number }) : null;
    const vigente = guardada && Date.now() - guardada.t < TTL ? guardada.c : null;
    // Un anuncio nuevo reemplaza un "WEB" o una fuente vencida.
    if (nueva && (!vigente || vigente === "WEB")) {
      localStorage.setItem(KEY, JSON.stringify({ c: nueva, t: Date.now() }));
      return nueva;
    }
    return vigente || nueva || "WEB";
  } catch {
    return detectar() || "WEB";
  }
}

export function mensajeWhatsApp(codigo: string): string {
  return `Hola, quiero información sobre un crédito. (Ref: ${codigo})`;
}

export function WhatsAppAttribution() {
  useEffect(() => {
    const negocio = WHATSAPP_NUMBER.replace(/\D/g, "");
    const codigo = fuenteActual();
    const texto = mensajeWhatsApp(codigo);
    const reescribir = (a: HTMLAnchorElement) => {
      try {
        // El CRM comparte el layout raíz (y la navegación es SPA): ahí los
        // enlaces wa.me apuntan al CLIENTE y NO llevan el mensaje del sitio.
        if (window.location.pathname.startsWith("/crm")) return;
        const u = new URL(a.href);
        if (!/(^|\.)wa\.me$|api\.whatsapp\.com$/.test(u.hostname)) return;
        // Solo el número del negocio (wa.me/<num> o api.whatsapp.com/send?phone=<num>).
        const num = (u.searchParams.get("phone") || u.pathname).replace(/\D/g, "");
        if (num !== negocio) return;
        if (u.searchParams.get("text")) return; // respeta mensajes ya definidos
        u.searchParams.set("text", texto);
        a.href = u.toString();
      } catch {
        /* href inválido: ignorar */
      }
    };
    const todos = () =>
      document.querySelectorAll<HTMLAnchorElement>('a[href*="wa.me"],a[href*="api.whatsapp.com"]').forEach(reescribir);
    todos();
    // Enlaces que aparecen después (menús, pasos del funnel) y red de seguridad al hacer clic.
    const obs = new MutationObserver(todos);
    obs.observe(document.body, { childList: true, subtree: true });
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a");
      if (a) reescribir(a as HTMLAnchorElement);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      obs.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
