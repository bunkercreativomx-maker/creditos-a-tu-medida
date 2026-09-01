import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { sendPush } from "@/lib/push";

/**
 * POST /api/push/send
 * Envía una notificación push a todos los dispositivos registrados.
 * Body: { title, body, url? }
 * Protegido por un token secreto (PUSH_SEND_TOKEN) para que no lo llame cualquiera.
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-push-token");
  const expected = process.env.PUSH_SEND_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: { title?: string; body?: string; url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const title = body.title ?? "Nuevo lead";
  const text = body.body ?? "Tienes un nuevo lead en el CRM";
  const url = body.url ?? "/crm";

  try {
    const pb = await createAdminClient();
    const subs = await pb.collection("push_subscriptions").getFullList();
    let sent = 0;
    const dead: string[] = [];
    for (const s of subs) {
      const ok = await sendPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        { title, body: text, url }
      );
      if (ok) sent++;
      else dead.push(s.id);
    }
    // Limpiar suscripciones expiradas (404/410)
    if (dead.length > 0) {
      for (const id of dead) {
        await pb.collection("push_subscriptions").delete(id).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, sent, total: subs.length });
  } catch (err) {
    console.error("Error enviando push:", err);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
