const { default: PocketBase } = await import("pocketbase");

const PB_URL = "https://creditos-pb.bunkeragent.cloud";
const pb = new PocketBase(PB_URL);
await pb.collection("users").authWithPassword("asesor.demo@creditos.app", "DemoPass123!");
console.log("autenticado:", pb.authStore.model.email);

const cookieStr = pb.authStore.exportToCookie({ httpOnly: false, sameSite: "lax", path: "/" }, "pb_auth");
console.log("cookie (primeros 60):", cookieStr.slice(0, 60));

const pb2 = new PocketBase(PB_URL);
pb2.authStore.loadFromCookie(cookieStr, "pb_auth");
console.log("server loadFromCookie isValid:", pb2.authStore.isValid);
if (pb2.authStore.isValid) {
  try {
    await pb2.collection("users").authRefresh();
    console.log("authRefresh OK, isValid tras refresh:", pb2.authStore.isValid);
  } catch (e) {
    console.log("authRefresh FALLO:", e.message);
  }
  const r = await pb2.collection("leads").getList(1, 500, { sort: "-id" });
  console.log("server getList totalItems:", r.totalItems);
} else {
  console.log(">>> isValid FALSE => sin authRefresh => getList vacio (el bug)");
}
