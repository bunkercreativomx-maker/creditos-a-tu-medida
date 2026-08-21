import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/pocketbase-middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/crm/:path*"],
};
