import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createBaseClient } from "@/lib/pocketbase";

export async function GET() {
  const out: Record<string, unknown> = { pb_url: process.env.NEXT_PUBLIC_PB_URL ?? "(fallback)" };
  const pb = createBaseClient();
  const cookieStore = await cookies();
  const pbAuthValue = cookieStore.get("pb_auth")?.value ?? "";
  out.has_cookie = Boolean(pbAuthValue);

  // Réplica EXACTA de createServerClient (el fix):
  if (pbAuthValue) {
    pb.authStore.loadFromCookie(`pb_auth=${pbAuthValue}`, "pb_auth");
    out.cookie_isValid = pb.authStore.isValid;
    try {
      if (pb.authStore.isValid) {
        await pb.collection("users").authRefresh();
        out.authRefresh = "OK";
        out.refresh_isValid = pb.authStore.isValid;
      }
    } catch (e) {
      out.authRefresh = "FALLO: " + (e as Error).message;
    }
  } else {
    out.cookie_isValid = "sin cookie";
  }

  try {
    const r = await pb.collection("leads").getList(1, 500, { sort: "-id" });
    out.leads = r.totalItems;
  } catch (e) {
    out.error = (e as Error).message;
  }
  return NextResponse.json(out);
}
