# Evaluación del bot de WhatsApp — Créditos a tu medida

Fecha: 13-sep-2026. Documento de entrega: qué cambió, qué se verificó, qué falta
y cómo volver atrás. Sin cifras inventadas ni endpoints declarados como
disponibles sin verificarlos contra la cuenta.

## 1. Qué se hizo (concreto)

1. **El handler del turno se extrajo a `lib/turno.ts`** (`procesarTurnoBot`) con
   dependencias inyectadas (PocketBase, envío de Zernio, LLM, notificaciones).
   Antes todo vivía dentro de `app/api/webhooks/zernio/route.ts` y no era posible
   probarlo de punta a punta sin montar Vercel + PocketBase + Zernio. La ruta
   ahora es una capa fina (firma, idempotencia, upsert de lead/conversación) y
   delega el turno al handler extraído.
2. **Se resolvió la contradicción del prompt sobre el NSS** (antes el prompt
   prohibía pedirlo Y lo exigía). Decisión de minimización de datos, fuente
   única en `lib/politicas.ts`: `EXIGIR_IDENTIFICADOR_PARA_CITA = false`. El bot
   **no pide ningún identificador sensibles** (NSS, RFC, CURP, número de pensión)
   para agendar. El dato se recaba en persona con el asesor. Se eliminó el
   manejador que pedía el identificador antes de agendar.
3. **Tests end-to-end del handler real con adaptadores mock** (no se duplica la
   lógica en el harness): `tests/test-turno.mts` ejercita `procesarTurnoBot` con
   PocketBase en memoria, envío capturado y LLM simulado. Se aserta el efecto
   persistido (mensajes guardados, citas creadas/actualizadas, envíos).
4. **Tests unitarios de los clasificadores** en `tests/test-clasificadores.mts`
   (ubicación, escalamiento, agendar, horas, días, nombre corto, UTC).
5. **CI**: `.github/workflows/ci.yml` corre `npm ci`, typecheck, tests y build en
   cada push/PR.
6. **Se excluyeron de entrega** `docs/plan-bot-2026.{md,html}` (contienen PII de
   clientes reales y afirmaciones sin verificar) vía `.gitignore`.

## 2. Verificación (resultados reales, no estimaciones)

- `npm run typecheck` — **0 errores**.
- `npm test` — **25 tests, 25 pasan, 0 fallan** (13 end-to-end + 12 unitarios).
- `npm run build` — **construye sin errores** (18 páginas + rutas API).

Casos cubiertos en los tests end-to-end (todos anonimizados):

- ubicación → dirección oficial directo (sin Cierre B en bucle).
- pregunta por SU cita → devuelve día/hora reales persistidos.
- corrección de datos → "15,000" se guarda como monto, NO como hora de cita.
- "no tengo el identificador" → no bloquea el agendado (minimización).
- agendar hora concreta → persiste la cita ANTES de confirmar.
- reagendar → actualiza la cita existente (no duplica).
- mensaje compuesto con pregunta de asesor → escala, no inventa.
- ráfaga (turno obsoleto) → no responde si ya hay un mensaje más reciente.
- error del LLM (timeout) → fallback honesto, sin Cierre B en bucle.
- error de PocketBase → el handler no revienta.
- pedir hablar con una persona → avisa asesor y marca la conversación.
- saludo del primer contacto fijo (no pasa por LLM).
- cliente recurrente en sesión nueva → saluda por su nombre.

## 3. Limitaciones conocidas (honestas)

- **No se probó contra Zernio ni WhatsApp real**: los tests usan adaptadores
  mock. No hay un número de WhatsApp autorizado para pruebas de humo; el smoke
  de producción queda pendiente (documentado para la revisión/despliegue).
- **El LLM (deepseek) no está mockeado a nivel de llamadas reales** en CI: se
  simula su respuesta/error. La calidad de redacción del modelo no se evalúa
  aquí (no hay golden set + LLM-as-judge; eso es una fase posterior).
- **El timeout del LLM** (`DEEPSEEK_TIMEOUT_MS`/`FORCE_TEXT_AFTER_MS`) no se
  prueba con un reloj real; se simula lanzando un error. El budget de tiempo
  real depende del entorno serverless (maxDuration=60).
- **Typing indicator / botones interactivos** (UY de "se siente humano") NO se
  implementaron: quedan documentados como mejora posterior, después de la
  confiabilidad. No rompen el texto libre actual.
- **Idempotencia/dedupe del webhook** sigue viviendo en la ruta (colección
  `processed_webhook_events`); los tests cubren el turno, no el POST completo.
- **`handoff` al asesor** (claimLead / sendAdvisorMessage ponen `bot_activo=false`)
  está en `app/crm/actions.ts` y no se modificó: se revisó que el guard sigue
  vigente (el bot se apaga al tomar/contestar), pero no se le añadió un test de
  servidor (requiere sesión/middleware de Next).

## 4. Rollback

Todo el cambio es aditivo y reversible:

- El commit de esta tarea no toca el flujo del LLM ni la persistencia del CRM más
  allá de mover el handler (misma lógica) y quitar el pedido de identificador.
- Rollback = volver a `origin/main` (70aacac), que conserva el comportamiento
  previo (con el pedido de identificador y el handler embebido en la ruta).
- La política de minimización está centralizada en `lib/politicas.ts`: si se
  decide en el negocio exigir un identificador, basta revertir
  `EXIGIR_IDENTIFICADOR_PARA_CITA` (pero entonces hay que reintroducir el flujo
  de captura, que se quitó).

## 5. No se ha hecho (fuera de alcance de esta entrega)

- Golden set de conversaciones reales + evaluación LLM-as-judge + gate en CI.
- Piloto de Meta Business Agent (requiere decisión de negocio + elegibilidad de
  la cuenta, no verificado).
- Typing indicator, marcar leído, botones de respuesta rápida.
- Transcripción de notas de voz (Groq) — hay esqueleto en `lib/transcribe.ts`,
  inactivo sin `GROQ_API_KEY`.
- Documentos regulatorios (CAT/tasa) en el footer del sitio — pendiente con
  Financiera Fortaleza (fuera de este flujo).