import PocketBase from "pocketbase";
import type { Database } from "@/lib/types";

/**
 * URL base de PocketBase (instancia pb-creditos).
 * - NEXT_PUBLIC_PB_URL: se define en Vercel (o .env.local en desarrollo).
 * - Fallback para PRODUCCIÓN: el túnel público del servidor (alcanzable desde
 *   cualquier navegador). Solo se usa 127.0.0.1:8092 en desarrollo local.
 * - v2: apunta al túnel público https://creditos-pb.bunkeragent.cloud
 */
export const PB_URL =
  process.env.NODE_ENV === "production"
    ? (process.env.NEXT_PUBLIC_PB_URL ?? "https://creditos-pb.bunkeragent.cloud")
    : (process.env.NEXT_PUBLIC_PB_URL ?? "http://127.0.0.1:8092");

/** Cliente PocketBase tipado. */
export type TypedPB = PocketBase & { collection: Database["collections"] };

/** Crea un cliente PocketBase "base" (sin sesión). */
export function createBaseClient() {
  const pb = new PocketBase(PB_URL);
  pb.autoCancellation(false);
  return pb;
}
