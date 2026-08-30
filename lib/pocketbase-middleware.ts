import { type NextRequest, NextResponse } from "next/server";

const APP_HOST = "app.creditoatumedida.com";

/**
 * Middleware de sesión + enrutado por subdominio.
 *
 * En el subdominio `app.creditoatumedida.com` el CRM se sirve en la raíz con
 * URL limpia (sin `/crm`): la raíz `/` y cualquier ruta que no empiece por
 * `/crm` se reescriben internamente hacia `/crm...`.
 *
 * En AMBOS hosts se protege el CRM: sin cookie `pb_auth` válida se redirige
 * al login (la validación real del token ocurre en los Server Components).
 */
export async function updateSession(request: NextRequest) {
  const { host, pathname } = request.nextUrl;
  const isAppHost = host === APP_HOST || host.startsWith(`${APP_HOST}:`);

  const authCookie = request.cookies.get("pb_auth")?.value;
  const authed = Boolean(authCookie);

  const isCrmPath = pathname === "/crm" || pathname.startsWith("/crm/");
  const isLoginPath = pathname === "/crm/login" || (isAppHost && pathname === "/login");

  // ---- Protección de autenticación (aplica a ambos hosts) ----
  // Cualquier ruta del CRM que no sea el login exige sesión.
  if (isCrmPath && !isLoginPath && !authed) {
    const url = request.nextUrl.clone();
    url.pathname = isAppHost ? "/login" : "/crm/login";
    return NextResponse.redirect(url);
  }

  // ---- Reescribe la raíz del subdominio app hacia el CRM (URL limpia) ----
  if (isAppHost) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/crm";
      const res = NextResponse.redirect(url);
      res.headers.set("x-debug-host", host);
      res.headers.set("x-debug-ishost", String(isAppHost));
      return res;
    }
    // /login en app → /crm/login (para que la página del login cargue)
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/crm/login";
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next({ request });
}
