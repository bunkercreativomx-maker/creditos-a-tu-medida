// El modelo NO lleva el estado. Lo lleva la base de datos.
// Esto es lo que hace que Haiku sea suficiente: solo tiene que hacer
// una pregunta y extraer una respuesta, no razonar sobre 15 turnos.

const DEPENDENCIAS = ["IMSS", "ISSSTE", "CFE", "SNTE", "PEMEX"];

const ORDEN = [
  ["nombre", "el nombre completo del cliente"],
  ["estatus", "si es jubilado o pensionado"],
  ["dependencia", "de qué dependencia recibe su pensión"],
  ["montoSolicitado", "de cuánto es el préstamo que solicita"],
  ["creditoVigente", "si tiene un préstamo vigente con otra empresa de jubilados"],
  ["empresaCredito", "con qué empresa tiene ese préstamo"],
  ["antiguedadCredito", "hace cuánto sacó ese préstamo (mes y año)"],
];

export function siguientePendiente(lead) {
  for (const [campo, desc] of ORDEN) {
    // Los dos últimos solo aplican si hay crédito vigente
    if (["empresaCredito", "antiguedadCredito"].includes(campo) && lead.creditoVigente !== true) {
      continue;
    }
    if (lead[campo] === null || lead[campo] === undefined) return desc;
  }
  return "NINGUNO — el prescreen está completo. Procede a agendar la cita (BLOQUE 7) y manda el cierre obligatorio (BLOQUE 7B).";
}

export function esElegible(lead) {
  if (lead.estatus === "ninguno") return false;
  if (!lead.dependencia) return null; // aún no se sabe
  return DEPENDENCIAS.includes(lead.dependencia.toUpperCase());
}

// Bloque de contexto que se inyecta DESPUÉS del prompt cacheado
export function construirContexto(lead, tenant, ahora) {
  const v = (x) => (x === null || x === undefined ? "PENDIENTE" : String(x));

  return `
FECHA Y HORA ACTUAL: ${ahora} (${tenant.timezone})

ESTADO DEL PRESCREEN — ya lo tienes, NO lo vuelvas a preguntar:
- nombre: ${v(lead.nombre)}
- estatus: ${v(lead.estatus)}
- dependencia: ${v(lead.dependencia)}
- monto_solicitado: ${v(lead.montoSolicitado)}
- credito_vigente: ${v(lead.creditoVigente)}
- empresa_credito: ${lead.creditoVigente === true ? v(lead.empresaCredito) : "N/A"}
- antiguedad_credito: ${lead.creditoVigente === true ? v(lead.antiguedadCredito) : "N/A"}
- cita: ${lead.citaFecha ? lead.citaFecha.toISOString() : "sin agendar"}

ÚNICO DATO QUE DEBES OBTENER AHORA: ${siguientePendiente(lead)}

Haz UNA sola pregunta. Guarda lo que extraigas con la herramienta guardar_prescreen.
`.trim();
}

