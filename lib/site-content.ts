// TODO: reemplazar por el número real de WhatsApp Business conectado en Zernio.
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "5215500000000";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SITE = {
  brand: "Créditos a tu medida",
  financiera: "Financiera Fortaleza, S.A. de C.V., SOFOM, E.N.R.",
  telefono: "55 4744 0494",
  direccion: "Sierra Gamón 120, Piso 7, Int. 701 y 702, Col. Lomas de Chapultepec 1ra Sección, Ciudad de México",
  horario: "Lunes a Viernes: 9:00 am – 6:00 pm",
};

export const SECTORES = ["Pensionados", "Jubilados", "Gobierno", "Educación"];

export const GENEROS = [
  { value: "masculino", label: "Masculino" },
  { value: "femenino", label: "Femenino" },
];

export const ESTADOS_CIVILES = [
  { value: "soltero", label: "Soltero(a)" },
  { value: "casado", label: "Casado(a)" },
  { value: "divorciado", label: "Divorciado(a)" },
  { value: "viudo", label: "Viudo(a)" },
  { value: "union_libre", label: "Unión Libre" },
];

export const TIPOS_CREDITO_OPCIONES = [
  { value: "nuevo", label: "Crédito Nuevo" },
  { value: "renovacion", label: "Renovación" },
  { value: "compra", label: "Compra" },
];

export const MONTOS_APROXIMADOS = [
  "Menos de $10,000",
  "$10,000 - $30,000",
  "$30,000 - $60,000",
  "$60,000 - $100,000",
  "Más de $100,000",
];

export const BANCOS = [
  "BBVA",
  "Santander",
  "Banorte",
  "Citibanamex",
  "HSBC",
  "Scotiabank",
  "Banco Azteca",
  "BanCoppel",
  "Inbursa",
  "Banco del Bienestar",
  "Otro",
];

export const REQUISITOS = [
  "Identificación oficial vigente",
  "Comprobante de ingresos",
  "Comprobante de domicilio",
];

export const TIPOS_CREDITO = [
  {
    icon: "cashDelivery" as const,
    titulo: "Crédito nuevo",
    descripcion:
      "¿Primera vez con nosotros? Solicita tu crédito vía nómina con un proceso simple y asesoría personalizada de principio a fin.",
    color: "emerald" as const,
  },
  {
    icon: "renew" as const,
    titulo: "Renovación de tu crédito",
    descripcion:
      "¿Ya eres cliente? Renueva con mejores beneficios: paga menos al mes y recibe dinero extra en el proceso.",
    color: "blue" as const,
  },
];

export const BENEFICIOS = [
  {
    icon: "calendarPay" as const,
    titulo: "Dinero en 48 horas",
    descripcion: "Una vez aprobado tu crédito, recibes el dinero en 48 horas.",
  },
  {
    icon: "noGuarantee" as const,
    titulo: "Sin calificación mínima",
    descripcion: "No necesitas historial crediticio perfecto para solicitar.",
  },
  {
    icon: "noPawn" as const,
    titulo: "Sin comisiones ocultas",
    descripcion: "Procesos simples, rápidos y seguros, sin sorpresas.",
  },
  {
    icon: "shield" as const,
    titulo: "20+ años en el mercado",
    descripcion: "Respaldados por Financiera Fortaleza, 100% mexicana.",
  },
  {
    icon: "fast" as const,
    titulo: "Asesoría personalizada",
    descripcion: "Un asesor te acompaña en todo el proceso, de principio a fin.",
  },
  {
    icon: "renew" as const,
    titulo: "Trato cercano",
    descripcion: "Procesos ágiles pensados para pensionados y trabajadores con convenio.",
  },
];

export const PROCESO = [
  { icon: "headset" as const, titulo: "Contacto con el cliente", descripcion: "Nos escribes por WhatsApp o llenas el formulario." },
  { icon: "checklist" as const, titulo: "Análisis y documentos", descripcion: "Revisamos tu caso y recolectamos tus documentos." },
  { icon: "signature" as const, titulo: "Firma de papelería", descripcion: "Firmas tu contrato de forma simple y segura." },
  { icon: "cashDelivery" as const, titulo: "Entrega del crédito", descripcion: "Recibes tu dinero en 48 horas tras la aprobación." },
];
