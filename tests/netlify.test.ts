import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import pages from '../netlify/functions/pages.mjs';
import text from '../netlify/functions/text.mjs';
import history from '../netlify/functions/history.mjs';
import health from '../netlify/functions/health.mjs';

for (const path of ['/', '/speech-to-sign', '/sign-to-speech', '/companion']) {
  test(`renders ${path} with working local asset references`, async () => {
    const response = await pages(new Request(`https://example.com${path}`));
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('<html'));
    assert.ok(!html.includes('{{'));
    if (path === '/sign-to-speech') {
      assert.match(html, /id="camToggle" type="button" disabled/);
      assert.match(html, /which has not been deployed/);
    }
    for (const match of html.matchAll(/(?:href|src|poster)="\/static\/([^"?#]+)"/g)) {
      await access(`sanketsetu/static/${match[1]}`);
    }
  });
}
test('page route rejects mutations and supports HEAD', async () => {
  assert.equal((await pages(new Request('https://example.com/', { method: 'POST' }))).status, 405);
  assert.equal(await (await pages(new Request('https://example.com/', { method: 'HEAD' }))).text(), '');
});
test('text route rejects malformed, empty and oversized input before inference', async () => {
  for (const body of ['{', 'null', '{}', JSON.stringify({ text: ' ' }), JSON.stringify({ text: 'x'.repeat(2001) })]) {
    assert.equal((await text(new Request('https://example.com/save_text', { method: 'POST', body }))).status, 400);
  }
  assert.equal((await text(new Request('https://example.com/save_text'))).status, 405);
});
test('history requires a valid browser identifier before database access', async () => {
  for (const path of ['/get_history', '/clear_history', '/delete_history/123']) {
    const method = path === '/get_history' ? 'GET' : 'DELETE';
    assert.equal((await history(new Request(`https://example.com${path}`, { method }))).status, 400);
  }
});
test('health describes unavailable camera service and camera API returns JSON', async () => {
  const response = await health(new Request('https://example.com/api/health'));
  const data = await response.json();
  assert.equal(data.sign_to_speech.ready, false);
  assert.match(data.sign_to_speech.error, /has not been deployed/);
  const prediction = await health(new Request('https://example.com/api/sign/predict', { method: 'POST' }));
  assert.equal(prediction.status, 503);
  assert.equal((await prediction.json()).error, 'model_unavailable');
});
