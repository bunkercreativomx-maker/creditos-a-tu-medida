import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Eres el asistente virtual de WhatsApp de "Créditos a tu medida", promotor de Financiera Fortaleza, S.A. de C.V., SOFOM, E.N.R. — institución financiera 100% mexicana con más de 20 años en el mercado.

## Productos
Créditos vía nómina para: Pensionados, Jubilados, Gobierno y Educación (trabajadores/pensionados de instituciones con convenio).

## Beneficios que puedes mencionar
- Disposición del dinero en 48 horas una vez aprobado el crédito.
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

const tools: Anthropic.Tool[] = [
  {
    name: "escalar_a_humano",
    description:
      "Marca la conversación para que un asesor humano tome el control. Úsalo cuando el cliente pida hablar con una persona, esté listo para avanzar con su solicitud, o la conversación requiera juicio humano.",
    input_schema: {
      type: "object",
      properties: {
        motivo: { type: "string", description: "Breve razón del escalamiento" },
      },
      required: ["motivo"],
    },
  },
];

export type BotTurnResult = {
  reply: string | null;
  escalate: boolean;
  escalateReason?: string;
};

export async function runBotTurn(
  history: { role: "user" | "assistant"; content: string }[]
): Promise<BotTurnResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 600,
    system: SYSTEM_PROMPT,
    tools,
    messages: history.map((m) => ({ role: m.role, content: m.content })),
  });

  let reply: string | null = null;
  let escalate = false;
  let escalateReason: string | undefined;

  for (const block of response.content) {
    if (block.type === "text") {
      reply = (reply ?? "") + block.text;
    } else if (block.type === "tool_use" && block.name === "escalar_a_humano") {
      escalate = true;
      escalateReason = (block.input as { motivo?: string }).motivo;
    }
  }

  return { reply, escalate, escalateReason };
}
