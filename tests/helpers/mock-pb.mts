// Adaptador PocketBase en memoria para probar `procesarTurnoBot` de punta a
// punta con el handler REAL (lib/turno.ts), sin duplicar su lógica. Implementa
// el subconjunto de la API que usa el turno: getList/getFullList/getOne/
// create/update, con filtros mínimos (`field = "value"`, `field ~ "value"`,
// `field = true`) y sort por un campo.
//
// Cada llamada queda registrada en `calls` para poder ASSERTear el efecto
// persistido (p.ej. "la cita se creó ANTES de enviar la confirmación").

export type MockRecord = Record<string, unknown> & { id: string };

type Collection = MockRecord[];

function evalFilter(rec: MockRecord, filter: string | undefined): boolean {
  if (!filter) return true;
  const parts = filter.split("&&").map((s) => s.trim());
  return parts.every((p) => {
    const m = p.match(/^\s*([\w.]+)\s*(=|~)\s*"([^"]*)"\s*$/);
    if (!m) return true; // filtro no soportado: no filtrar (mapa conservador)
    const [, field, op, value] = m;
    const recVal = rec[field];
    if (op === "=") return String(recVal ?? "") === value;
    if (op === "~") return String(recVal ?? "").includes(value);
    return true;
  });
}

export function makeMockPb(seed: Record<string, Record<string, unknown>[]> = {}) {
  const collections: Record<string, Collection> = {};
  const calls: { col: string; method: string; args: unknown[] }[] = [];
  let idCounter = 1000;

  for (const [name, rows] of Object.entries(seed)) {
    collections[name] = rows.map((r, i) => ({
      id: String(r.id ?? `seed-${i}`),
      ...r,
    }));
  }

  const record = (col: string) => ({
    async getList(page: number, perPage: number, opts?: Record<string, unknown>) {
      calls.push({ col, method: "getList", args: [page, perPage, opts] });
      const list = collections[col] ?? [];
      const filtered = list.filter((r) => evalFilter(r, opts?.filter as string));
      const sort = opts?.sort as string | undefined;
      let sorted = filtered;
      if (sort && sort.startsWith("-")) {
        const f = sort.slice(1);
        sorted = [...filtered].sort((a, b) => String(b[f]).localeCompare(String(a[f])));
      } else if (sort) {
        sorted = [...filtered].sort((a, b) => String(a[sort]).localeCompare(String(b[sort])));
      }
      const start = (Math.max(page, 1) - 1) * perPage;
      const items = sorted.slice(start, start + perPage);
      return { items: items.map((r) => ({ ...r })) };
    },
    async getFullList(opts?: Record<string, unknown>) {
      calls.push({ col, method: "getFullList", args: [opts] });
      const list = collections[col] ?? [];
      return list
        .filter((r) => evalFilter(r, opts?.filter as string))
        .map((r) => ({ ...r }));
    },
    async getOne(id: string) {
      calls.push({ col, method: "getOne", args: [id] });
      const found = (collections[col] ?? []).find((r) => r.id === id);
      if (!found) throw new Error(`404 ${col}/${id}`);
      return { ...found };
    },
    async create(data: Record<string, unknown>) {
      calls.push({ col, method: "create", args: [data] });
      const rec = { id: `rec-${idCounter++}`, ...data } as MockRecord;
      (collections[col] ??= []).push(rec);
      return { ...rec };
    },
    async update(id: string, data: Record<string, unknown>) {
      calls.push({ col, method: "update", args: [id, data] });
      const list = collections[col] ?? [];
      const idx = list.findIndex((r) => r.id === id);
      if (idx === -1) {
        // PocketBase real lanza 404 al actualizar un registro inexistente; el
        // adaptador no debe divergir (antes lo creaba y "tapaba" tests que
        // asumían conversaciones implícitas). Fiel al real.
        throw new Error(`404 ${col}/${id}`);
      }
      list[idx] = { ...list[idx], ...data } as MockRecord;
      return { ...list[idx] };
    },
    async delete(id: string) {
      calls.push({ col, method: "delete", args: [id] });
      const list = collections[col] ?? [];
      const idx = list.findIndex((r) => r.id === id);
      if (idx === -1) {
        throw new Error(`404 ${col}/${id}`);
      }
      const [removed] = list.splice(idx, 1);
      return { ...removed };
    },
  });

  return {
    collections,
    calls,
    pb: {
      collection(name: string) {
        return record(name);
      },
    },
  };
}

export type MockPb = ReturnType<typeof makeMockPb>;