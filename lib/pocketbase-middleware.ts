import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware de sesión: protege /crm redirigiendo a /crm/login si no hay
 * cookie de auth de PocketBase (`pb_auth`). La validación real del token
 * ocurre en los Server Components / Server Actions vía createServerClient.
 */
export async function updateSession(request: NextRequest) {
  const authCookie = request.cookies.get("pb_auth")?.value;
  const isCrmPath = request.nextUrl.pathname.startsWith("/crm");
  const isLogin = request.nextUrl.pathname === "/crm/login";

  if (isCrmPath && !isLogin && !authCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/crm/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
