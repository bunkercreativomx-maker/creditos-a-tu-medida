import { type NextRequest, NextResponse } from "next/server";

const APP_HOST = "app.creditoatumedida.com";

/**
 * Middleware de sesión: protege /crm redirigiendo a /crm/login si no hay
 * cookie de auth de PocketBase (`pb_auth`). La validación real del token
 * ocurre en los Server Components / Server Actions vía createServerClient.
 *
 * Además, en el subdominio `app.creditoatumedida.com` reescribe la raíz `/`
 * hacia `/crm` para que el CRM se sirva en la URL limpia sin el prefijo.
 */
export async function updateSession(request: NextRequest) {
  const { host, pathname } = request.nextUrl;
  const isAppHost = host === APP_HOST || host.startsWith(`${APP_HOST}:`);

  // En el subdominio app: la raíz y cualquier ruta no-"/crm" se sirven
  // reescribiendo hacia /crm (URL limpia, sin redirect).
  if (isAppHost && pathname !== "/crm" && !pathname.startsWith("/crm/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname === "/" ? "/crm" : `/crm${pathname}`;
    return NextResponse.rewrite(url);
  }

  const authCookie = request.cookies.get("pb_auth")?.value;
  const isCrmPath = pathname.startsWith("/crm");
  const isLogin = pathname === "/crm/login";

  if (isCrmPath && !isLogin && !authCookie) {
    const url = request.nextUrl.clone();
    // En el subdominio app, ir al login limpio (el rewrite lo mapea a /crm/login)
    url.pathname = isAppHost ? "/login" : "/crm/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next({ request });
}
