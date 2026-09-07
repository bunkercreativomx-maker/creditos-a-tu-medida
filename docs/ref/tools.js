import { DateTime } from "luxon";
import { google } from "googleapis";
import { prisma } from "../lib/prisma.js";

export const TOOLS = [
  {
    name: "guardar_prescreen",
    description:
      "Guarda los datos del prescreen conforme el cliente los va dando. " +
      "Llámala en cuanto extraigas un dato, aunque sea uno solo.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string" },
        estatus: { type: "string", enum: ["jubilado", "pensionado", "ninguno"] },
        dependencia: {
          type: "string",
          description: "IMSS, ISSSTE, CFE, SNTE, PEMEX, o 'otra: <nombre>'",
        },
        monto_solicitado: { type: "string", description: "Cifra en pesos o 'no definido'" },
        credito_vigente: { type: "boolean" },
        empresa_credito: { type: "string" },
        antiguedad_credito: { type: "string", description: "Mes y año, ej. 'marzo 2025'" },
        referido_nombre: { type: "string" },
        referido_telefono: { type: "string" },
      },
    },
  },
  {
    name: "buscar_disponibilidad",
    description:
      "Consulta horarios libres reales en el calendario. Úsala SIEMPRE antes de " +
      "proponer un horario. Nunca ofrezcas una hora sin consultar esto.",
    input_schema: {
      type: "object",
      properties: {
        fecha_preferida: {
          type: "string",
          description: "Fecha YYYY-MM-DD que pidió el cliente. Omitir para ver lo más próximo.",
        },
      },
    },
  },
  {
    name: "crear_cita",
    description: "Agenda la cita en el calendario. Solo después de que el cliente confirmó la hora.",
    input_schema: {
      type: "object",
      properties: {
        fecha_hora: { type: "string", description: "ISO 8601 con offset, ej. 2026-09-10T10:00:00-06:00" },
      },
      required: ["fecha_hora"],
    },
  },
  {
    name: "escalar_a_asesor",
    description:
      "Pasa la conversación a un asesor humano. Úsala ante cualquier pregunta de tasas, " +
      "montos, requisitos, quejas, estatus de trámite, o cualquier cosa fuera de tus instrucciones.",
    input_schema: {
      type: "object",
      properties: { motivo: { type: "string" } },
      required: ["motivo"],
    },
  },
];

// ── Ejecutores ───────────────────────────────────────────────────────

const MAPEO = {
  nombre: "nombre",
  estatus: "estatus",
  dependencia: "dependencia",
  monto_solicitado: "montoSolicitado",
  credito_vigente: "creditoVigente",
  empresa_credito: "empresaCredito",
  antiguedad_credito: "antiguedadCredito",
  referido_nombre: "referidoNombre",
  referido_telefono: "referidoTelefono",
};

export async function ejecutarTool(nombre, input, ctx) {
  const { tenant, conversacion, lead } = ctx;

  switch (nombre) {
    case "guardar_prescreen": {
      const data = {};
      for (const [k, v] of Object.entries(input)) {
        if (MAPEO[k] && v !== undefined && v !== null) data[MAPEO[k]] = v;
      }
      if (Object.keys(data).length === 0) return "Sin cambios.";
      const nuevo = await prisma.lead.update({ where: { id: lead.id }, data });
      Object.assign(lead, nuevo); // refrescar en memoria para el siguiente turno
      return `Guardado: ${Object.keys(data).join(", ")}`;
    }

    case "buscar_disponibilidad": {
      const slots = await horariosLibres(tenant, input.fecha_preferida);
      if (!slots.length) return "Sin espacios ese día. Ofrece otra fecha cercana.";
      return JSON.stringify(
        slots.slice(0, 3).map((s) => ({
          iso: s.toISO(),
          legible: s.setLocale("es").toFormat("cccc d 'de' LLLL 'a las' HH:mm"),
        }))
      );
    }

    case "crear_cita": {
      const inicio = DateTime.fromISO(input.fecha_hora, { zone: tenant.timezone });
      if (!inicio.isValid) return "Fecha inválida. Pide al cliente que la repita.";
      if (inicio < DateTime.now().setZone(tenant.timezone)) {
        return "Esa fecha ya pasó. Ofrece un horario futuro.";
      }

      const cal = await calendario(tenant);
      const ev = await cal.events.insert({
        calendarId: tenant.calendarId,
        requestBody: {
          summary: `Cita préstamo — ${lead.nombre ?? "Sin nombre"} — ${lead.dependencia ?? "?"}`,
          description: resumenParaAsesor(lead, conversacion),
          location: tenant.direccion,
          start: { dateTime: inicio.toISO(), timeZone: tenant.timezone },
          end: {
            dateTime: inicio.plus({ minutes: tenant.duracionCitaMin }).toISO(),
            timeZone: tenant.timezone,
          },
        },
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: { citaFecha: inicio.toJSDate(), citaEventId: ev.data.id, citaEstatus: "agendada" },
      });

      return JSON.stringify({
        ok: true,
        legible: inicio.setLocale("es").toFormat("cccc d 'de' LLLL 'a las' HH:mm"),
        direccion: tenant.direccion,
        referencia: tenant.referencia ?? "",
        maps: tenant.linkMaps ?? "",
      });
    }

    case "escalar_a_asesor": {
      await prisma.conversation.update({
        where: { id: conversacion.id },
        data: { enHandoff: true, handoffMotivo: input.motivo },
      });
      await notificarAsesor(tenant, conversacion, lead, input.motivo);
      return "Escalado. Manda el mensaje de escalamiento del BLOQUE 8 y deja de hacer preguntas.";
    }

    default:
      return "Herramienta desconocida.";
  }
}

// ── Helpers de calendario ────────────────────────────────────────────

async function calendario(tenant) {
  // Reusa aquí las credenciales que ya tienes en la plataforma
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
    scopes: ["https://www.googleapis.com/auth/calendar"],
  });
  return google.calendar({ version: "v3", auth: await auth.getClient() });
}

async function horariosLibres(tenant, fechaPreferida) {
  const cal = await calendario(tenant);
  const zona = tenant.timezone;
  const desde = fechaPreferida
    ? DateTime.fromISO(fechaPreferida, { zone: zona }).startOf("day")
    : DateTime.now().setZone(zona).plus({ hours: 2 });

  const hasta = desde.plus({ days: 7 }).endOf("day");

  const { data } = await cal.freebusy.query({
    requestBody: {
      timeMin: desde.toISO(),
      timeMax: hasta.toISO(),
      timeZone: zona,
      items: [{ id: tenant.calendarId }],
    },
  });
  const ocupado = (data.calendars[tenant.calendarId].busy ?? []).map((b) => ({
    ini: DateTime.fromISO(b.start).setZone(zona),
    fin: DateTime.fromISO(b.end).setZone(zona),
  }));

  const [hIni, mIni] = tenant.horarioInicio.split(":").map(Number);
  const [hFin] = tenant.horarioFin.split(":").map(Number);
  const libres = [];

  for (let d = 0; d < 7 && libres.length < 6; d++) {
    const dia = desde.plus({ days: d });
    if (!tenant.diasHabiles.includes(dia.weekday)) continue;

    let slot = dia.set({ hour: hIni, minute: mIni, second: 0, millisecond: 0 });
    const cierre = dia.set({ hour: hFin, minute: 0 });

    while (slot < cierre) {
      const fin = slot.plus({ minutes: tenant.duracionCitaMin });
      const chocado = ocupado.some((o) => slot < o.fin && fin > o.ini);
      if (!chocado && slot > DateTime.now().setZone(zona).plus({ hours: 2 })) libres.push(slot);
      slot = fin;
    }
  }
  return libres;
}

function resumenParaAsesor(lead, conv) {
  return [
    `Teléfono: ${conv.waPhone}`,
    `Estatus: ${lead.estatus ?? "-"}`,
    `Dependencia: ${lead.dependencia ?? "-"}`,
    `Monto solicitado: ${lead.montoSolicitado ?? "-"}`,
    `Crédito vigente: ${lead.creditoVigente === true ? "Sí" : lead.creditoVigente === false ? "No" : "-"}`,
    `Empresa: ${lead.empresaCredito ?? "-"}`,
    `Antigüedad: ${lead.antiguedadCredito ?? "-"}`,
  ].join("\n");
}

async function notificarAsesor(tenant, conv, lead, motivo) {
  // Engánchalo a tu dashboard / Slack / correo
  console.warn("[handoff]", { tenant: tenant.nombre, tel: conv.waPhone, motivo });
}

