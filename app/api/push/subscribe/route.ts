import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { createServerClient, getServerUser } from "@/lib/pocketbase-server";
import { isAllowedPushEndpoint, isPushKey, isSameOrigin } from "@/lib/push-security";
import { readLimitedText, RequestTooLarge } from "@/lib/request-security";

/**
 * POST /api/push/subscribe
 * Registra la suscripción push de un dispositivo del asesor.
 * Body: { endpoint, keys: { p256dh, auth }, device? }
 */
export async function POST(req: NextRequest) {
  const session = await createServerClient();
  const user = await getServerUser(session);
  if (!user || (user.role !== "admin" && user.role !== "asesor")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isSameOrigin(req.headers.get("origin"), req.url)) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403 });
  }
  if (Number(req.headers.get("content-length")) > 8192) {
    return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
  }
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; device?: string };
  try {
    const raw = await readLimitedText(req, 8192);
    body = JSON.parse(raw);
    if (!body || typeof body !== "object") throw new Error("Invalid body");
  } catch (error) {
    if (error instanceof RequestTooLarge) return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413 });
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!isAllowedPushEndpoint(endpoint) || !isPushKey(p256dh, 65) || !isPushKey(auth, 16) ||
      (body.device !== undefined && (typeof body.device !== "string" || body.device.length > 512))) {
    return NextResponse.json({ error: "Suscripción inválida" }, { status: 400 });
  }

  try {
    const pb = await createAdminClient();
    // Evitar duplicados por endpoint
    const existing = await pb
      .collection("push_subscriptions")
      .getFullList({ filter: pb.filter("endpoint = {:endpoint}", { endpoint }) });
    if (existing.length > 0) {
      await pb.collection("push_subscriptions").update(existing[0].id, {
        p256dh,
        auth,
        device: body.device ?? existing[0].device ?? null,
      });
    } else {
      await pb.collection("push_subscriptions").create({
        endpoint,
        p256dh,
        auth,
        device: body.device ?? null,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error guardando suscripción push:", err);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
