import type PocketBase from "pocketbase";

/** La cookie aporta un token, nunca una identidad o rol confiables. */
export async function restoreVerifiedSession(pb: PocketBase, cookie: string): Promise<void> {
  pb.authStore.clear();
  if (!cookie) return;
  try {
    pb.authStore.loadFromCookie(`pb_auth=${cookie}`, "pb_auth");
    if (!pb.authStore.isValid) {
      pb.authStore.clear();
      return;
    }
    await pb.collection("users").authRefresh();
    if (!pb.authStore.isValid || !pb.authStore.record?.id) pb.authStore.clear();
  } catch {
    pb.authStore.clear();
  }
}
