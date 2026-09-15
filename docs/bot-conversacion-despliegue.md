# Conversación natural y nombre confirmado

## Cambios

- El nombre del perfil de WhatsApp sigue visible en el CRM, pero el bot no lo usa como nombre confirmado. Pide el nombre completo y guarda `nombre_confirmado=true` solo al recibirlo del cliente.
- Los contactos anteriores sin confirmación también reciben esa pregunta una vez. No se borran nombres existentes ni se consideran confirmados automáticamente.
- Un crédito vigente vacío significa desconocido. Se pregunta antes de ofrecer una cita; si responde sí, se pregunta empresa y antigüedad.
- Se reconocen las respuestas del cliente, se muestran fechas naturales y se envía una sola confirmación tras guardar la cita.
- El motor nuevo recibe historial y transcripciones. Un error de envío deriva a revisión humana sin ejecutar de nuevo el flujo anterior.

## Activación en el servidor

1. Respaldar PocketBase (`pb_data`) y conservar la versión desplegada para poder revertir el código.
2. Instalar dependencias con `npm ci` en la versión que contiene estos cambios.
3. Con las variables del servidor cargadas (`NEXT_PUBLIC_POCKETBASE_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD`), revisar el cambio de esquema:

   ```sh
   node scripts/pb_confirmed_name.mjs
   ```

4. Aplicarlo antes de activar el código nuevo:

   ```sh
   node scripts/pb_confirmed_name.mjs --apply
   ```

   Solo agrega un campo booleano opcional a `leads`; no modifica citas, índices ni valores de nombres. Es seguro repetir el script. No marcar todos los contactos como confirmados, porque también validaría apodos.

5. Ejecutar `npx next typegen`, `npm run typecheck`, `npm test` y `npm run build`; desplegar con el procedimiento habitual. Mantener `OPENAI_API_KEY` y `OPENAI_MODEL` configurados para usar este motor.
6. En un contacto de prueba con apodo, verificar: saludo → nombre completo → condición → institución → monto → crédito vigente → empresa/antigüedad si corresponde → propuesta → confirmación → una cita guardada. Probar también una nota de voz y la intervención de un asesor.

Si se revierte el código, puede conservarse el campo adicional. No se necesita borrar datos. La corrección del nombre requiere esta migración; si el campo falta, el bot deriva a un asesor en vez de fingir que guardó la confirmación.

Las pruebas automáticas usan clientes simulados, sin mensajes ni llamadas reales a OpenAI. La calidad de interpretación de respuestas libres se verifica con una conversación de prueba después del despliegue.
