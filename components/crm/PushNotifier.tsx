"use client";

import { useEffect, useState } from "react";
import { urlBase64ToUint8Array } from "@/lib/push-client";

/**
 * Registra el Service Worker y pide permiso de notificaciones.
 * Se monta en el layout del CRM (solo visible para asesores autenticados).
 * - Si el permiso ya está concedido, se asegura de que la suscripción exista
 *   y esté registrada en PocketBase (recupera registros perdidos por fallos previos).
 */
export function PushNotifier() {
  const [supported] = useState(
    () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => (typeof Notification !== "undefined" ? Notification.permission : "unsupported")
  );
  const [busy, setBusy] = useState(false);

  /** Asegura que exista una suscripción push y la registra en PocketBase. */
  async function ensureRegistered() {
    if (!supported) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "");
      if (applicationServerKey.length !== 65) throw new Error("Falta configurar la clave pública de notificaciones");
      // Reusar la suscripción existente si la hay; si no, crear una.
      let sub = await reg.pushManager.getSubscription();
      const previousKey = sub?.options.applicationServerKey;
      if (sub && (!previousKey || new Uint8Array(previousKey).length !== applicationServerKey.length ||
          new Uint8Array(previousKey).some((byte, index) => byte !== applicationServerKey[index]))) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        });
      }
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
          device: navigator.userAgent,
        }),
      });
      if (!res.ok) console.error("Push subscribe HTTP", res.status);
    } catch (e) {
      console.error("Push ensureRegistered:", e);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.register("/sw.js").then(async () => {
      // Sincronizar después del registro, también tras rotar la clave VAPID.
      if (Notification.permission === "granted") await ensureRegistered();
    }).catch((e) => console.error("SW:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  async function enable() {
    if (!supported) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;
      await ensureRegistered();
    } catch (e) {
      console.error("Push enable:", e);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  if (permission === "granted") {
    return (
      <button
        onClick={ensureRegistered}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-50"
        title="Notificaciones activas. Toca para re-sincronizar este dispositivo."
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {busy ? "Sincronizando…" : "Notificaciones activas"}
      </button>
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
