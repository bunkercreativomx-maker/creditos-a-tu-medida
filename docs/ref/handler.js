import { prisma } from "../lib/prisma.js";
import { enviarTexto, marcarLeido } from "../whatsapp/send.js";
import { generarRespuesta } from "./claude.js";
import { MENSAJE_ESCALAMIENTO } from "./guardrails.js";

const CIERRE_B =
  "Ya quedó registrada su información. Un asesor se pondrá en contacto con usted lo antes " +
  "posible para darle todos los detalles. Quedo pendiente por aquí. ¡Excelente día!";

export async function procesarMensaje(job) {
  const { phoneNumberId, waMessageId, from, tipo, texto, nombrePerfil } = job.data;

  const tenant = await prisma.tenant.findUnique({ where: { phoneNumberId } });
  if (!tenant?.activo) return;

  const conversacion = await prisma.conversation.upsert({
    where: { tenantId_waPhone: { tenantId: tenant.id, waPhone: from } },
    update: { ultimoMensaje: new Date() },
    create: { tenantId: tenant.id, waPhone: from },
  });

  const lead =
    (await prisma.lead.findUnique({ where: { conversationId: conversacion.id } })) ??
    (await prisma.lead.create({ data: { conversationId: conversacion.id } }));

  await marcarLeido(tenant, waMessageId);

  await prisma.message.create({
    data: {
      conversationId: conversacion.id,
      waMessageId,
      rol: "user",
      texto: texto ?? `[${tipo}]`,
    },
  });

  // ── Handoff activo: el bot se calla, no escribe encima del asesor ──
  if (conversacion.enHandoff) return;

  // ── Nota de voz, imagen, documento: BLOQUE 8 ──
  if (tipo !== "text" || !texto) {
    await prisma.conversation.update({
      where: { id: conversacion.id },
      data: { enHandoff: true, handoffMotivo: `tipo_no_soportado:${tipo}` },
    });
    await enviarTexto(tenant, from, MENSAJE_ESCALAMIENTO);
    return;
  }

  const historial = await construirHistorial(conversacion.id);
  const ctx = { tenant, conversacion, lead };

  let respuesta;
  try {
    respuesta = await generarRespuesta(ctx, historial);
  } catch (e) {
    // Fallback anti-silencio: NUNCA termina un turno sin mensaje.
    console.error("[handler] error generando:", e);
    await prisma.conversation.update({
      where: { id: conversacion.id },
      data: { enHandoff: true, handoffMotivo: "error_tecnico" },
    });
    await enviarTexto(tenant, from, CIERRE_B);
    return;
  }

  await enviarTexto(tenant, from, respuesta.texto);
  await prisma.message.create({
    data: {
      conversationId: conversacion.id,
      rol: "assistant",
      texto: respuesta.texto,
      modelo: respuesta.modelo,
    },
  });
}

// Solo los últimos 12 turnos: el estado real vive en la base de datos
async function construirHistorial(conversationId) {
  const msgs = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  return msgs
    .reverse()
    .map((m) => ({ role: m.rol === "user" ? "user" : "assistant", content: m.texto }));
}

