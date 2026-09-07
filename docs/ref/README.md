# Adaptador WhatsApp — Bot de prescreen para jubilados y pensionados

Módulo para agregar a la plataforma multi-tenant existente (Node + Railway + Prisma + Redis).
Reusa el pipeline del agente de Messenger; lo único nuevo es el canal de WhatsApp
y las tres capas que hacen que Haiku 4.5 sea suficiente.

## Archivos

```
prisma/schema.prisma.fragment   Modelos Tenant, Conversation, Lead, Message
src/whatsapp/webhook.js         GET verificación + POST con firma y dedupe
src/whatsapp/send.js            Envío de texto y palomitas de leído
src/agent/state.js              Estado del prescreen fuera del modelo
src/agent/guardrails.js         Validador de salida (cifras, promesas, términos)
src/agent/tools.js              guardar_prescreen, disponibilidad, cita, escalar
src/agent/claude.js             Llamada con caché + reintento escalado
src/agent/handler.js            Orquestador con fallback anti-silencio
```

## Instalación

```bash
npm i @anthropic-ai/sdk luxon googleapis
npx prisma migrate dev --name whatsapp_jubilados
```

Montar las rutas (el `verify` del raw body es obligatorio para validar la firma):

```js
import express from "express";
import { verificarWebhook, recibirWebhook, guardarRawBody } from "./src/whatsapp/webhook.js";

app.use(express.json({ verify: guardarRawBody }));
app.get("/webhook/whatsapp", verificarWebhook);
app.post("/webhook/whatsapp", recibirWebhook);
```

Y enganchar el worker de la cola a `procesarMensaje` de `src/agent/handler.js`.

## Alta de un cliente

```js
await prisma.tenant.create({
  data: {
    nombre: "<empresa>",
    phoneNumberId: "<de Meta>",
    waToken: "<token permanente de System User>",
    systemPrompt: fs.readFileSync("instrucciones-bot-whatsapp-jubilados.md", "utf8"),
    calendarId: "<calendario de Google>",
    timezone: "America/Ciudad_Juarez",
    direccion: "Benjamín Franklin 3220, Local 22D, Plaza de las Américas, Zona Pronaf, C.P. 32315, Cd. Juárez, Chihuahua",
    referencia: "Local 22D, dentro de Plaza de las Américas, en Zona Pronaf",
  },
});
```

El prompt se guarda **con las variables del BLOQUE 0 ya resueltas**, no con los `{{ }}`.
Compartir el calendario de Google con el email de la service account, permiso de edición.

## Orden de arranque

1. Verificación de negocio en Meta Business Manager (es lo que más tarda).
2. App en developers.facebook.com → producto WhatsApp → número de prueba.
3. Desplegar y registrar la URL del webhook con `WA_VERIFY_TOKEN`.
4. Suscribir el campo `messages` en la app.
5. Probar con el número de prueba gratuito de Meta.
6. Cambiar al token permanente de System User (el temporal muere en 24h).
7. Mandar a aprobación las plantillas: recordatorio, confirmación, reactivación.
8. Diez conversaciones reales propias antes de entregar el número al cliente.

## Qué vigilar la primera semana

Los `[guardrail]` en logs son el instrumento de medición:

- menos de 2% de rechazos → Haiku solo, puedes quitar el fallback
- 2 a 10% → el esquema híbrido está trabajando, déjalo
- más de 10% → el problema es el prompt, no el modelo: revisa qué motivo se repite
  y agrega esa regla al BLOQUE 11

## Notas

- La ventana de 24h de Meta aplica: fuera de ella solo plantillas aprobadas.
  El seguimiento del BLOQUE 7B debe dispararse a 2–4 horas, no a un día.
- `enHandoff` no expira solo. El asesor debe poder liberarlo desde el dashboard.
- El bloque cacheado va **primero** en el array `system`. Si inviertes el orden,
  invalidas el caché en cada turno y pagas todo completo sin notarlo.

