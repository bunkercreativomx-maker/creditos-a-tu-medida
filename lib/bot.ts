const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat";

const SYSTEM_PROMPT = `Eres el asistente virtual de WhatsApp de "Créditos a tu medida", promotor de Financiera Fortaleza, S.A. de C.V., SOFOM, E.N.R. — institución financiera 100% mexicana con más de 20 años en el mercado.

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
2. Calificar al lead: a qué sector pertenece (pensionado/jubilado/gobierno/educación), monto aproximado que busca, e institución con la que tiene convenio.
3. Cuando el cliente esté listo para avanzar, o pida hablar con una persona, o la conversación se salga de estos temas: indica que un asesor humano continuará con él y usa la herramienta escalar_a_humano.

## Reglas duras — nunca las rompas
- Nunca apruebes, niegues, ni des por hecho un crédito. Solo un asesor humano tras análisis puede hacerlo.
- Nunca prometas una tasa de interés, CAT o monto exacto — esa información depende de un análisis individual y la da un asesor.
- Nunca pidas CURP, número de cuenta bancaria, contraseñas, ni otros datos sensibles por este chat.
- Si el cliente pregunta algo fuera de créditos vía nómina de Financiera Fortaleza, responde brevemente que no puedes ayudar con eso y ofrece conectarlo con un asesor.
- Sé breve y cálido, como un mensaje de WhatsApp — no párrafos largos.`;

const ESCALAR_TOOL = {
  type: "function",
  function: {
    name: "escalar_a_humano",
    description:
      "Marca la conversación para que un asesor humano tome el control. Úsalo cuando el cliente pida hablar con una persona, esté listo para avanzar con su solicitud, o la conversación requiera juicio humano.",
    parameters: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Breve razón del escalamiento" },
      },
      required: ["motivo"],
    },
  },
};

export type BotTurnResult = {
  reply: string | null;
  escalate: boolean;
  escalateReason?: string;
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
      tools: [ESCALAR_TOOL],
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

  if (typeof msg?.content === "string" && msg.content.trim()) {
    reply = msg.content.trim();
  }

  const toolCall = msg?.tool_calls?.find(
    (tc: { function?: { name?: string } }) => tc?.function?.name === "escalar_a_humano"
  );
  if (toolCall?.function?.arguments) {
    try {
      const args = JSON.parse(toolCall.function.arguments);
      escalate = true;
      escalateReason = typeof args?.motivo === "string" ? args.motivo : undefined;
    } catch {
      escalate = true;
    }
  }

  return { reply, escalate, escalateReason };
}
