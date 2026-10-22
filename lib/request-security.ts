export class RequestTooLarge extends Error {}

export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RequestTooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw new RequestTooLarge(); }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

export function isWebhookEnvelope(value: unknown): value is { id: string; event: string } {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.id === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(data.id) &&
    typeof data.event === "string" && /^[A-Za-z0-9_.:-]{1,100}$/.test(data.event);
}
