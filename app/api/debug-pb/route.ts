import { NextRequest, NextResponse } from "next/server";
import { createBaseClient } from "@/lib/pocketbase";

export async function GET(req: NextRequest) {
  const out: Record<string, unknown> = { pb_url: process.env.NEXT_PUBLIC_PB_URL ?? "(fallback)" };
  const cookie = req.headers.get("cookie") ?? "";
  out.has_cookie = cookie.includes("pb_auth");
  try {
    const pb = createBaseClient();
    // Mismo flujo que createServerClient:
    const authCookie = cookie.split(";").find((c) => c.trim().startsWith("pb_auth="))?.trim().split("=").slice(1).join("=") ?? "";
    if (authCookie) {
      pb.authStore.loadFromCookie(authCookie, "pb_auth");
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
    const r = await pb.collection("leads").getList(1, 500, { sort: "-id" });
    out.leads = r.totalItems;
  } catch (e) {
    out.error = (e as Error).message;
  }
  return NextResponse.json(out);
}
