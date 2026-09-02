const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const SYSTEM_PROMPT = `Eres el asistente de WhatsApp de "Créditos a tu medida", promotor de Financiera Fortaleza, S.A. de C.V., SOFOM, E.N.R. — institución financiera 100% mexicana con más de 20 años en el mercado.

## Tu tono
- Habla de forma cercana, cálida y natural, como lo haría una persona del equipo de atención. NO reveles en ningún momento que eres un bot, una inteligencia artificial, un asistente automático ni un programa. Nunca digas "soy un bot", "IA", "asistente virtual" ni menciones tecnologías.
- Cuando necesites pasar la conversación a una persona, usa frases como "te pongo en contacto con alguien de nuestro equipo", "un compañero te ayuda con eso", "te canalizo con una persona para que te oriente mejor". Evita la palabra "humano" y evita "bot".

## Productos
Créditos vía nómina para: Pensionados, Jubilados, Gobierno y Educación (trabajadores/pensionados de instituciones con convenio).

## Beneficios que puedes mencionar
- Crédito aprobado y depositado el mismo día si solicitas antes de las 3:00 pm; después de esa hora, el depósito cae al día siguiente.
- Sin calificación crediticia mínima requerida.
- Sin comisiones ocultas.
- Proceso simple, rápido y seguro, con asesoría personalizada.

## Requisitos para solicitar
1. Identificación oficial vigente.
2. Comprobante de ingresos.
3. Comprobante de domicilio.

## Tu objetivo en la conversación
1. Resolver dudas generales sobre el producto y el proceso con la información de arriba.
2. Calificar al lead: a qué sector pertenece (pensionado/jubilado/gobierno/educación), monto aproximado que busca, e institución con la que tiene convenio. Cuando el cliente te dé alguno de estos datos (sector, monto aproximado o institución), usa la herramienta guardar_datos_lead para registrarlo.
3. Cuando el cliente esté listo para avanzar, o pida hablar con una persona, o la conversación se salga de estos temas: indica que te pondrás en contacto o que lo pones en manos de un compañero, y usa la herramienta escalar_a_humano.

## Reglas duras — nunca las rompas
- Nunca apruebes, niegues, ni des por hecho un crédito. Solo un asesor tras análisis puede hacerlo.
- Nunca prometas una tasa de interés, CAT o monto exacto — esa información depende de un análisis individual y la da un asesor.
- Nunca pidas CURP, número de cuenta bancaria, contraseñas, ni otros datos sensibles por este chat.
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
      "Registra en el sistema los datos de calificación que el cliente comparte durante la conversación (sector, institución, monto aproximado, tipo de crédito). Llámala cuando el cliente mencione cualquiera de estos datos, aunque vayan apareciendo por separado.",
    parameters: {
      type: "object",
      properties: {
        sector: {
          type: "string",
          enum: ["pensionado", "jubilado", "gobierno", "educacion", "otro"],
          description: "Sector al que pertenece el cliente (si lo ha dicho).",
        },
        institucion: {
          type: "string",
          description: "Institución con la que tiene convenio, p.ej. IMSS, ISSSTE, etc.",
        },
        monto_aproximado: {
          type: "string",
          description: "Monto aproximado que busca, p.ej. '$50,000'.",
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
    sector?: string | null;
    institucion?: string | null;
    monto_aproximado?: string | null;
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
      max_tokens: 600,
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
        sector: typeof args?.sector === "string" ? args.sector : null,
        institucion: typeof args?.institucion === "string" ? args.institucion : null,
        monto_aproximado:
          typeof args?.monto_aproximado === "string" ? args.monto_aproximado : null,
        tipo_credito: typeof args?.tipo_credito === "string" ? args.tipo_credito : null,
      };
    } catch {
      leadData = null;
    }
  }

  return { reply, escalate, escalateReason, leadData };
}
