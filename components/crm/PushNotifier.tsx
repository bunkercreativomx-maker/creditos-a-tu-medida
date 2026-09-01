"use client";

import { useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push-client";

/**
 * Registra el Service Worker y pide permiso de notificaciones.
 * Se monta en el layout del CRM (solo visible para asesores autenticados).
 * Muestra un botón para activar/desactivar notificaciones en el teléfono.
 */
export function PushNotifier() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (typeof Notification !== "undefined" ? Notification.permission : "unsupported")
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    // Registrar el SW al montar (no pedimos permiso todavía)
    navigator.serviceWorker.register("/sw.js").catch((e) => console.error("SW:", e));
  }, [supported]);

  async function enable() {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""
        ),
      });
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          device: navigator.userAgent,
        }),
      });
    } catch (e) {
      console.error("Push enable:", e);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  if (permission === "granted") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Notificaciones activas
      </span>
    );
  }

  return (
    <button
      onClick={enable}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
    >
      <span aria-hidden>🔔</span>
      {busy ? "Activando…" : "Activar notificaciones"}
    </button>
  );
}
