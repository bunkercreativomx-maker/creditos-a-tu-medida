import { cookies } from "next/headers";
import { createBaseClient } from "@/lib/pocketbase";

/**
 * Cliente PocketBase para Server Components y Server Actions.
 * Carga la sesión desde la cookie `pb_auth` y la refresca (valida) si es válida.
 * No escribimos cookies aquí: el middleware y el cliente del navegador se encargan.
 */
export async function createServerClient() {
  const pb = createBaseClient();

  const cookieStore = await cookies();
  const authCookie = cookieStore.get("pb_auth")?.value ?? "";

  if (authCookie) {
    pb.authStore.loadFromCookie(authCookie, "pb_auth");
    try {
      if (pb.authStore.isValid) {
        await pb.collection("users").authRefresh();
      }
    } catch {
      pb.authStore.clear();
    }
  }

  return pb;
}

/** Devuelve el usuario autenticado (o null) desde una sesión de servidor. */
export async function getServerUser(pb: Awaited<ReturnType<typeof createServerClient>>) {
  try {
    const model = pb.authStore.model;
    if (!model) return null;
    // model ya viene validado por authRefresh en createServerClient
    return model as unknown as {
      id: string;
      email: string;
      role?: string;
      full_name?: string;
      name?: string;
    };
  } catch {
    return null;
  }
}
