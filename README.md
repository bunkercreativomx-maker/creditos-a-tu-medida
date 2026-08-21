# Créditos a tu medida — Sitio + CRM + Bot WhatsApp

Sitio de captación, CRM de leads (roles admin/asesor) y bot de WhatsApp con IA, en alianza con
Financiera Fortaleza. Backend **PocketBase** auto-hospedado (instancia `pb-creditos`).

## Configuración inicial

1. Copia `.env.local.example` a `.env.local` y completa las llaves:
   - `NEXT_PUBLIC_PB_URL` — URL de la instancia PocketBase `pb-creditos` (p.ej. `http://<IP-SERVIDOR>:8092`, o el dominio/túnel público cuando se publique).
   - `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` — credenciales de superusuario de PocketBase (solo se usan en API routes de servidor: formulario web y webhook). Nunca exponer al cliente.
   - `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `ZERNIO_WHATSAPP_PROFILE_ID` — se obtienen al tramitar la cuenta de Zernio (requiere WhatsApp Business Account verificado con Meta).
   - `ANTHROPIC_API_KEY` — para el bot de IA.
   - `NEXT_PUBLIC_WHATSAPP_NUMBER` — número real de WhatsApp Business conectado (formato `52155XXXXXXXX`), usado en los botones "Escríbenos por WhatsApp" del sitio.

2. Instala dependencias y corre en desarrollo:
   ```bash
   npm install
   npm run dev
   ```

3. En PocketBase (`http://<IP-SERVIDOR>:8092/_/`), crea al primer usuario admin:
   registra un usuario (Users) y luego en su registro cambia `role` a `admin` — los usuarios
   nuevos se crean como `asesor` por defecto. Solo admins pueden cambiar roles.

4. Configura el webhook de Zernio apuntando a `https://tu-dominio.com/api/webhooks/zernio`, evento
   `message.received`, y copia el signing secret a `ZERNIO_WEBHOOK_SECRET`.

## Migración desde Supabase

Este proyecto se migró de Supabase a PocketBase (agosto 2026). Colecciones en `pb-creditos`:
`users` (auth, con campo `role`), `leads`, `conversations`, `messages`, `lead_notes`,
`processed_webhook_events`. Los documentos (INE, comprobante) son **file fields** de PocketBase
(no buckets de storage); sus URLs se firman con el token del registro.

Capa de datos: `lib/pocketbase*.ts` (client/server/admin/middleware) + `lib/types.ts`.
Reglas de acceso: `@request.auth.id != ""` para list/view/create/update (paridad: cualquier
usuario autenticado gestiona todos los leads); cambio de rol restringido a `role = "admin"`.

## Pendientes antes de publicar

- **Textos legales/regulatorios** (CAT, tasa de interés, avisos CONDUSEF) en `components/site/Footer.tsx`
  están marcados con `TODO` — deben confirmarse con Financiera Fortaleza antes de publicar, son cifras
  reguladas y no se inventaron.
- **Endpoint de envío de WhatsApp en `lib/zernio.ts`**: la ruta `/messages/send` es la mejor estimación
  a partir de la documentación pública de Zernio (no expone el path exacto). Verificar contra el API
  Reference del dashboard una vez tramitada la cuenta y ajustar si es necesario.
- **Cuentas externas pendientes de tramitar**: Meta Business + WhatsApp Business Account (WABA)
  verificado, cuenta Zernio con número conectado.

## Estructura

- `app/page.tsx` + `components/site/*` — sitio público de captación.
- `app/api/leads/route.ts` — recibe el formulario web, crea lead (`origen=web_form`).
- `app/api/webhooks/zernio/route.ts` — recibe mensajes de WhatsApp, corre el bot, responde.
- `lib/bot.ts` — bot de IA (Claude), reglas de negocio y escalamiento a humano.
- `lib/zernio.ts` — cliente de envío de WhatsApp + verificación de firma del webhook.
- `app/crm/*` — dashboard protegido (PocketBase auth): kanban de leads, detalle con conversación y notas, admin de usuarios.
- `lib/pocketbase*.ts` — clientes PocketBase (server components, client, admin/superuser, middleware).
