import webpush from "web-push";

/**
 * Configuración de Web Push (VAPID).
 * Usamos un par hardcodeado VERIFICADO (las pruebas manuales a producción lo
 * confirman). Las env vars de Vercel pueden estar corruptas/desalineadas y
 * provocar que el serverless firme con un par incorrecto → FCM rechaza el
 * envío en silencio. Fuerzo el par conocido para garantizar la entrega.
 * - VAPID_PUBLIC_KEY: pública, se expone al navegador (para suscribirse).
 * - VAPID_PRIVATE_KEY: secreta, solo en el servidor (para firmar envíos).
 * - VAPID_SUBJECT: mailto o https de contacto (requerido por los push services).
 */
export const VAPID_PUBLIC_KEY =
  "BGmxd6cI5SFI_VNC-KfXeiejqkpp4YW28BuDUEA5t7Yi9LuYhEz48V8Tzl3Yvj9F7CouGnJJNyLNlUlZ_JUAEf0";

const VAPID_PRIVATE_KEY =
  "XZ2rDjSBvZFITzBwCQUyPHLZkNkqnaTRvrxiCIiVw8E";
const VAPID_SUBJECT = "mailto:admin@creditos.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

/** Envía una notificación push a una suscripción. Devuelve true si fue exitoso. */
export async function sendPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: { title: string; body: string; url?: string; badge?: number }
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

    const toStr = (v: unknown) =>
      typeof v === "string"
        ? v
        : v && typeof v === "object"
          ? String((v as { name?: unknown }).name ?? "")
          : v
            ? String(v)
            : "";
    const nombre = [toStr(lead.nombre), toStr(lead.apellido)].filter(Boolean).join(" ") || "Nuevo lead";
    const monto = lead.monto_aproximado ? ` · ${toStr(lead.monto_aproximado)}` : "";
    const title = "📩 Nuevo lead";
    const body = `${nombre}${monto}`;

    // Contar leads en estado "nuevo" para el badge del ícono.
    // NOTA: esta colección no permite sort por `created` (da 400), así que
    // contamos por status sin ordenar. Fire-and-forget: ante cualquier error,
    // badge = 1 (no bloquea el envío).
    let badge = 1;
    try {
      const res = await pb.collection("leads").getList(1, 1, {
        filter: `status = "nuevo"`,
      });
      badge = Math.max(res.totalItems, 1);
    } catch {
      badge = 1;
    }

    const dead: string[] = [];
    for (const s of subs) {
      const ok = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title, body, url: "/crm", badge }
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

/**
 * Notifica a todos los dispositivos registrados que el bot terminó de calificar
 * una conversación y ya necesita la atención de un asesor (se escaló a humano).
 * Fire-and-forget: nunca lanza errores que rompan el flujo principal.
 */
export async function notifyNeedsAdvisor(leadId?: string | null) {
  try {
    const { createAdminClient } = await import("@/lib/pocketbase-admin");
    const pb = await createAdminClient();
    const subs = await pb.collection("push_subscriptions").getFullList();
    if (subs.length === 0) return;

    // Buscar el nombre del lead para personalizar el aviso (best-effort).
    let nombre = "";
    if (leadId) {
      try {
        const lead = await pb.collection("leads").getOne(leadId);
        const ap = lead?.apellido ? ` ${lead.apellido}` : "";
        nombre = lead?.nombre ? `${lead.nombre}${ap}` : "";
      } catch {
        nombre = "";
      }
    }

    const title = "🔔 Conversación lista para asesor";
    const body = nombre
      ? `${nombre} terminó de calificar con el bot y requiere tu atención.`
      : "Un cliente terminó de calificar con el bot y requiere tu atención.";

    // Contar conversaciones que necesitan asesor para el badge del ícono.
    let badge = 1;
    try {
      const res = await pb.collection("conversations").getList(1, 1, {
        filter: `necesita_asesor = true`,
      });
      badge = Math.max(res.totalItems, 1);
    } catch {
      badge = 1;
    }

    const dead: string[] = [];
    for (const s of subs) {
      const ok = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title, body, url: "/crm/conversaciones", badge }
      );
      if (!ok) dead.push(s.id);
    }
    for (const id of dead) {
      await pb.collection("push_subscriptions").delete(id).catch(() => {});
    }
  } catch (err) {
    console.error("notifyNeedsAdvisor:", err);
  }
}
