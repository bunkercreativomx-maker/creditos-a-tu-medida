"use client";

import { WHATSAPP_LINK } from "@/lib/site-content";
import { WhatsAppIcon } from "./WhatsAppIcon";

/** Botón flotante de WhatsApp, fijo abajo a la derecha en toda la página. */
export function FloatingWhatsApp() {
  return (
    <a
      href={WHATSAPP_LINK}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_-4px_rgba(37,211,102,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#1ebe5b] hover:shadow-[0_12px_40px_-4px_rgba(37,211,102,0.75)]"
    >
      <span className="relative flex h-6 w-6 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40 opacity-75" />
        <WhatsAppIcon className="relative h-6 w-6" />
      </span>
      <span className="hidden sm:inline">¿Hablamos?</span>
    </a>
  );
}
