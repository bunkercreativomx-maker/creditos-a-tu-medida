import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/pocketbase-server";
import { PB_URL } from "@/lib/pocketbase";
import { NoteForm, AdvisorMessageForm, BotToggle, LeadDataEditor, DeleteLeadButton } from "@/components/crm/LeadDetailForms";
import type { PbLead, PbConversation, PbMessage, PbLeadNote, PbLeadAudit, PbUser } from "@/lib/types";

const DOCUMENTS: { key: keyof PbLead; label: string }[] = [
  { key: "ine_frente", label: "INE (frente)" },
  { key: "ine_reverso", label: "INE (reverso)" },
  { key: "comprobante_domicilio", label: "Comprobante de domicilio" },
];

const ESTADO_CIVIL_LABELS: Record<string, string> = {
  soltero: "Soltero(a)",
  casado: "Casado(a)",
  divorciado: "Divorciado(a)",
  viudo: "Viudo(a)",
  union_libre: "Unión Libre",
};

/**
 * URL de descarga de un documento (file field de PocketBase).
 * Usa el token del registro para firmar la URL → funciona en pestaña nueva
 * sin depender de la cookie de sesión cruzada del navegador.
 */
function docUrl(lead: PbLead, field: keyof PbLead): string | null {
  const filename = lead[field] as string | null;
  if (!filename) return null;
  return `${PB_URL}/api/files/leads/${lead.id}/${encodeURIComponent(filename)}?token=${encodeURIComponent(lead.token ?? "")}`;
}

async function getDocumentLinks(lead: PbLead) {
  const links = DOCUMENTS.map(({ key, label }) => {
    const url = docUrl(lead, key);
    return url ? { label, url } : null;
  }).filter((e): e is { label: string; url: string } => e !== null);
  return links;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pb = await createServerClient();
  const user = pb.authStore.model as { role?: string } | null;
  const isAdmin = user?.role === "admin";

  let lead: PbLead | null = null;
  try {
    lead = (await pb.collection("leads").getOne(id)) as unknown as PbLead;
  } catch {
    return notFound();
  }

  const [notesResult, conversationResult, documentLinks, auditResult, usersResult] = await Promise.all([
    pb
      .collection("lead_notes")
      .getList(1, 200, { filter: `lead = "${id}"`, sort: "-id" }),
    pb
      .collection("conversations")
      .getFirstListItem(`lead = "${id}"`)
      .catch(() => null),
    getDocumentLinks(lead),
    pb
      .collection("lead_audit")
      .getList(1, 200, { filter: `lead = "${id}"`, sort: "-created" })
      .catch(() => ({ items: [] })),
    pb.collection("users").getList(1, 500, { sort: "id" }),
  ]);

  const notes = notesResult.items as unknown as PbLeadNote[];
  const conversation = conversationResult as unknown as PbConversation | null;
  const auditLogs = (auditResult as { items: unknown[] }).items as unknown as PbLeadAudit[];
  const usuarios = (usersResult as { items: unknown[] }).items as unknown as PbUser[];

  const nombreActor = (id: string | null) => {
    if (!id) return "Sistema";
    const u = usuarios.find((x) => x.id === id);
    return u ? (u.full_name || u.name || u.email || "Usuario") : "Usuario";
  };

  let messages: PbMessage[] = [];
  if (conversation) {
    const msgResult = await pb
      .collection("messages")
      .getList(1, 200, { filter: `conversation = "${conversation.id}"`, sort: "id" });
    messages = msgResult.items as unknown as PbMessage[];
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-900">
              {lead.nombre || "Sin nombre"} {lead.apellido ?? ""}
            </h1>
            <p className="text-sm text-slate-600">{lead.telefono}</p>
            {lead.email && <p className="text-sm text-slate-600">{lead.email}</p>}
          </div>
        <div className="flex flex-col items-end gap-2">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase text-slate-500">
            {lead.origen === "whatsapp" ? "WhatsApp" : "Formulario web"}
          </span>
          {isAdmin && (
            <DeleteLeadButton
              leadId={lead.id}
              leadName={`${lead.nombre || "Sin nombre"} ${lead.apellido ?? ""}`.trim()}
            />
          )}
        </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <Field label="Status" value={lead.status.replace("_", " ")} capitalize />
          <Field label="Sector" value={lead.producto_interes} />
          <Field label="Fecha de nacimiento" value={lead.fecha_nacimiento} />
          <Field label="Lugar de nacimiento" value={lead.lugar_nacimiento} />
          <Field label="Género" value={lead.genero} capitalize />
          <Field label="Estado civil" value={lead.estado_civil ? ESTADO_CIVIL_LABELS[lead.estado_civil] : null} />
        </dl>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-blue-900">Datos del lead (editable)</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Modifica cualquier campo (CURP, RFC, NSS, banco, CLABE, tipo de crédito, etc.) y pulsa "Guardar cambios".
        </p>
        <div className="mt-4">
          <LeadDataEditor lead={lead} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-blue-900">Documentos</h2>
        {documentLinks.length > 0 ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {documentLinks.map((doc) => (
              <li key={doc.label}>
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-slate-200 p-3 text-center text-sm font-medium text-blue-900 hover:border-blue-400 hover:bg-blue-50"
                >
                  📄 {doc.label}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-400">Sin documentos cargados todavía.</p>
        )}
      </div>

      {conversation && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-blue-900">Conversación de WhatsApp</h2>
            <BotToggle conversationId={conversation.id} botActivo={conversation.bot_activo} />
          </div>
          <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
            {(messages ?? []).map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  m.remitente === "cliente"
                    ? "ml-0 bg-slate-100 text-slate-800"
                    : "ml-auto bg-blue-900 text-white"
                }`}
              >
                <p>{m.contenido}</p>
                <span className="mt-1 block text-[10px] opacity-60">{m.remitente}</span>
              </div>
            ))}
            {(!messages || messages.length === 0) && (
              <p className="text-sm text-slate-400">Sin mensajes todavía.</p>
            )}
          </div>
          <div className="mt-4">
            <AdvisorMessageForm conversationId={conversation.id} telefono={lead.telefono} />
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-blue-900">Notas</h2>
        <div className="mt-3">
          <NoteForm leadId={lead.id} />
        </div>
        <ul className="mt-4 space-y-3">
          {(notes ?? []).map((n) => (
            <li key={n.id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
              <p>{n.nota}</p>
              <span className="mt-1 block text-xs text-slate-400">
                {new Date(n.created).toLocaleString("es-MX")}
              </span>
            </li>
          ))}
          {(!notes || notes.length === 0) && <p className="text-sm text-slate-400">Sin notas todavía.</p>}
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-blue-900">🕓 Historial del lead</h2>
        <p className="mt-0.5 text-xs text-slate-400">
          Registro de quién creó, tomó y editó este lead.
        </p>
        <ul className="mt-4 space-y-3">
          {(auditLogs ?? []).map((a) => (
            <li key={a.id} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px]">
                {a.accion === "Lead creado" ? "➕" : a.accion === "Lead tomado" ? "👤" : "✏️"}
              </span>
              <div>
                <p className="text-sm text-slate-700">
                  <span className="font-semibold">{a.accion}</span>
                  {a.detalle && <span className="text-slate-500"> · {a.detalle}</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {nombreActor(a.actor)} · {new Date(a.created).toLocaleString("es-MX")}
                </p>
              </div>
            </li>
          ))}
          {(!auditLogs || auditLogs.length === 0) && (
            <p className="text-sm text-slate-400">Sin actividad registrada todavía.</p>
          )}
        </ul>
      </div>
    </div>
  );
}

function Field({ label, value, capitalize }: { label: string; value: string | null; capitalize?: boolean }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className={capitalize ? "capitalize" : undefined}>{value || "—"}</dd>
    </div>
  );
}
