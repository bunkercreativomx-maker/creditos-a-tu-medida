/** Solo servicios Web Push conocidos; nunca hosts privados ni URLs arbitrarias. */
export function isAllowedPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || (url.port && url.port !== "443")) return false;
    return url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".notify.windows.com");
  } catch { return false; }
}

export function isPushKey(value: unknown, bytes: number): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+={0,2}$/.test(value) &&
    value.length <= 128 && Buffer.from(value, "base64url").length === bytes;
}

export function isSameOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(requestUrl).origin; }
  catch { return false; }
}
