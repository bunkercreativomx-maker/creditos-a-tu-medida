/**
 * Notificación opcional a Slack cuando entra un lead nuevo.
 * Si no hay SLACK_BOT_TOKEN / SLACK_CHANNEL configurados, no hace nada
 * (best-effort, no rompe el flujo del lead).
 */
export async function notifyNewLeadToSlack(payload: {
  nombre: string | null;
  telefono: string;
  origen: string;
  leadId: string;
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.SLACK_LEADS_CHANNEL || process.env.SLACK_HOME_CHANNEL;
  if (!token || !channel) return;

  const nombre = payload.nombre ? `${payload.nombre}` : "Cliente nuevo";
  const origenLabel = payload.origen === "whatsapp" ? "WhatsApp 💬" : "Formulario web 🌐";

  const text =
    `🆕 *Nuevo lead* — ${origenLabel}\n` +
    `*Cliente:* ${nombre}\n` +
    `*Teléfono:* ${payload.telefono}\n` +
    `<https://creditoatumedida.com/crm/leads/${payload.leadId}|Ver en el CRM>`;

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      console.warn("Slack notify:", json.error ?? "error");
    }
  } catch (err) {
    console.warn("Slack notify error:", (err as Error)?.message);
  }
}
