// Integración del nuevo motor (lib/creditos-bot) con el webhook real.
//
// Ruta de datos:
//   mensaje de Zernio -> webhook-entrante persiste el mensaje del cliente
//     -> runNewEngineTurn (aquí)
//        -> processIncomingTurn (bot_activo -> último msg -> OpenAI -> motor)
//        -> PocketBaseLeadRepository / PocketBaseAppointmentRepository (pb-creditos)
//     -> enviar result.messages por Zernio, en orden
//     -> persistir cada respuesta del bot en `messages`
//     -> si result.escalate: conversations.necesita_asesor=true + notificar asesor
//
// La DB es SIEMPRE la instancia pb-creditos: los repos reciben el cliente PB
// `createAdminClient()` del proyecto (lib/pocketbase-admin.ts), que apunta a
// https://creditos-pb.bunkeragent.cloud en producción / 127.0.0.1:8092 en dev.

import { createAdminClient } from "@/lib/pocketbase-admin";
import { sendWhatsAppMessage } from "@/lib/zernio";
import { notifyNeedsAdvisor } from "@/lib/push";
import { processIncomingTurn } from "@/lib/creditos-bot/turno";
import {
  PocketBaseAppointmentRepository,
  PocketBaseLeadRepository,
} from "@/lib/creditos-bot/pocketbase";

/**
 * Ejecuta un turno del nuevo motor para un mensaje ya persistido.
 * Devuelve true si el motor está activo y manejó el turno (aunque sea escalando),
 * false si no hay OPENAI_API_KEY (-> el llamador usa el flujo viejo).
 */
export async function runNewEngineTurn(args: {
  leadId: string;
  conversationId: string;
  conversationZernioId: string;
  accountId: string;
  messageId: string;
  text: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    return false; // sin key: no competir con el flujo actual
  }

  const pb = await createAdminClient();
  const leads = new PocketBaseLeadRepository(pb);
  const appointments = new PocketBaseAppointmentRepository(pb);

  const result = await processIncomingTurn(
    { leadId: args.leadId, messageId: args.messageId, text: args.text, history: args.history },
    { leads, appointments },
  );

  if (result.ignored) return true; // bot_inactive / obsolete_message: nada que enviar

  // Enviar por Zernio, en orden, y persistir cada respuesta del bot.
  for (const content of result.messages) {
    const conversation = await pb.collection("conversations").getOne(args.conversationId);
    if (conversation.bot_activo === false ||
        !(await leads.isLatestInboundMessage(args.leadId, args.messageId))) return true;
    await sendWhatsAppMessage(args.conversationZernioId, args.accountId, content);
    await pb.collection("messages").create({
      conversation: args.conversationId,
      remitente: "bot",
      contenido: content,
      created: new Date().toISOString(),
    }).catch(() => {});
  }

  if (result.escalate || result.appointed) {
    await pb.collection("conversations")
      .update(args.conversationId, { necesita_asesor: true })
      .catch(() => {});
    await notifyNeedsAdvisor(args.leadId).catch(() => {});
  }

  return true;
}

export { processIncomingTurn, PocketBaseAppointmentRepository, PocketBaseLeadRepository };
