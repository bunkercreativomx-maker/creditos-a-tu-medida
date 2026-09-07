import crypto from "crypto";
import { redis } from "../lib/redis.js";
import { colaMensajes } from "../lib/queue.js";

// ── GET: verificación inicial que hace Meta al guardar la URL ──
export function verificarWebhook(req, res) {
  const modo = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (modo === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge); // texto plano, sin JSON
  }
  return res.sendStatus(403);
}

// ── Validación de firma: evita que cualquiera te inyecte mensajes ──
function firmaValida(req) {
  const firma = req.get("x-hub-signature-256");
  if (!firma || !process.env.WA_APP_SECRET) return false;
  const esperado =
    "sha256=" +
    crypto
      .createHmac("sha256", process.env.WA_APP_SECRET)
      .update(req.rawBody) // requiere express.json({ verify: guardarRawBody })
      .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado));
}

// ── POST: mensajes entrantes ──
export async function recibirWebhook(req, res) {
  if (!firmaValida(req)) return res.sendStatus(401);

  // Responder 200 ANTES de procesar. Si tardas, Meta reintenta y duplica.
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];
    if (!msg) return; // los acuses de entrega también llegan por aquí

    // Dedupe: Meta reintenta aunque respondas rápido
    const esNuevo = await redis.set(`wa:msg:${msg.id}`, "1", "EX", 86400, "NX");
    if (!esNuevo) return;

    await colaMensajes.add("procesar", {
      phoneNumberId: value.metadata.phone_number_id, // → identifica al tenant
      waMessageId: msg.id,
      from: msg.from,
      tipo: msg.type,
      texto: msg.text?.body ?? null,
      nombrePerfil: value.contacts?.[0]?.profile?.name ?? null,
    });
  } catch (e) {
    console.error("[webhook] error encolando:", e);
  }
}

// Middleware para guardar el body crudo (necesario para la firma)
export const guardarRawBody = (req, _res, buf) => {
  req.rawBody = buf;
};

