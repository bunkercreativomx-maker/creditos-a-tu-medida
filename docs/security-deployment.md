# Activación de las correcciones de seguridad

La revisión encontró secretos en el historial público. Retirarlos de los archivos actuales no los revoca. No copiar valores antiguos del historial ni volver a utilizarlos.

## Antes de desplegar

1. **PocketBase:** cambiar la contraseña de la cuenta administrativa afectada y actualizar `PB_ADMIN_PASSWORD` en todos los servicios que la usan. Revisar sesiones/tokens administrativos y revocarlos según la versión instalada. Revisar accesos recientes y cuentas administrativas; no se comprobó desde esta revisión si la credencial anterior seguía vigente o si hubo accesos indebidos.
2. **Notificaciones:** generar un nuevo par VAPID en el servidor. Configurar `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT` solo en el servidor y `NEXT_PUBLIC_VAPID_PUBLIC_KEY` con la clave pública correspondiente. Nunca publicar la privada. La clave pública se incorpora al construir la aplicación: requiere un nuevo build.
3. Revisar las suscripciones push existentes y retirar las que no pertenezcan al equipo. Los asesores deberán abrir de nuevo el CRM para registrar su suscripción con la clave pública nueva. El cliente renueva su suscripción cuando detecta el cambio. Los dispositivos que no vuelvan a abrirlo no se migran solos.
4. Guardar respaldo de configuración y datos; conservar la versión anterior para revertir código. Si se revierte, **no restaurar claves comprometidas**.

## Validar y desplegar

```sh
npm ci --ignore-scripts
npm audit --audit-level=high
npx next typegen
npm run typecheck
npm test
npm run build
```

Desplegar mediante el proceso habitual. Los nuevos envíos push requieren las variables VAPID; si faltan, se omiten los envíos y se conservan las suscripciones (no se borran por un fallo de configuración).

Verificar en una cuenta de prueba:

- Sin sesión o con cookie inválida no se pueden ejecutar acciones del CRM ni registrar notificaciones.
- Un asesor puede iniciar sesión y activar sus notificaciones desde el CRM.
- Las suscripciones usan HTTPS y proveedores permitidos: Google/FCM, Mozilla, Apple o Windows. Si se requiere otro proveedor legítimo, revisar y añadir su host explícitamente; no abrir acceso a cualquier URL.
- Los audios de WhatsApp siguen transcribiéndose a través del endpoint autenticado de Zernio. Se rechazan URLs arbitrarias, redirecciones y audios de más de 25 MiB.
- Webhooks con firma incorrecta o estructura inválida se rechazan; los eventos válidos siguen procesándose.

## Pendientes de infraestructura

- Auditar reglas de PocketBase para cada rol y los permisos de archivos adjuntos (INE, comprobantes), además de crear/editar/borrar registros. No confiar solo en ocultar botones del CRM.
- Mantener `push_subscriptions` y `webhook_debug` inaccesibles al público.
- Aplicar límites de solicitudes, tamaños de carga y protección contra automatización al formulario público y al login en el proxy/plataforma. Revisar retención de los payloads del diagnóstico, que pueden contener datos personales.
- Activar secret scanning/push protection y revisión de dependencias en GitHub cuando estén disponibles. El workflow incluido comprueba el estado actual del código y las dependencias en cada PR/push; no certifica que el historial esté limpio.
- Tras rotar los secretos, valorar saneamiento coordinado del historial y copias/cachés. Reescribir Git puede afectar otras ramas y clones; no se realizó en esta corrección.

La auditoría cubre el repositorio y verificaciones limitadas de acceso anónimo. No sustituye revisar la configuración del servidor, logs, respaldos, todas las cuentas ni una prueba de penetración completa.
