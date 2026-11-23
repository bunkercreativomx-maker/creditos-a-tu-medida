// Número de WhatsApp Business (formato internacional 52 + 10 dígitos).
export const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "526563748899";
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER}`;

export const SITE = {
  brand: "Créditos a tu medida",
  telefono: "656 374 8899",
  direccion: "Benjamin Franklin 3220, Int 22-D, Zona Pronaf 32315, Ciudad Juárez, Chihuahua",
  horario: "Lunes a Viernes: 9:00 am – 6:00 pm",
};

export const SECTORES = ["Pensionados", "Jubilados"];

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
      "¿Primera vez? Te ayudamos a solicitar tu crédito vía nómina ante la financiera, con asesoría de principio a fin y sin costo.",
    color: "emerald" as const,
  },
  {
    icon: "renew" as const,
    titulo: "Renovación de tu crédito",
    descripcion:
      "¿Ya tienes un crédito vía nómina? Te ayudamos a revisar si te conviene renovarlo y hacemos el trámite por ti.",
    color: "blue" as const,
  },
];

export const BENEFICIOS = [
  {
    icon: "calendarPay" as const,
    titulo: "Depósito el mismo día*",
        descripcion:
          "*Si inicias tu trámite antes de las 3:00 pm y la financiera aprueba tu crédito, el depósito puede ser el mismo día; si no, al día hábil siguiente.",
  },
  {
    icon: "noGuarantee" as const,
    titulo: "Asesoría sin costo",
    descripcion: "No te cobramos por asesorarte ni por hacer tu trámite.",
  },
  {
    icon: "noPawn" as const,
    titulo: "Te explicamos todo",
    descripcion: "La financiera te entrega tu contrato con todas las condiciones y un asesor te lo explica antes de firmar.",
  },
  {
    icon: "shield" as const,
    titulo: "Más de 8 años asesorando",
    descripcion: "Empresa 100% mexicana. No estamos afiliados al IMSS, ISSSTE, CFE, Pemex ni al SNTE.",
  },
  {
    icon: "fast" as const,
    titulo: "Asesoría personalizada",
    descripcion: "Un asesor te acompaña en todo el proceso, de principio a fin.",
  },
  {
    icon: "renew" as const,
    titulo: "Trato cercano",
    descripcion: "Procesos ágiles pensados para pensionados y jubilados.",
  },
];

export const PROCESO = [
  { icon: "headset" as const, titulo: "Contacto con el cliente", descripcion: "Nos escribes por WhatsApp o llenas el formulario." },
  { icon: "checklist" as const, titulo: "Análisis y documentos", descripcion: "Revisamos tu caso y armamos tu expediente para la financiera." },
  { icon: "signature" as const, titulo: "Firma de papelería", descripcion: "Firmas tu contrato directamente con la financiera." },
  { icon: "cashDelivery" as const, titulo: "Depósito", descripcion: "La financiera deposita tu crédito; si iniciaste antes de las 3:00 pm y se aprueba, puede ser el mismo día." },
];
