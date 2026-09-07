import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, ejecutarTool } from "./tools.js";
import { violaReglas, MENSAJE_ESCALAMIENTO } from "./guardrails.js";
import { construirContexto } from "./state.js";
import { DateTime } from "luxon";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  // Verifica el nombre exacto del flag en docs.claude.com antes de desplegar:
  // si está mal, no truena, silenciosamente te cae al caché de 5 minutos.
  defaultHeaders: { "anthropic-beta": "extended-cache-ttl-2025-04-11" },
});

const PRIMARIO = process.env.MODEL_PRIMARIO || "claude-haiku-4-5-20251001";
const FALLBACK = process.env.MODEL_FALLBACK || "claude-sonnet-5";

async function correr(modelo, ctx, historial) {
  const { tenant, lead } = ctx;
  const ahora = DateTime.now().setZone(tenant.timezone).setLocale("es")
    .toFormat("cccc d 'de' LLLL yyyy, HH:mm");

  const mensajes = [...historial];
  let texto = "";

  // Bucle de herramientas: máximo 5 vueltas por turno
  for (let i = 0; i < 5; i++) {
    const res = await anthropic.messages.create({
      model: modelo,
      max_tokens: 300,          // mensajes de WhatsApp, no ensayos
      temperature: 0.2,         // guion, no creatividad
      system: [
        {
          type: "text",
          text: tenant.systemPrompt,                    // FIJO → va primero → se cachea
          cache_control: { type: "ephemeral", ttl: "1h" },
        },
        { type: "text", text: construirContexto(lead, tenant, ahora) }, // VARIABLE → después
      ],
      messages: mensajes,
      tools: TOOLS,
    });

    texto = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    const usos = res.content.filter((b) => b.type === "tool_use");

    if (res.stop_reason !== "tool_use" || usos.length === 0) break;

    mensajes.push({ role: "assistant", content: res.content });
    const resultados = [];
    for (const u of usos) {
      let salida;
      try {
        salida = await ejecutarTool(u.name, u.input, ctx);
      } catch (e) {
        console.error("[tool] falló", u.name, e);
        salida = "Error al ejecutar. No inventes el resultado: escala a asesor.";
      }
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: String(salida) });
    }
    mensajes.push({ role: "user", content: resultados });
  }

  return texto;
}

// ── Reintento escalado: Haiku primero, Sonnet solo si Haiku falla ──
export async function generarRespuesta(ctx, historial) {
  let texto = await correr(PRIMARIO, ctx, historial);
  let modelo = "haiku";

  let motivo = violaReglas(texto, ctx.lead);
  if (motivo) {
    console.warn("[guardrail] haiku rechazado:", motivo, { conv: ctx.conversacion.id });
    texto = await correr(FALLBACK, ctx, historial);
    modelo = "sonnet";

    motivo = violaReglas(texto, ctx.lead);
    if (motivo) {
      console.error("[guardrail] sonnet también rechazado:", motivo);
      await ejecutarTool("escalar_a_asesor", { motivo: `guardrail:${motivo}` }, ctx);
      return { texto: MENSAJE_ESCALAMIENTO, modelo: "fallback" };
    }
  }

  return { texto, modelo };
}

