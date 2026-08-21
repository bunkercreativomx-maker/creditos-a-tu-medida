"use client";

import { useRef, useTransition } from "react";
import { addLeadNote, sendAdvisorMessage, toggleBotActivo } from "@/app/crm/actions";

export function NoteForm({ leadId }: { leadId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={ref}
      action={(formData) => {
        const nota = String(formData.get("nota") ?? "").trim();
        if (!nota) return;
        startTransition(async () => {
          await addLeadNote(leadId, nota);
          ref.current?.reset();
        });
      }}
      className="flex gap-2"
    >
      <input
        name="nota"
        placeholder="Agregar nota..."
        required
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-900 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
      >
        Agregar
      </button>
    </form>
  );
}

export function AdvisorMessageForm({
  conversationId,
  telefono,
}: {
  conversationId: string;
  telefono: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <form
      ref={ref}
      action={(formData) => {
        const contenido = String(formData.get("contenido") ?? "").trim();
        if (!contenido) return;
        startTransition(async () => {
          await sendAdvisorMessage(conversationId, telefono, contenido);
          ref.current?.reset();
        });
      }}
      className="flex gap-2"
    >
      <input
        name="contenido"
        placeholder="Responder por WhatsApp..."
        required
        className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
      >
        Enviar
      </button>
    </form>
  );
}

export function BotToggle({ conversationId, botActivo }: { conversationId: string; botActivo: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      disabled={isPending}
      onClick={() => startTransition(() => toggleBotActivo(conversationId, !botActivo))}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        botActivo ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
      }`}
    >
      Bot IA: {botActivo ? "activo" : "apagado"} — {botActivo ? "tomar control" : "reactivar bot"}
    </button>
  );
}
