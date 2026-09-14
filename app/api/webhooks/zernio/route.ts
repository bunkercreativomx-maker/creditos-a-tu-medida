import { NextRequest, NextResponse, after } from "next/server";
import {
  verifyZernioSignature,
  sendWhatsAppMessage,
  type ZernioInboundEvent,
} from "@/lib/zernio";
import { runBotTurn } from "@/lib/bot";
import { createAdminClient } from "@/lib/pocketbase-admin";
import { notifyNewLeadToSlack } from "@/lib/slack-notify";
import { notifyNewLead, notifyNeedsAdvisor } from "@/lib/push";
import { transcribirAudioUrl } from "@/lib/transcribe";
import { procesarEntrante, type EntrantePb } from "@/lib/webhook-entrante";

// El trabajo pesado (STT + LLM + envío) corre DESPUÉS de responder a Zernio (after()).
export const maxDuration = 60;

// Allowlist: SOLO procesa mensajes de la cuenta WhatsApp de Créditos.
const CREDITOS_ACCOUNT_ID =
  process.env.ZERNIO_CREDITOS_ACCOUNT_ID ?? "6a97367b77555aae01b11e1a";

// GET devuelve marcador de versión desplegada (útil para verificar deploys).
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "zernio-webhook",
    sha: (process.env.VERCEL_GIT_COMMIT_SHA ?? "?").slice(0, 7),
  });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("X-Zernio-Signature");

  if (!verifyZernioSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let event: ZernioInboundEvent;
  try {
    event = JSON.parse(rawBody) as ZernioInboundEvent;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Toda la decisión (dedupe, allowlist, traza de descartes, upserts y turno)
  // vive en lib/webhook-entrante.ts para poder probarla con adaptadores mock.
  const pb = await createAdminClient();
  const resultado = await procesarEntrante(event, {
    pb: pb as unknown as EntrantePb,
    send: sendWhatsAppMessage,
    runBotTurn,
    transcribirAudio: transcribirAudioUrl,
    notifyNeedsAdvisor,
    notifyNewLead,
    notifyNewLeadToSlack,
    after,
    accountIdEsperado: CREDITOS_ACCOUNT_ID,
  });

  return NextResponse.json(resultado);
}
