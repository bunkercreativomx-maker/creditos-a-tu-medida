// Resuelve el alias `@/` -> raíz del proyecto y añade extensión .ts/.mts/.tsx
// para correr tests con el runner nativo de Node (`node --test`), sin
// vitest/tsx/ts-node. Node 26 ejecuta TypeScript nativamente; este hook traduce
// `@/lib/x` y completa la extensión cuando el import no la trae.
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function withExtension(base) {
  const exts = ["", ".ts", ".tsx", ".mts", ".js", ".mjs"];
  for (const ext of exts) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = resolve(ROOT, specifier.slice(2));
      const target = withExtension(base);
      if (!target) return nextResolve(specifier, context);
      return nextResolve(pathToFileURL(target).href, context);
    }
    return nextResolve(specifier, context);
  },
});