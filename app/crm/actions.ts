"use server";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/pocketbase-server";
import type { LeadStatus, UserRole } from "@/lib/types";

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
