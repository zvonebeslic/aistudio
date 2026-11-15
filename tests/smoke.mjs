import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('server authenticates, serves editor and validates API without provider keys', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'zvone-studio-test-'));
  const port = 34000 + Math.floor(Math.random() * 20000);
  const password = 'test-password-not-for-production';
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), NODE_ENV: 'test',
      STUDIO_PASSWORD: password, GEMINI_API_KEY: '', OPENAI_API_KEY: '', DATA_DIR: dir },
    stdio: 'ignore'
  });
  t.after(async () => { child.kill(); await rm(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error('Server je stao prije provjere.');
    try {
      const response = await fetch(base + '/api/status');
      if (response.status === 401) { ready = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Server se mora pokrenuti unutar 8 s.');
  const auth = 'Basic ' + Buffer.from('studio:' + password).toString('base64');
  const response = await fetch(base + '/api/status', { headers: { authorization: auth } });
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.providers.gemini, false);
  assert.equal(status.providers.openai, false);
  assert.equal(status.protected, true);
  const page = await fetch(base + '/', { headers: { authorization: auth } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Zvone AI Studio/);
  const body = new FormData();
  body.set('mode', 'image');
  body.set('model', 'gemini-nano-banana-2.1');
  body.set('prompt', 'Planinski vrhovi u zalasku sunca');
  const denied = await fetch(base + '/api/generate', { method: 'POST', headers: { authorization: auth }, body });
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /GEMINI_API_KEY/);
});
