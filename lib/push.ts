import webpush from "web-push";

/**
 * Configuración de Web Push (VAPID).
 * - NEXT_PUBLIC_VAPID_PUBLIC_KEY: pública, se expone al navegador (para suscribirse).
 * - VAPID_PRIVATE_KEY: secreta, solo en el servidor (para firmar envíos).
 * - VAPID_SUBJECT: mailto o https de contacto (requerido por los push services).
 */
export const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??
  "BGmxd6cI5SFI_VNC-KfXeiejqkpp4YW28BuDUEA5t7Yi9LuYhEz48V8Tzl3Yvj9F7CouGnJJNyLNlUlZ_JUAEf0";

const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "XZ2rDjSBvZFITzBwCQUyPHLZkNkqnaTRvrxiCIiVw8E";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@creditos.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/** Envía una notificación push a una suscripción. Devuelve true si fue exitoso. */
export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 60 });
    return true;
  } catch (err) {
    // 404/410 = suscripción expirada/eliminada; el llamador decide si la limpia.
    const status = (err as { statusCode?: number })?.statusCode;
    if (status === 404 || status === 410) return false;
    console.error("Error enviando push:", (err as Error)?.message ?? err);
    return false;
  }
}

/**
 * Notifica a todos los dispositivos registrados que llegó un lead nuevo.
 * Se llama desde el servidor (formulario web y CRM) al crear un lead.
 * Fire-and-forget: nunca lanza errores que rompan el flujo principal.
 */
export async function notifyNewLead(lead: { nombre?: string | null; apellido?: string | null; monto_aproximado?: string | null }) {
  try {
    const { createAdminClient } = await import("@/lib/pocketbase-admin");
    const pb = await createAdminClient();
    const subs = await pb.collection("push_subscriptions").getFullList();
    if (subs.length === 0) return;

    const nombre = [lead.nombre, lead.apellido].filter(Boolean).join(" ") || "Nuevo lead";
    const monto = lead.monto_aproximado ? ` · ${lead.monto_aproximado}` : "";
    const title = "📩 Nuevo lead";
    const body = `${nombre}${monto}`;

    const dead: string[] = [];
    for (const s of subs) {
      const ok = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title, body, url: "/crm" }
      );
      if (!ok) dead.push(s.id);
    }
    for (const id of dead) {
      await pb.collection("push_subscriptions").delete(id).catch(() => {});
    }
  } catch (err) {
    console.error("notifyNewLead:", err);
  }
}
