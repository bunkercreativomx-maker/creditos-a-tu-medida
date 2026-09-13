// FUENTE ÚNICA DE VERDAD — políticas de negocio del bot y el CRM.
//
// Antes estos datos estaban duplicados (y en desacuerdo) en `lib/bot.ts`,
// `lib/direccion.ts`, `lib/agenda.ts` y `lib/site-content.ts`: el horario decía
// "9:00–18:00" y "9:00–17:00" a la vez, la dirección variaba, y la regla del
// NSS se contradecía (el prompt lo prohibía Y lo exigía). Todo sale de aquí.

export const NOMBRE_EMPRESA = "Créditos a tu medida";
export const RAZON_SOCIAL = "Financiera Fortaleza, S.A. de C.V., SOFOM, E.N.R.";

export const DIRECCION_OFICIAL =
  "Benjamín Franklin 3220, Local 22D, Plaza de las Américas, Zona Pronaf, C.P. 32315, Cd. Juárez, Chihuahua";
export const REFERENCIA_UBICACION =
  "Local 22D, dentro de Plaza de las Américas, en Zona Pronaf";

export const ZONA_HORARIA = "America/Ciudad_Juarez";

/**
 * Horario de atención. La oficina abre hasta las 18:00 pero la ÚLTIMA cita del
 * día se agenda a las 17:00 (lun-vie). Sábados hasta 14:00 y domingos solo por
 * cita (10:00–14:00). El motor de citas (`lib/agenda.ts`) usa HORARIOS_*.
 */
export const HORARIO_ATENCION_TEXTO =
  "Lun a Vie 9:00–18:00 (última cita 17:00), Sáb 9:00–14:00, Dom 10:00–14:00 solo por cita";
export const ULTIMA_CITA_HHMM = "17:00";

/** Slots reservables por día (los que el motor de citas realmente agenda). */
export const HORARIOS_LUN_VIE = [
  "09:00", "10:00", "11:00", "12:00", "13:00", "15:00", "16:00", "17:00",
];
export const HORARIOS_SABADO = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00"];
export const HORARIOS_DOMINGO = ["10:00", "11:00", "12:00", "13:00", "14:00"];

export const DURACION_CITA = "30 minutos";

export const DEPENDENCIAS = "IMSS, ISSSTE, CFE, SNTE, PEMEX";

export const MONTO_REFERIDO = "$500 MXN";

/**
 * POLÍTICA DE IDENTIFICADORES (minimización de datos).
 *
 * Decisión verificada: para agendar una cita NO se exige ningún identificador
 * sensible (NSS, RFC, CURP, número de ISSSTE/expediente, ficha o número de
 * empleado). El bot NO debe pedirlo proactivamente ni bloquear el agendado por
 * no tenerlo. Si el cliente lo comparte por su cuenta, el bot responde que esos
 * datos se revisan en persona en la cita y NO los repite ni los persiste en el
 * chat. El dato se recaba después, directamente con el asesor.
 */
export const EXIGIR_IDENTIFICADOR_PARA_CITA = false;
