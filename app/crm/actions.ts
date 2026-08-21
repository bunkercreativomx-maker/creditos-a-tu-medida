"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/pocketbase-server";
import type { LeadStatus, UserRole, OperacionStatus, OperacionTipo, CitaTipo } from "@/lib/types";

export async function updateLeadStatus(leadId: string, status: LeadStatus) {
  const pb = await createServerClient();
  try {
    await pb.collection("leads").update(leadId, { status });
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
  try {
    await pb.collection("leads").create(payload);
  } catch (err) {
    throw new Error((err as Error)?.message ?? "Error al crear el lead");
  }
  revalidatePath("/crm");
}

export async function updateLead(leadId: string, data: Record<string, unknown>) {
  const pb = await createServerClient();
  const payload: Record<string, unknown> = {};
  for (const key of ["nombre", "apellido", "email", "producto_interes", "monto_aproximado", "banco", "institucion"]) {
    if (key in data) payload[key] = data[key] ? String(data[key]) : null;
  }
  try {
    await pb.collection("leads").update(leadId, payload);
  } catch (err) {
    throw new Error((err as Error)?.message ?? "Error al actualizar el lead");
  }
  revalidatePath("/crm");
  revalidatePath(`/crm/leads/${leadId}`);
}

export async function claimLead(leadId: string) {
  const pb = await createServerClient();
  const user = pb.authStore.model;
  if (!user?.id) throw new Error("No autenticado");

  await pb.collection("leads").update(leadId, { asignado_a: user.id });
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
  });

  const { sendWhatsAppMessage } = await import("@/lib/zernio");
  await sendWhatsAppMessage(telefono, contenido);
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
