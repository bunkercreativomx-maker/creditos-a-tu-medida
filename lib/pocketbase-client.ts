import { createBaseClient } from "@/lib/pocketbase";

/**
 * Cliente PocketBase para el navegador (Client Components).
 * Mantiene la sesión sincronizada con la cookie `pb_auth` para que el
 * middleware y los Server Components puedan leerla.
 */
export function createClient() {
  const pb = createBaseClient();

  if (typeof document !== "undefined") {
    // Cargar la cookie existente (si hay) al montar
    pb.authStore.loadFromCookie(document.cookie, "pb_auth");
    // Cada cambio de auth se refleja en la cookie → visible para el server
    pb.authStore.onChange(() => {
      document.cookie = pb.authStore.exportToCookie({
        // `expires` lo pone el SDK = vencimiento del token; SessionKeepAlive
        // renueva el token y con eso se extiende la cookie.
        httpOnly: false,
        secure: location.protocol === "https:",
        sameSite: "lax",
        secure: window.location.protocol === "https:",
        path: "/",
      }, "pb_auth");
    });
  }

  return pb;
}
