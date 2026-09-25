import { cookies } from "next/headers";
import { createBaseClient } from "@/lib/pocketbase";
import { restoreVerifiedSession } from "@/lib/verified-session";

/**
 * Cliente PocketBase para Server Components y Server Actions.
 * Carga la sesión desde la cookie `pb_auth` y la refresca (valida) si es válida.
 * No escribimos cookies aquí: el middleware y el cliente del navegador se encargan.
 */
export async function createServerClient() {
  const pb = createBaseClient();

  const cookieStore = await cookies();
  const pbAuthValue = cookieStore.get("pb_auth")?.value ?? "";

  await restoreVerifiedSession(pb, pbAuthValue);

  return pb;
}

/** Las acciones del CRM exigen sesión verificada, además de las reglas de PB. */
export async function requireServerClient() {
  const pb = await createServerClient();
  if (!pb.authStore.isValid || !pb.authStore.record?.id) throw new Error("No autenticado");
  return pb;
}

/** Devuelve el usuario autenticado (o null) desde una sesión de servidor. */
export async function getServerUser(pb: Awaited<ReturnType<typeof createServerClient>>) {
  try {
    const model = pb.authStore.model;
    if (!pb.authStore.isValid || !model) return null;
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
