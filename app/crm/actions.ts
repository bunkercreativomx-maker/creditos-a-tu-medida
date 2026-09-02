"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/pocketbase-server";
import { notifyNewLead } from "@/lib/push";
import type { LeadStatus, UserRole, OperacionStatus, OperacionTipo, CitaTipo } from "@/lib/types";

/** Registra una acción en la bitácora del lead (historial). */
async function logAudit(
  pb: Awaited<ReturnType<typeof createServerClient>>,
  leadId: string,
  accion: string,
  detalle?: string
) {
  try {
    const actor = (pb.authStore.model as { id?: string } | null)?.id ?? null;
    await pb.collection("lead_audit").create({
      lead: leadId,
      actor,
      accion,
      detalle: detalle ?? null,
    });
  } catch (err) {
    // No romper la acción principal si el log falla
    console.warn("Audit log error:", (err as Error)?.message);
  }
}

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const pb = await createServerClient();
  try {
    await pb.collection("leads").update(leadId, { status });
    await logAudit(pb, leadId, "Cambio de etapa", `Etapa → ${status}`);
  } catch (err) {
    throw new Error((err as Error)?.message ?? "Error al actualizar estado");
  }
  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function createLead(data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload = {
    telefono: String(data.telefono ?? ""),
    nombre: data.nombre ? String(data.nombre) : null,
    apellido: data.apellido ? String(data.apellido) : null,
    email: data.email ? String(data.email) : null,
    origen: "web_form",
    status: "nuevo",
    producto_interes: data.producto_interes ? String(data.producto_interes) : null,
    monto_aproximado: data.monto_aproximado ? String(data.monto_aproximado) : null,
    asignado_a: data.asignado_a ? String(data.asignado_a) : null,
  };
  if (String(data.telefono ?? "").length < 10) {
    throw new Error("Teléfono inválido (mínimo 10 dígitos)");
  }
  let nuevoId: string;
  try {
    const creado = await pb.collection("leads").create(payload);
    nuevoId = creado.id;
    await logAudit(pb, nuevoId, "Lead creado", "Capturado en el pipeline");
    // Notificar a los asesores por push (esperar: serverless congela tras responder)
    await notifyNewLead({
      nombre: payload.nombre,
      apellido: payload.apellido,
      monto_aproximado: payload.monto_aproximado,
    });
  } catch (err) {
    throw new Error((err as Error)?.message ?? "Error al crear el lead");
  }
  revalidatePath("/crm");
}

export async function updateLead(leadId: string, data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload: Record<string, unknown> = {};
  for (const key of [
    "nombre", "apellido", "email", "telefono",
    "producto_interes", "monto_aproximado",
    "banco", "institucion", "curp", "rfc", "nss", "clabe",
    "tipo_credito", "fecha_nacimiento", "lugar_nacimiento",
    "genero", "estado_civil", "vencimiento_documentos",
  ]) {
    if (key in data) payload[key] = data[key] ? String(data[key]) : null;
  }
  try {
    await pb.collection("leads").update(leadId, payload);
    await logAudit(pb, leadId, "Datos editados", "Campos del lead actualizados");
  } catch (err) {
    throw new Error((err as Error)?.message ?? "Error al actualizar el lead");
  }
  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function claimLead(leadId: string) {
  const pb = await createServerClient();
  const user = pb.authStore.model as { id?: string; full_name?: string; name?: string; email?: string } | null;
  if (!user?.id) throw new Error("No autenticado");

  await pb.collection("leads").update(leadId, { asignado_a: user.id });
  const nombre = user.full_name || user.name || user.email || "";
  await logAudit(pb, leadId, "Lead tomado", `Asignado a ${nombre}`);
  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function addLeadNote(leadId: string, nota: string) {
  const pb = await createServerClient();
  const user = pb.authStore.model;
  if (!user?.id) throw new Error("No autenticado");

  await pb.collection("lead_notes").create({
    lead: leadId,
    autor: user.id,
    nota,
  });
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function toggleBotActivo(conversationId: string, botActivo: boolean) {
  const pb = await createServerClient();
  await pb.collection("conversations").update(conversationId, { bot_activo: botActivo });
  revalidatePath("/crm");
}

export async function sendAdvisorMessage(conversationId: string, telefono: string, contenido: string) {
  const pb = await createServerClient();
  await pb.collection("messages").create({
      conversation: conversationId,
      remitente: "asesor",
      contenido,
      created: new Date().toISOString(),
    });

  // Leer los ids de Zernio guardados en la conversación para responder al hilo real.
  const conv = await pb
    .collection("conversations")
    .getOne(conversationId)
    .catch(() => null) as unknown as {
    zernio_conversation_id?: string;
    zernio_account_id?: string;
  } | null;

  const zc = conv?.zernio_conversation_id;
  const za = conv?.zernio_account_id;

  if (zc && za) {
    const { sendWhatsAppMessage } = await import("@/lib/zernio");
    await sendWhatsAppMessage(zc, za, contenido);
  }
}

export async function deleteLead(leadId: string) {
  const pb = await createServerClient();
  const user = pb.authStore.model as { id?: string; role?: string } | null;

  // Regla de negocio: SOLO el admin puede borrar leads.
  // Defensa en profundidad: no dependemos solo del deleteRule de la DB.
  if (!user?.id || user.role !== "admin") {
    throw new Error("No autorizado: solo un administrador puede eliminar leads");
  }

  // Borrar en cascada (relaciones required apuntan a este lead).
  const [ops, citas, convs, notes] = await Promise.all([
    pb.collection("operaciones").getFullList({ filter: `lead = "${leadId}"` }),
    pb.collection("citas").getFullList({ filter: `lead = "${leadId}"` }),
    pb.collection("conversations").getFullList({ filter: `lead = "${leadId}"` }),
    pb.collection("lead_notes").getFullList({ filter: `lead = "${leadId}"` }),
  ]);

  for (const op of ops) await pb.collection("operaciones").delete(op.id);
  for (const cita of citas) await pb.collection("citas").delete(cita.id);
  for (const conv of convs) {
    // borrar mensajes de la conversación
    const msgs = await pb.collection("messages").getFullList({ filter: `conversation = "${conv.id}"` });
    for (const m of msgs) await pb.collection("messages").delete(m.id);
    await pb.collection("conversations").delete(conv.id);
  }
  for (const n of notes) await pb.collection("lead_notes").delete(n.id);

  await pb.collection("leads").delete(leadId);
  revalidatePath("/crm");
  revalidatePath("/crm/financieras");
  revalidatePath("/crm/calendario");
  revalidatePath("/crm/vendedores");
  revalidatePath("/crm/renovaciones");
}

export async function updateUserRole(profileId: string, role: UserRole) {
  const pb = await createServerClient();
  const user = pb.authStore.model;

  // Defensa en profundidad: solo admins pueden cambiar roles.
  // La regla de PocketBase (updateRule = role=admin) ya lo protege,
  // pero no dependemos solo de la DB.
  if (!user?.id || (user as { role?: string }).role !== "admin") {
    throw new Error("No autorizado");
  }

  await pb.collection("users").update(profileId, { role });
  revalidatePath("/crm/admin/usuarios");
}

// ---- Operaciones (tablero de financieras) ----

export async function createOperacion(data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload = {
    lead: String(data.lead),
    financiera: data.financiera ? String(data.financiera) : null,
    monto_prestado: data.monto_prestado ? Number(data.monto_prestado) : null,
    comision: data.comision ? Number(data.comision) : null,
    status: (data.status as OperacionStatus) ?? "pendiente",
    comentarios: data.comentarios ? String(data.comentarios) : null,
    tipo: (data.tipo as OperacionTipo) ?? null,
    fecha_desembolso: data.fecha_desembolso ? String(data.fecha_desembolso) : null,
    fecha_vencimiento: data.fecha_vencimiento ? String(data.fecha_vencimiento) : null,
    plazo_meses: data.plazo_meses ? Number(data.plazo_meses) : null,
  };
  await pb.collection("operaciones").create(payload);
  revalidatePath("/crm/financieras");
}

export async function updateOperacion(operacionId: string, data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload: Record<string, unknown> = {};
  if ("financiera" in data) payload.financiera = data.financiera ? String(data.financiera) : null;
  if ("monto_prestado" in data) payload.monto_prestado = data.monto_prestado ? Number(data.monto_prestado) : null;
  if ("comision" in data) payload.comision = data.comision ? Number(data.comision) : null;
  if ("status" in data) payload.status = data.status;
  if ("comentarios" in data) payload.comentarios = data.comentarios ? String(data.comentarios) : null;
  if ("tipo" in data) payload.tipo = data.tipo;
  if ("fecha_desembolso" in data) payload.fecha_desembolso = data.fecha_desembolso ? String(data.fecha_desembolso) : null;
  if ("fecha_vencimiento" in data) payload.fecha_vencimiento = data.fecha_vencimiento ? String(data.fecha_vencimiento) : null;
  if ("plazo_meses" in data) payload.plazo_meses = data.plazo_meses ? Number(data.plazo_meses) : null;
  await pb.collection("operaciones").update(operacionId, payload);
  revalidatePath("/crm/financieras");
}

export async function deleteOperacion(operacionId: string) {
  const pb = await createServerClient();
  await pb.collection("operaciones").delete(operacionId);
  revalidatePath("/crm/financieras");
}

// ---- Citas (calendario) ----

export async function createCita(data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload = {
    lead: data.lead ? String(data.lead) : null,
    titulo: data.titulo ? String(data.titulo) : null,
    fecha: String(data.fecha),
    tipo: (data.tipo as CitaTipo) ?? "llamada",
    asignado_a: data.asignado_a ? String(data.asignado_a) : null,
    notas: data.notas ? String(data.notas) : null,
  };
  await pb.collection("citas").create(payload);
  revalidatePath("/crm/calendario");
}

export async function updateCita(citaId: string, data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload: Record<string, unknown> = {};
  if ("titulo" in data) payload.titulo = data.titulo ? String(data.titulo) : null;
  if ("fecha" in data) payload.fecha = String(data.fecha);
  if ("tipo" in data) payload.tipo = data.tipo;
  if ("notas" in data) payload.notas = data.notas ? String(data.notas) : null;
  if ("asignado_a" in data) payload.asignado_a = data.asignado_a ? String(data.asignado_a) : null;
  await pb.collection("citas").update(citaId, payload);
  revalidatePath("/crm/calendario");
}

export async function deleteCita(citaId: string) {
  const pb = await createServerClient();
  await pb.collection("citas").delete(citaId);
  revalidatePath("/crm/calendario");
}
