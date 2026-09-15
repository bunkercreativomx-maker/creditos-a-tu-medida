// Idempotente. Sin --apply solo muestra el cambio; nunca imprime credenciales.
import PocketBase from "pocketbase";

const { NEXT_PUBLIC_POCKETBASE_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } = process.env;
if (!NEXT_PUBLIC_POCKETBASE_URL || !PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  throw new Error("Configure NEXT_PUBLIC_POCKETBASE_URL, PB_ADMIN_EMAIL y PB_ADMIN_PASSWORD en el entorno del servidor.");
}
const pb = new PocketBase(NEXT_PUBLIC_POCKETBASE_URL);
await pb.collection("_superusers").authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);
const collection = await pb.collections.getOne("leads");
const field = collection.fields.find((item) => item.name === "nombre_confirmado");
if (field && field.type !== "bool") throw new Error("nombre_confirmado ya existe con un tipo incompatible.");
if (field) {
  console.log("leads.nombre_confirmado ya existe. No se modificó nada.");
} else if (!process.argv.includes("--apply")) {
  console.log("Se agregará leads.nombre_confirmado (bool, opcional). No se borran ni se confirman nombres existentes. Use --apply para aplicar.");
} else {
  await pb.collections.update(collection.id, {
    fields: [...collection.fields, { name: "nombre_confirmado", type: "bool", required: false }],
  });
  const updated = await pb.collections.getOne("leads");
  if (!updated.fields.some((item) => item.name === "nombre_confirmado" && item.type === "bool")) {
    throw new Error("No se pudo verificar nombre_confirmado.");
  }
  console.log("leads.nombre_confirmado agregado y verificado.");
}
