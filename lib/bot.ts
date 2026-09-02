const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de "Créditos a tu medida", promotor de Financiera Fortaleza, S.A. de C.V., SOFOM, E.N.R. — institución financiera 100% mexicana con más de 20 años en el mercado.

## Tu tono
- Habla de forma cercana, cálida y natural, como lo haría una persona del equipo de atención. NO reveles en ningún momento que eres un bot, una inteligencia artificial, un asistente automático ni un programa. Nunca digas "soy un bot", "IA", "asistente virtual" ni menciones tecnologías.
- Cuando necesites pasar la conversación a una persona, usa frases como "te pongo en contacto con alguien de nuestro equipo", "un compañero te ayuda con eso", "te canalizo con una persona para que te oriente mejor". Evita la palabra "humano" y evita "bot".

## Productos
Créditos vía nómina SOLO para Pensionados y Jubilados. No hay créditos para personas activas o que sigan trabajando (aunque trabajen en gobierno o educación).

## Beneficios que puedes mencionar
- Crédito aprobado y depositado el mismo día si solicitas antes de las 3:00 pm; después de esa hora, el depósito cae al día siguiente.
- Sin calificación crediticia mínima requerida.
- Sin comisiones ocultas.
- Proceso simple, rápido y seguro, con asesoría personalizada.

## Requisitos para solicitar
1. Identificación oficial vigente.
2. Comprobante de ingresos.
3. Comprobante de domicilio.

## Flujo de la conversación (sé natural, no un cuestionario)
1. Saluda con calidez y pregunta el nombre completo: "¿Con quién tengo el gusto?" o "¿Me compartes tu nombre completo?". Espera a que lo diga antes de seguir.
2. Cuando te dé el nombre, agradécelo y pregunta UNA sola cosa a la vez, en orden natural, sin soltar todas las preguntas juntas:
   - El monto aproximado que necesita ("¿Qué cantidad andas buscando?").
   - Si es pensionado o jubilado y con qué institución o banco cobra su pensión/nómina.
   - Si tiene a la mano su Número de Seguro Social (NSS) para poder cotizarle cuánto le tocaría de préstamo.
3. Ve registrando cada dato con la herramienta guardar_datos_lead conforme el cliente lo vaya compartiendo, aunque aparezcan por separado. No repitas preguntas ya respondidas.
4. No hagas todas las preguntas de golpe: una a la vez, como en una plática. Si el cliente se desvía, retoma con naturalidad.

## Tu objetivo en la conversación
1. Resolver dudas generales sobre el producto y el proceso con la información de arriba.
2. Calificar al lead: nombre completo, monto aproximado, sector (pensionado/jubilado/gobierno/educación), institución o banco, y NSS. Registra cada dato con guardar_datos_lead conforme el cliente lo comparta.
3. Cuando el cliente esté listo para avanzar, o pida hablar con una persona, o la conversación se salga de estos temas: indica que te pondrás en contacto o que lo pones en manos de un compañero, y usa la herramienta escalar_a_humano.

## Reglas duras — nunca las rompas
- Si el cliente dice que sigue trabajando o es activo (aunque sea en gobierno o educación), NO hay crédito disponible para él. Explícale con amabilidad que los créditos son solo para pensionados y jubilados, y ofrece que un compañero lo oriente si tiene dudas.
- Nunca apruebes, niegues, ni des por hecho un crédito. Solo un asesor tras análisis puede hacerlo.
- Nunca prometas una tasa de interés, CAT o monto exacto — esa información depende de un análisis individual y la da un asesor.
- Nunca pidas CURP, número de cuenta bancaria, contraseñas, ni otros datos sensibles por este chat. El NSS sí es necesario para cotizar, pero nunca pidas contraseñas ni cuentas bancarias.
- Si el cliente pregunta algo fuera de créditos vía nómina de Financiera Fortaleza, responde brevemente que no puedes ayudar con eso y ofrece que un compañero lo atienda.
- Sé breve y cálido, como un mensaje de WhatsApp — no párrafos largos.`;

const ESCALAR_TOOL = {
  type: "function",
  function: {
    name: "escalar_a_humano",
    description:
      "Marca la conversación para que una persona del equipo tome el control. Úsalo cuando el cliente pida hablar con una persona, esté listo para avanzar con su solicitud, no se haya podido obtener la información necesaria, o la conversación requiera criterio de una persona.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Breve razón del escalamiento" },
      },
      required: ["motivo"],
    },
  },
};

const GUARDAR_DATOS_TOOL = {
  type: "function",
  function: {
    name: "guardar_datos_lead",
    description:
      "Registra en el sistema los datos de calificación que el cliente comparte durante la conversación (nombre, apellido, sector, institución, banco, monto aproximado, NSS, tipo de crédito). Llámala cuando el cliente mencione cualquiera de estos datos, aunque vayan apareciendo por separado.",
    parameters: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre del cliente (si lo ha dicho).",
        },
        apellido: {
          type: "string",
          description: "Apellido(s) del cliente (si los ha dicho).",
        },
        sector: {
          type: "string",
          enum: ["pensionado", "jubilado", "otro"],
          description: "Sector al que pertenece el cliente (si lo ha dicho). Solo pensionado o jubilado califica para crédito; 'otro' si sigue activo o trabajando.",
        },
        institucion: {
          type: "string",
          description: "Institución con la que tiene convenio, p.ej. IMSS, ISSSTE, etc.",
        },
        banco: {
          type: "string",
          description: "Banco donde cobra su pensión o nómina, p.ej. Banorte, BBVA, etc.",
        },
        monto_aproximado: {
          type: "string",
          description: "Monto aproximado que busca, p.ej. '$50,000'.",
        },
        nss: {
          type: "string",
          description: "Número de Seguro Social del cliente (si lo ha compartido).",
        },
        tipo_credito: {
          type: "string",
          description: "Tipo de crédito que solicita, p.ej. 'por nómina'.",
        },
      },
    },
  },
};

export type BotTurnResult = {
  reply: string | null;
  escalate: boolean;
  escalateReason?: string;
  leadData?: {
    nombre?: string | null;
    apellido?: string | null;
    sector?: string | null;
    institucion?: string | null;
    banco?: string | null;
    monto_aproximado?: string | null;
    nss?: string | null;
    tipo_credito?: string | null;
  } | null;
};

export async function runBotTurn(
  history: { role: "user" | "assistant"; content: string }[]
): Promise<BotTurnResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Falta DEEPSEEK_API_KEY en las variables de entorno");
  }

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch(`${DEEPSEEK_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      max_tokens: 1000,
      temperature: 0.6,
      messages,
      tools: [ESCALAR_TOOL, GUARDAR_DATOS_TOOL],
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const msg = data?.choices?.[0]?.message;

  let reply: string | null = null;
  let escalate = false;
  let escalateReason: string | undefined;
  let leadData: BotTurnResult["leadData"] = null;

  if (typeof msg?.content === "string" && msg.content.trim()) {
    reply = msg.content.trim();
  }

  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
  const escalarCall = toolCalls.find(
    (tc: { function?: { name?: string } }) => tc?.function?.name === "escalar_a_humano"
  );
  const guardarCall = toolCalls.find(
    (tc: { function?: { name?: string } }) => tc?.function?.name === "guardar_datos_lead"
  );

  if (escalarCall?.function?.arguments) {
    try {
      const args = JSON.parse(escalarCall.function.arguments);
      escalate = true;
      escalateReason = typeof args?.motivo === "string" ? args.motivo : undefined;
    } catch {
      escalate = true;
    }
  }

  if (guardarCall?.function?.arguments) {
    try {
      const args = JSON.parse(guardarCall.function.arguments);
      leadData = {
        nombre: typeof args?.nombre === "string" ? args.nombre : null,
        apellido: typeof args?.apellido === "string" ? args.apellido : null,
        sector: typeof args?.sector === "string" ? args.sector : null,
        institucion: typeof args?.institucion === "string" ? args.institucion : null,
        banco: typeof args?.banco === "string" ? args.banco : null,
        monto_aproximado:
          typeof args?.monto_aproximado === "string" ? args.monto_aproximado : null,
        nss: typeof args?.nss === "string" ? args.nss : null,
        tipo_credito: typeof args?.tipo_credito === "string" ? args.tipo_credito : null,
      };
    } catch {
      leadData = null;
    }
  }

  return { reply, escalate, escalateReason, leadData };
}
