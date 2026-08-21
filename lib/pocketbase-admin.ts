import { createBaseClient } from "@/lib/pocketbase";

let _adminToken: string | null = null;
let _adminTokenExpiry = 0;

/**
 * Cliente PocketBase con token de superusuario — BYPASSA reglas de acceso.
 * Solo usarlo en API routes de servidor (formulario web público, webhook de
 * WhatsApp). Nunca en componentes de cliente ni en el código autenticado del CRM.
 *
 * El token se cachea y refresca automáticamente antes de expirar.
 * Credenciales desde el entorno (PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD).
 */
export async function createAdminClient() {
  const pb = createBaseClient();

  const email = process.env.PB_ADMIN_EMAIL;
  const password = process.env.PB_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("Faltan PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD en el entorno");
  }

  // Refrescar si no hay token o está a menos de 60s de expirar
  if (!_adminToken || Date.now() > _adminTokenExpiry - 60_000) {
    const auth = await pb
      .collection("_superusers")
      .authWithPassword(email, password);
    _adminToken = auth.token;
    // PB tokens: exp en el payload JWT
    try {
      const payload = JSON.parse(
        Buffer.from(auth.token.split(".")[1], "base64url").toString()
      );
      _adminTokenExpiry = (payload.exp ?? 0) * 1000;
    } catch {
      _adminTokenExpiry = Date.now() + 3 * 60 * 60 * 1000; // fallback 3h
    }
  }

  pb.authStore.save(_adminToken, null);
  return pb;
}
