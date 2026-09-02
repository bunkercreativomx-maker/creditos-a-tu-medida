import { Suspense } from "react";
import { createServerClient } from "@/lib/pocketbase-server";
import { ConversationsInbox } from "@/components/crm/ConversationsInbox";
import type { PbConversation, PbMessage, PbLead, MensajeRemitente } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Una conversación con el lead expandido (nombre del cliente). */
type ConversationWithLead = PbConversation & {
  expand?: { lead?: PbLead };
};

type MsgForClient = {
  id: string;
  conversation: string;
  remitente: MensajeRemitente;
  contenido: string;
  created: string;
};

export default async function ConversationsPage() {
  const pb = await createServerClient();

  // Trae todas las conversaciones de WhatsApp con su lead (para mostrar el nombre y el tel).
  let convos: ConversationWithLead[] = [];
  try {
    const res = await pb
      .collection("conversations")
      .getList(1, 200, { sort: "-updated", expand: "lead" });
    convos = (res.items ?? []) as unknown as ConversationWithLead[];
  } catch {
    convos = [];
  }

  // Trae los mensajes de todas las conversaciones de una vez (hasta 500).
  let msgs: MsgForClient[] = [];
  if (convos.length > 0) {
    try {
      const res = await pb.collection("messages").getList(1, 500, { sort: "id" });
      msgs = (res.items ?? []) as unknown as MsgForClient[];
    } catch {
      msgs = [];
    }
  }

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Cargando conversaciones...</div>}>
      <ConversationsInbox
        conversations={convos}
        messages={msgs}
      />
    </Suspense>
  );
}