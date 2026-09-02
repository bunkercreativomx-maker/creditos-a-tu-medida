"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendAdvisorMessage, claimLead } from "@/app/crm/actions";
import type { MensajeRemitente } from "@/lib/types";

type ConversationItem = {
  id: string;
  telefono: string;
  canal: string | null;
  bot_activo: boolean;
  necesita_asesor?: boolean | null;
  updated: string;
  expand?: {
    lead?: {
      id?: string;
      nombre?: string | null;
      apellido?: string | null;
      asignado_a?: string | null;
    } | null;
  };
};

type MessageItem = {
  id: string;
  conversation: string;
  remitente: MensajeRemitente;
  contenido: string;
  created?: string | null;
};

const REMITENTE_LABEL: Record<MensajeRemitente, string> = {
  cliente: "Cliente",
  bot: "🤖 Bot",
  asesor: "👤 Tú",
};

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const ahora = new Date();
  const ayer = new Date();
  ayer.setDate(ahora.getDate() - 1);
  const mismoDia = d.toDateString() === ahora.toDateString();
  const fueAyer = d.toDateString() === ayer.toDateString();
  if (mismoDia) return formatTime(iso);
  if (fueAyer) return "Ayer";
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export function ConversationsInbox({
  conversations,
  messages,
  vendedores = [],
  currentUser = null,
}: {
  conversations: ConversationItem[];
  messages: MessageItem[];
  vendedores?: { id: string; name: string }[];
  currentUser?: { id: string; name: string } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selId = searchParams.get("conversacion");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const nombreAsignado = (id: string | null | undefined) => {
    if (!id) return null;
    const v = vendedores.find((x) => x.id === id);
    return v?.name ?? null;
  };

  const esMio = (c: ConversationItem) =>
    !!c.expand?.lead?.asignado_a && c.expand?.lead?.asignado_a === currentUser?.id;

  async function tomar(leadId: string) {
    if (!leadId) return;
    setClaimingId(leadId);
    try {
      await claimLead(leadId);
      router.refresh();
    } finally {
      setClaimingId(null);
    }
  }

  // Conversaciones con mensajes, ordenadas por la última actividad.
  const sorted = useMemo(() => {
    const byConv = new Map<string, MessageItem[]>();
    for (const m of messages) {
      const arr = byConv.get(m.conversation) ?? [];
      arr.push(m);
      byConv.set(m.conversation, arr);
    }
    const withMsgs = conversations
      .filter((c) => (byConv.get(c.id)?.length ?? 0) > 0)
      .map((c) => ({
        conv: c,
        msgs: (byConv.get(c.id) ?? []).sort((a, b) =>
          (a.created ?? a.id).localeCompare(b.created ?? b.id)
        ),
        last: byConv.get(c.id)?.slice(-1)[0] ?? null,
      }));
    withMsgs.sort((a, b) => {
      // Las que necesitan asesor van primero; luego por última actividad.
      const na = a.conv.necesita_asesor ? 1 : 0;
      const nb = b.conv.necesita_asesor ? 1 : 0;
      if (na !== nb) return nb - na;
      return (b.last?.created ?? "").localeCompare(a.last?.created ?? "");
    });
    return withMsgs;
  }, [conversations, messages]);

  const selected = sorted.find((s) => s.conv.id === selId) ?? sorted[0] ?? null;

  const nombreCliente = (c: ConversationItem) =>
    `${c.expand?.lead?.nombre ?? ""} ${c.expand?.lead?.apellido ?? ""}`.trim() ||
    c.telefono;

  return (
    <div className="flex h-[calc(100dvh-190px)] flex-col gap-4 md:flex-row">
      {/* Lista de conversaciones */}
      <aside className="w-full shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-sm md:w-80">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-800">Conversaciones de WhatsApp</h2>
          <p className="text-xs text-slate-400">{sorted.length} activas</p>
        </div>
        <ul>
          {sorted.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-slate-400">
              Aún no hay conversaciones de WhatsApp.
              <br />
              Cuando un cliente escriba al número, aparecerá aquí.
            </li>
          )}
          {sorted.map(({ conv, last }) => {
            const active = selected?.conv.id === conv.id;
            const rem = last?.remitente === "cliente" ? "" : `${REMITENTE_LABEL[last?.remitente as MensajeRemitente] ?? ""} · `;
            return (
              <li key={conv.id}>
                <button
                  onClick={() => {
                    router.push(`/crm/conversaciones?conversacion=${conv.id}`);
                    router.refresh();
                  }}
                  className={`w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                    active ? "bg-blue-50" : conv.necesita_asesor ? "bg-amber-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-semibold text-slate-800">
                      {nombreCliente(conv)}
                    </span>
                    {conv.necesita_asesor && (
                      <span className="ml-2 shrink-0 animate-pulse rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                        ⚠️ Necesita asesor
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-slate-400">
                      {last ? formatDay(last.created) : ""}
                    </span>
                  </div>
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500">
                      {rem}
                      {last?.contenido ?? ""}
                    </span>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      conv.bot_activo ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}>
                      {conv.bot_activo ? "Bot ON" : "Manual"}
                    </span>
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] text-slate-400">
                      {conv.expand?.lead?.asignado_a ? (
                        <>
                          <span className="inline-block h-4 w-4 rounded-full bg-blue-100 text-center text-[9px] leading-4">
                            👤
                          </span>
                          {esMio(conv) ? "Tú" : nombreAsignado(conv.expand.lead.asignado_a) ?? "Asignado"}
                        </>
                      ) : (
                        <span className="text-slate-300">Sin asignar</span>
                      )}
                    </span>
                    {!conv.expand?.lead?.asignado_a && conv.expand?.lead?.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          tomar(conv.expand!.lead!.id!);
                        }}
                        disabled={claimingId === conv.expand?.lead?.id}
                        className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Tomar
                      </button>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Hilo de la conversación seleccionada */}
      <section className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        {selected ? (
          <Thread
            key={selected.conv.id}
            conversationId={selected.conv.id}
            telefono={selected.conv.telefono}
            botActivo={selected.conv.bot_activo}
            nombre={nombreCliente(selected.conv)}
            msgs={selected.msgs}
            leadId={selected.conv.expand?.lead?.id}
            asignadoA={selected.conv.expand?.lead?.asignado_a}
            esMio={esMio(selected.conv)}
            nombreAsignado={nombreAsignado(selected.conv.expand?.lead?.asignado_a)}
            onTomar={tomar}
            claiming={claimingId === selected.conv.expand?.lead?.id}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Selecciona una conversación para responder
          </div>
        )}
      </section>
    </div>
  );
}

function Thread({
  conversationId,
  telefono,
  botActivo,
  nombre,
  msgs,
  leadId,
  asignadoA,
  esMio,
  nombreAsignado,
  onTomar,
  claiming,
}: {
  conversationId: string;
  telefono: string;
  botActivo: boolean;
  nombre: string;
  msgs: MessageItem[];
  leadId?: string;
  asignadoA?: string | null;
  esMio?: boolean;
  nombreAsignado?: string | null;
  onTomar?: (leadId: string) => void;
  claiming?: boolean;
}) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [sending, setSending] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [msgs.length, conversationId]);

  function enviar() {
    const contenido = text.trim();
    if (!contenido || sending) return;
    setSending(true);
    startTransition(async () => {
      try {
        await sendAdvisorMessage(conversationId, telefono, contenido);
        setText("");
        router.refresh();
      } catch (err) {
        alert("No se pudo enviar: " + ((err as Error)?.message ?? "error"));
      } finally {
        setSending(false);
      }
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-800">{nombre}</h3>
          <p className="text-xs text-slate-400">{telefono}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
            {asignadoA ? (
              <>
                <span className="inline-block h-4 w-4 rounded-full bg-blue-100 text-center text-[9px] leading-4">
                  👤
                </span>
                {esMio ? (
                  <span className="font-semibold text-blue-700">Tú la tienes</span>
                ) : (
                  <span>La tiene {nombreAsignado ?? "Asignado"}</span>
                )}
              </>
            ) : (
              <span className="text-slate-300">Sin asignar</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {!asignadoA && leadId && onTomar && (
            <button
              onClick={() => onTomar(leadId)}
              disabled={claiming}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {claiming ? "Tomando..." : "👤 Tomar esta conversación"}
            </button>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            botActivo ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
          }`}>
            Bot IA: {botActivo ? "activo" : "apagado"}
          </span>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {msgs.map((m) => {
          const esCliente = m.remitente === "cliente";
          return (
            <div key={m.id} className={`flex ${esCliente ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                  esCliente
                    ? "rounded-bl-sm bg-slate-100 text-slate-800"
                    : m.remitente === "bot"
                    ? "rounded-br-sm bg-blue-100 text-blue-900"
                    : "rounded-br-sm bg-blue-900 text-white"
                }`}
              >
                <p className="whitespace-pre-wrap">{m.contenido}</p>
                <span className={`mt-1 block text-[10px] ${esCliente ? "text-slate-400" : "opacity-60"}`}>
                  {REMITENTE_LABEL[m.remitente]} · {formatTime(m.created)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-100 p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && enviar()}
            placeholder="Responder al cliente por WhatsApp..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          />
          <button
            onClick={enviar}
            disabled={isPending || sending || !text.trim()}
            className="shrink-0 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {sending ? "Enviando..." : "➤ Enviar"}
          </button>
        </div>
        {botActivo && (
          <p className="mt-1.5 text-[11px] text-amber-600">
            ⚠️ El bot IA está activo en esta conversación. Tu mensaje se envía igual; considera apagarlo si vas a tomar el control.
          </p>
        )}
      </div>
    </>
  );
}