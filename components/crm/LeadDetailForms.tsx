"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addLeadNote, sendAdvisorMessage, toggleBotActivo, updateLead, deleteLead } from "@/app/crm/actions";
import type { PbLead, Genero, EstadoCivil, TipoCredito } from "@/lib/types";

/** Edición inline de los datos del lead (CURP, RFC, NSS, banco, CLABE, etc.). */
export function LeadDataEditor({ lead }: { lead: PbLead }) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(() => ({
    nombre: lead.nombre ?? "",
    apellido: lead.apellido ?? "",
    email: lead.email ?? "",
    telefono: lead.telefono ?? "",
    producto_interes: lead.producto_interes ?? "",
    monto_aproximado: lead.monto_aproximado ?? "",
    banco: lead.banco ?? "",
    institucion: lead.institucion ?? "",
    curp: lead.curp ?? "",
    rfc: lead.rfc ?? "",
    nss: lead.nss ?? "",
    clabe: lead.clabe ?? "",
    tipo_credito: lead.tipo_credito ?? "",
    fecha_nacimiento: lead.fecha_nacimiento ?? "",
    lugar_nacimiento: lead.lugar_nacimiento ?? "",
    genero: lead.genero ?? "",
    estado_civil: lead.estado_civil ?? "",
  }));

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function save() {
    startTransition(async () => {
      await updateLead(lead.id, form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const inputCls = "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm";

  return (
    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
      <Field label="Nombre" input={<input className={inputCls} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} />} />
      <Field label="Apellido" input={<input className={inputCls} value={form.apellido} onChange={(e) => set("apellido", e.target.value)} />} />
      <Field label="Teléfono" input={<input className={inputCls} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} />} />
      <Field label="Email" input={<input className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />} />
      <Field label="Sector" input={<input className={inputCls} value={form.producto_interes} onChange={(e) => set("producto_interes", e.target.value)} />} />
      <Field label="Monto aprox." input={<input className={inputCls} value={form.monto_aproximado} onChange={(e) => set("monto_aproximado", e.target.value)} />} />
      <Field label="CURP" input={<input className={inputCls} value={form.curp} onChange={(e) => set("curp", e.target.value)} />} />
      <Field label="RFC" input={<input className={inputCls} value={form.rfc} onChange={(e) => set("rfc", e.target.value)} />} />
      <Field label="Núm. de Pensión / NSS" input={<input className={inputCls} value={form.nss} onChange={(e) => set("nss", e.target.value)} />} />
      <Field label="Banco" input={<input className={inputCls} value={form.banco} onChange={(e) => set("banco", e.target.value)} />} />
      <Field label="CLABE" input={<input className={inputCls} value={form.clabe} onChange={(e) => set("clabe", e.target.value)} />} />
      <Field label="Institución" input={<input className={inputCls} value={form.institucion} onChange={(e) => set("institucion", e.target.value)} />} />
      <Field label="Tipo de crédito" input={
        <select className={inputCls} value={form.tipo_credito} onChange={(e) => set("tipo_credito", e.target.value)}>
          <option value="">—</option>
          <option value="nuevo">Nuevo</option>
          <option value="renovacion">Renovación</option>
        </select>
      } />
      <Field label="Fecha de nacimiento" input={<input className={inputCls} value={form.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} placeholder="YYYY-MM-DD" />} />
      <Field label="Lugar de nacimiento" input={<input className={inputCls} value={form.lugar_nacimiento} onChange={(e) => set("lugar_nacimiento", e.target.value)} />} />
      <Field label="Género" input={
        <select className={inputCls} value={form.genero} onChange={(e) => set("genero", e.target.value)}>
          <option value="">—</option>
          <option value="masculino">Masculino</option>
          <option value="femenino">Femenino</option>
        </select>
      } />
      <Field label="Estado civil" input={
        <select className={inputCls} value={form.estado_civil} onChange={(e) => set("estado_civil", e.target.value)}>
          <option value="">—</option>
          <option value="soltero">Soltero(a)</option>
          <option value="casado">Casado(a)</option>
          <option value="divorciado">Divorciado(a)</option>
          <option value="viudo">Viudo(a)</option>
          <option value="union_libre">Unión Libre</option>
        </select>
      } />

      <div className="col-span-2 flex items-center gap-3 sm:col-span-3">
        <button
          disabled={isPending}
          onClick={save}
          className="rounded-lg bg-blue-900 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "💾 Guardar cambios"}
        </button>
        {saved && <span className="text-sm font-medium text-emerald-600">✓ Guardado</span>}
      </div>
    </div>
  );
}

function Field({ label, input }: { label: string; input: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      {input}
    </label>
  );
}

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

/** Botón de borrado del lead. Solo el admin debería montarlo. */
export function DeleteLeadButton({ leadId, leadName }: { leadId: string; leadName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteLead(leadId);
        router.push("/crm");
        router.refresh();
      } catch (err) {
        setError((err as Error)?.message ?? "Error al eliminar el lead");
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <button
        disabled={isPending}
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50"
      >
        🗑 Eliminar lead
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-medium text-red-700">
        ¿Eliminar a <span className="font-bold">{leadName}</span>? Se borrarán también sus operaciones, citas y notas. Esta acción no se puede deshacer.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          disabled={isPending}
          onClick={handleDelete}
          className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {isPending ? "Borrando..." : "Sí, eliminar"}
        </button>
        <button
          disabled={isPending}
          onClick={() => setConfirming(false)}
          className="rounded-lg bg-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-300"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
