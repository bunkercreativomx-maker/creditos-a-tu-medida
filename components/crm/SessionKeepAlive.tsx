"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/pocketbase-client";

/** Cada cuánto renovar la sesión mientras la app está abierta. */
const REFRESH_EVERY_MS = 6 * 60 * 60 * 1000; // 6 h

/**
 * Mantiene viva la sesión del asesor.
 *
 * El token de PocketBase (y la cookie `pb_auth`, cuyo vencimiento = vencimiento
 * del token) caducaba a los N días del login aunque el asesor usara el CRM a
 * diario, porque nadie lo renovaba en el navegador. Aquí se llama `authRefresh`
 * al abrir la app, al volver a primer plano y cada 6 h: PocketBase emite un
 * token nuevo y `createClient()` reescribe la cookie con el nuevo vencimiento.
 * Resultado: solo se pide login tras "Cerrar sesión" o tras no entrar en el
 * periodo completo del token.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    let running = false;
    let lastRun = 0;

    async function refresh() {
      // Evita martillar PB al cambiar de app seguido: máx. 1 vez cada 10 min.
      if (running || Date.now() - lastRun < 10 * 60 * 1000) return;
      running = true;
      lastRun = Date.now();
      try {
        const pb = createClient();
        if (!pb.authStore.isValid) return;
        await pb.collection("users").authRefresh();
      } catch (e) {
        // Si falla por red no hacemos nada (se reintenta luego). Si PB rechazó
        // el token, el siguiente render del servidor manda al login.
        console.error("SessionKeepAlive:", e);
      } finally {
        running = false;
      }
    }

    void refresh();
    const timer = setInterval(refresh, REFRESH_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
