const PocketBase = require("pocketbase");
const fetch = require("node-fetch"); // maybe not present; try global fetch

(async () => {
  const PB_URL = "https://creditos-pb.bunkeragent.cloud";
  const pb = new PocketBase(PB_URL);
  await pb.collection("users").authWithPassword("asesor.demo@creditos.app", "DemoPass123!");
  console.log("autenticado:", pb.authStore.model.email);

  // Exportar cookie exactamente como el cliente lo hace
  const cookieStr = pb.authStore.exportToCookie({
    httpOnly: false, sameSite: "lax", path: "/",
  }, "pb_auth");
  console.log("cookie exportada (primeros 80):", cookieStr.slice(0, 80));

  // Simular el server: cargar desde cookie
  const pb2 = new PocketBase(PB_URL);
  pb2.authStore.loadFromCookie(cookieStr, "pb_auth");
  console.log("server loadFromCookie isValid:", pb2.authStore.isValid);
  if (pb2.authStore.isValid) {
    try {
      await pb2.collection("users").authRefresh();
      console.log("server authRefresh OK, isValid tras refresh:", pb2.authStore.isValid);
    } catch (e) {
      console.log("server authRefresh FALLO:", e.message);
    }
    const r = await pb2.collection("leads").getList(1, 500, { sort: "-id" });
    console.log("server getList totalItems:", r.totalItems);
  } else {
    console.log(">>> isValid FALSE => no authRefresh => getList vacio (el bug)");
  }
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
