// Tipos del backend PocketBase (pb-creditos).
// Cada colección de PB devuelve registros con `id`, `created`, `updated`
// más los campos definidos en el schema. Los campos file almacenan el
// nombre de archivo; la URL se obtiene con pb.files.getURL(record, campo).

export type LeadStatus =
  | "nuevo"
  | "contactado"
  | "en_seguimiento"
  | "documentos"
  | "cerrado_ganado"
  | "cerrado_perdido";

export type LeadOrigen = "web_form" | "whatsapp";
export type TipoCredito = "nuevo" | "renovacion";
export type Genero = "masculino" | "femenino";
export type EstadoCivil = "soltero" | "casado" | "divorciado" | "viudo" | "union_libre";
export type MensajeRemitente = "cliente" | "bot" | "asesor";
export type UserRole = "admin" | "asesor";

/** Registro de la colección `users` (auth). */
export type PbUser = {
  id: string;
  email: string;
  name?: string;
  full_name?: string;
  phone?: string;
  role: UserRole;
  created: string;
  updated: string;
};

/** Registro de la colección `leads`. */
export type PbLead = {
  id: string;
  nombre: string | null;
  apellido: string | null;
  telefono: string;
  email: string | null;
  fecha_nacimiento: string | null;
  lugar_nacimiento: string | null;
  genero: Genero | null;
  estado_civil: EstadoCivil | null;
  curp: string | null;
  rfc: string | null;
  nss: string | null;
  institucion: string | null;
  tipo_credito: TipoCredito | null;
  monto_aproximado: string | null;
  banco: string | null;
  clabe: string | null;
  producto_interes: string | null;
  origen: LeadOrigen;
  status: LeadStatus;
  asignado_a: string | null;
  vencimiento_documentos: string | null;
  // Campos file (documentos) — guardan el nombre del archivo en PB
  ine_frente: string | null;
  ine_reverso: string | null;
  comprobante_domicilio: string | null;
  created: string;
  updated: string;
  /** Token de firma del registro (PocketBase) para URLs de archivo firmadas. */
  token?: string;
};

/** Registro de la colección `conversations`. */
export type PbConversation = {
  id: string;
  lead: string;
  telefono: string;
  canal: string | null;
  bot_activo: boolean;
  created: string;
  updated: string;
};

/** Registro de la colección `messages`. */
export type PbMessage = {
  id: string;
  conversation: string;
  remitente: MensajeRemitente;
  contenido: string;
  created: string;
  updated: string;
};

/** Registro de la colección `lead_notes`. */
export type PbLeadNote = {
  id: string;
  lead: string;
  autor: string | null;
  nota: string;
  created: string;
  updated: string;
};

/** Registro de la colección `lead_audit` (historial del lead). */
export type PbLeadAudit = {
  id: string;
  lead: string;
  actor: string | null;
  accion: string;
  detalle: string | null;
  created: string;
  updated: string;
};

// ---- Aliases de compatibilidad (mantienen nombres usados por el código) ----
export type Lead = PbLead;
export type LeadInsert = Partial<PbLead> & { telefono: string; origen: LeadOrigen };
export type Conversation = PbConversation;
export type Message = PbMessage;
export type LeadNote = PbLeadNote;
export type Profile = PbUser;

/** Registro de la colección `financieras`. */
export type PbFinanciera = {
  id: string;
  nombre: string;
  activa: boolean;
  created: string;
  updated: string;
};

export type OperacionStatus = "pendiente" | "en_proceso" | "aprobado" | "finalizado" | "no_cumple";
export type OperacionTipo = "pensionado" | "jubilado" | "jubilado_issste" | "snt8" | "sector_salud";

/** Registro de la colección `operaciones` (tablero de financieras por lead). */
export type PbOperacion = {
  id: string;
  lead: string;
  financiera: string | null;
  monto_prestado: number | null;
  comision: number | null;
  status: OperacionStatus | null;
  comentarios: string | null;
  tipo: OperacionTipo | null;
  fecha_desembolso: string | null;
  fecha_vencimiento: string | null;
  plazo_meses: number | null;
  created: string;
  updated: string;
};

export type CitaTipo = "llamada" | "cita" | "seguimiento" | "documentos";

/** Registro de la colección `citas` (calendario). */
export type PbCita = {
  id: string;
  lead: string | null;
  titulo: string | null;
  fecha: string;
  tipo: CitaTipo | null;
  asignado_a: string | null;
  notas: string | null;
  created: string;
  updated: string;
};

/** Estructura del cliente PocketBase tipado para conveniencia de lectura. */
export type Database = {
  collections: Record<string, unknown>;
};
