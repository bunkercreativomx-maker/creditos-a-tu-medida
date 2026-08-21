import PocketBase from "pocketbase";
import type { Database } from "@/lib/types";

/**
 * URL base de PocketBase (instancia pb-creditos).
 * - NEXT_PUBLIC_PB_URL: apunta al servidor donde corre el backend,
 *   p.ej. http://<IP-SERVIDOR>:8092 (o un dominio/túnel cuando se publique).
 * - Fallback 127.0.0.1:8092 para desarrollo local.
 */
export const PB_URL =
  process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8092";

/** Cliente PocketBase tipado. */
export type TypedPB = PocketBase & { collection: Database["collections"] };

/** Crea un cliente PocketBase "base" (sin sesión). */
export function createBaseClient() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  return pb;
}
