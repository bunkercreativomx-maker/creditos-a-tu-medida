import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/pocketbase-admin";

/**
 * POST /api/push/subscribe
 * Registra la suscripción push de un dispositivo del asesor.
 * Body: { endpoint, keys: { p256dh, auth }, device? }
 */
export async function POST(req: NextRequest) {
  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string }; device?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const endpoint = body.endpoint;
  const p256dh = body.keys?.p256dh;
  const auth = body.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Faltan endpoint/keys" }, { status: 400 });
  }

  try {
    const pb = await createAdminClient();
    // Evitar duplicados por endpoint
    const existing = await pb
      .collection("push_subscriptions")
      .getFullList({ filter: `endpoint = "${endpoint}"` });
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
