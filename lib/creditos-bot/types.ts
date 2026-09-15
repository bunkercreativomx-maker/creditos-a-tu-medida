export type EstadoJubilacion = "jubilado" | "pensionado" | "ninguno";
export type Dependencia = "IMSS" | "ISSSTE" | "CFE" | "SNTE" | "PEMEX" | "otra";
export type SiNo = "si" | "no";

export interface LeadData {
  id: string;
  telefono?: string | null;
  nombre?: string | null;
  /** Solo true cuando el cliente proporcionó su nombre; nunca desde WhatsApp. */
  nombre_confirmado?: boolean;
  estatus?: EstadoJubilacion | null;
  dependencia?: Dependencia | null;
  dependencia_otra?: string | null;
  monto_solicitado?: string | null;
  credito_vigente?: SiNo | null;
  empresa_credito?: string | null;
  antiguedad_credito?: string | null;
  bot_activo?: boolean;
  cita_propuesta_fecha?: string | null;
  cita_propuesta_hora?: string | null;
  ultimo_mensaje_procesado?: string | null;
}

export type BotIntent =
  | "saludo"
  | "proporcionar_datos"
  | "pedir_direccion"
  | "pedir_cita"
  | "confirmar_cita"
  | "consultar_cita"
  | "reagendar"
  | "cancelar_cita"
  | "hablar_con_persona"
  | "pregunta_restringida"
  | "otro";

export interface ExtractedData {
  nombre: string | null;
  estatus: EstadoJubilacion | null;
  dependencia: Dependencia | null;
  dependencia_otra: string | null;
  monto_solicitado: string | null;
  credito_vigente: SiNo | null;
  empresa_credito: string | null;
  antiguedad_credito: string | null;
  fecha: string | null;
  hora: string | null;
}

export interface MessageAnalysis {
  intent: BotIntent;
  language: "es" | "en";
  extracted: ExtractedData;
  confirmation: boolean;
  sensitive_data_detected: boolean;
  needs_human: boolean;
  human_reason: string | null;
}

export interface AppointmentRecord {
  id: string;
  lead: string;
  fecha: string;
  slot_key: string;
  titulo?: string | null;
  notas?: string | null;
}

export interface AppointmentRepository {
  listForLocalDay(localDate: string): Promise<AppointmentRecord[]>;
  findFutureForLead(leadId: string, nowIso: string): Promise<AppointmentRecord | null>;
  create(input: Omit<AppointmentRecord, "id">): Promise<AppointmentRecord>;
  update(id: string, input: Partial<Omit<AppointmentRecord, "id" | "lead">>): Promise<AppointmentRecord>;
  delete(id: string): Promise<void>;
}

export interface LeadRepository {
  get(id: string): Promise<LeadData>;
  update(id: string, input: Partial<LeadData>): Promise<LeadData>;
  isLatestInboundMessage(leadId: string, messageId: string): Promise<boolean>;
}

export interface IncomingTurn {
  leadId: string;
  messageId: string;
  text: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  now?: Date;
}

export interface TurnResult {
  messages: string[];
  escalate: boolean;
  ignored?: "bot_inactive" | "obsolete_message";
  leadPatch?: Partial<LeadData>;
}

