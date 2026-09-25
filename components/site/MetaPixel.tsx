"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Meta Pixel (solo sitio público, nunca /crm).
 * Se activa únicamente si existe NEXT_PUBLIC_META_PIXEL_ID en Vercel.
 * Eventos:
 *  - PageView: cada visita / cambio de ruta
 *  - Lead: formulario enviado con éxito (lo dispara trackLead desde los formularios)
 *  - Contact: clic en cualquier enlace de WhatsApp o teléfono
 * No se envía ningún dato personal por el navegador (política financiera de Meta);
 * la coincidencia de usuario va por Conversions API desde el servidor, con hash.
 */
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

type Fbq = (...args: unknown[]) => void;
function fbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const f = (window as unknown as { fbq?: Fbq }).fbq;
  return typeof f === "function" ? f : null;
}

/** Dispara Lead en el navegador con el mismo event_id que usa la CAPI (deduplicación). */
export function trackLead(eventId?: string) {
  fbq()?.("track", "Lead", { content_name: "solicitud_credito" }, eventId ? { eventID: eventId } : undefined);
}

export function MetaPixel() {
  const pathname = usePathname();
  const enCrm = pathname?.startsWith("/crm") || pathname?.startsWith("/login");

  useEffect(() => {
    if (!META_PIXEL_ID || enCrm) return;
    fbq()?.("track", "PageView");
  }, [pathname, enCrm]);

  useEffect(() => {
    if (!META_PIXEL_ID || enCrm) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest("a");
      const href = a?.getAttribute("href") ?? "";
      if (href.includes("wa.me") || href.includes("api.whatsapp.com") || href.startsWith("tel:")) {
        fbq()?.("track", "Contact", { content_name: href.startsWith("tel:") ? "llamada" : "whatsapp" });
      }
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [enCrm]);

  if (!META_PIXEL_ID || enCrm) return null;
  return (
    <>
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${META_PIXEL_ID}');`}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img height="1" width="1" style={{ display: "none" }} alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`} />
      </noscript>
    </>
  );
}
