import { type NextRequest, NextResponse } from "next/server";

const APP_HOST = "app.creditoatumedida.com";

/**
 * Middleware de sesión + enrutado por subdominio.
 *
 * En el subdominio `app.creditoatumedida.com` el CRM se sirve desde la raíz:
 * al entrar a `/` se redirige a `/crm` (y `/login` se mapea a `/crm/login`),
 * de modo que el subdominio app solo expone el CRM (nunca la landing pública).
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

  // ---- Enruta la raíz del subdominio app hacia el CRM ----
  if (isAppHost) {
    if (pathname === "/") {
      // Redirect (no rewrite): el rewrite interno de / → /crm no re-ejecuta
      // el middleware, así que la protección de auth se saltaría. Un redirect
      // genera un nuevo request y el middleware corre de nuevo con normalidad.
      const url = request.nextUrl.clone();
      url.pathname = "/crm";
      return NextResponse.redirect(url);
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
