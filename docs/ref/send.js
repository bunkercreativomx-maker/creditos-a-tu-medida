const VERSION = process.env.WA_GRAPH_VERSION || "v21.0";

export async function enviarTexto(tenant, para, texto) {
  const url = `https://graph.facebook.com/${VERSION}/${tenant.phoneNumberId}/messages`;

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenant.waToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: para,
      type: "text",
      text: { preview_url: true, body: texto },
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error("[wa:send] falló:", r.status, err);
    throw new Error(`WhatsApp ${r.status}`);
  }
  return r.json();
}

// Marca el mensaje como leído (las palomitas azules dan confianza al cliente)
export async function marcarLeido(tenant, messageId) {
  const url = `https://graph.facebook.com/${VERSION}/${tenant.phoneNumberId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenant.waToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    }),
  }).catch(() => {});
}

