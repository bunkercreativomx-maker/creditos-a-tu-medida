import { test } from "node:test";
import assert from "node:assert/strict";
import PocketBase from "pocketbase";
import { restoreVerifiedSession } from "@/lib/verified-session.ts";
import { isAllowedPushEndpoint, isPushKey, isSameOrigin } from "@/lib/push-security.ts";
import { readLimitedText, RequestTooLarge, isWebhookEnvelope } from "@/lib/request-security.ts";
import { esRutaMediaZernio, transcribirAudioUrl } from "@/lib/transcribe.ts";
import { sendPush } from "@/lib/push.ts";

function fixtureToken(exp: number) {
  return [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ exp })).toString('base64url'), 'fixture'].join('.');
}
function cookie(token: string) {
  return encodeURIComponent(JSON.stringify({ token, record: { id: 'forged', role: 'admin', collectionName: 'users' } }));
}

test('cookie expirada con rol admin se borra sin aceptar su identidad', async () => {
  const pb = new PocketBase('http://example.invalid');
  pb.collection('users').authRefresh = async () => { throw new Error('no debe llamar'); };
  await restoreVerifiedSession(pb, cookie(fixtureToken(1)));
  assert.equal(pb.authStore.record, null);
  assert.equal(pb.authStore.token, '');
});

test('cookie con token no expirado pero firma falsa se borra al fallar authRefresh', async () => {
  const pb = new PocketBase('http://example.invalid');
  let refreshes = 0;
  pb.collection('users').authRefresh = async () => { refreshes++; throw new Error('401'); };
  await restoreVerifiedSession(pb, cookie(fixtureToken(Math.floor(Date.now() / 1000) + 600)));
  assert.equal(refreshes, 1);
  assert.equal(pb.authStore.record, null);
});

test('rol confiable viene del servidor, nunca del modelo de la cookie', async () => {
  const pb = new PocketBase('http://example.invalid');
  const token = fixtureToken(Math.floor(Date.now() / 1000) + 600);
  pb.collection('users').authRefresh = async () => {
    const record = { id: 'real', role: 'asesor', collectionName: 'users', collectionId: 'users' };
    pb.authStore.save(token, record);
    return { token, record };
  };
  await restoreVerifiedSession(pb, cookie(token));
  assert.equal(pb.authStore.record?.role, 'asesor');
  assert.equal(pb.authStore.record?.id, 'real');
});

test('sin cookie se elimina cualquier sesión previa del cliente', async () => {
  const pb = new PocketBase('http://example.invalid');
  pb.authStore.save(fixtureToken(9999999999), { id: 'old' });
  await restoreVerifiedSession(pb, '');
  assert.equal(pb.authStore.record, null);
});

test('suscripciones rechazan localhost, IP privada, puertos y hosts imitadores', () => {
  for (const endpoint of [
    'http://fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://169.254.169.254/x',
    'https://fcm.googleapis.com.evil.example/x', 'https://evil.example/x',
    'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
  ]) assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
  for (const endpoint of ['https://fcm.googleapis.com/fcm/send/x',
    'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/x']) {
    assert.equal(isAllowedPushEndpoint(endpoint), true);
  }
});

test('registro push exige mismo origen y claves de tamaño válido', () => {
  assert.equal(isSameOrigin(null, 'https://app.example/api/push/subscribe'), false);
  assert.equal(isSameOrigin('https://evil.example', 'https://app.example/api/push/subscribe'), false);
  assert.equal(isSameOrigin('https://app.example', 'https://app.example/api/push/subscribe'), true);
  assert.equal(isPushKey(Buffer.alloc(65, 1).toString('base64url'), 65), true);
  assert.equal(isPushKey(Buffer.alloc(16, 1).toString('base64url'), 16), true);
  assert.equal(isPushKey('invalid', 65), false);
});

test('sin configuración VAPID no se marca la suscripción como expirada', async (t) => {
  const previous = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  t.after(() => { if (previous === undefined) delete process.env.VAPID_PRIVATE_KEY; else process.env.VAPID_PRIVATE_KEY = previous; });
  assert.equal(await sendPush({ endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: '', auth: '' } }, { title: 'test', body: 'test' }), null);
});

test('audio no puede usar path de Zernio en un dominio externo para robar la key', async (t) => {
  let requests = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests++; throw new Error('no network expected'); };
  t.after(() => { globalThis.fetch = previousFetch; });
  assert.equal(esRutaMediaZernio('https://evil.example/api/v1/whatsapp/media/x'), false);
  assert.equal(esRutaMediaZernio('http://zernio.com/api/v1/whatsapp/media/x'), false);
  assert.equal(esRutaMediaZernio('https://zernio.com/api/v1/whatsapp/media/x'), true);
  assert.equal(await transcribirAudioUrl('https://evil.example/api/v1/whatsapp/media/x'), null);
  assert.equal(await transcribirAudioUrl('http://169.254.169.254/latest/meta-data/'), null);
  assert.equal(requests, 0);
});

test('descarga de audio no sigue redirecciones y rechaza archivos demasiado grandes', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.ZERNIO_API_KEY;
  process.env.ZERNIO_API_KEY = 'fixture';
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ZERNIO_API_KEY; else process.env.ZERNIO_API_KEY = previousKey;
  });
  globalThis.fetch = async (_url, init) => {
    assert.equal(init?.redirect, 'error');
    return new Response('small body', { headers: { 'content-length': String(26 * 1024 * 1024) } });
  };
  assert.equal(await transcribirAudioUrl('https://zernio.com/api/v1/whatsapp/media/x'), null);
});

test('request limita bytes reales incluso sin Content-Length', async () => {
  const request = new Request('https://example.invalid', { method: 'POST', body: '0123456789' });
  await assert.rejects(readLimitedText(request, 5), RequestTooLarge);
  assert.equal(await readLimitedText(new Request('https://example.invalid', { method: 'POST', body: 'hola' }), 5), 'hola');
});

test('webhook rechaza IDs que puedan inyectarse en filtros', () => {
  assert.equal(isWebhookEnvelope({ id: 'evt-1', event: 'message.received' }), true);
  assert.equal(isWebhookEnvelope({ id: '" || true || "', event: 'message.received' }), false);
  assert.equal(isWebhookEnvelope({ event: 'message.received' }), false);
  assert.equal(isWebhookEnvelope(null), false);
});
