import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const files = [
  'index.html', 'editor.html', 'video.html',
  'app.js', 'style.css', 'tools.css',
  'cloud.js', 'storage.js', 'photo-editor.js', 'video-editor.js', '.nojekyll'
];

test('Main GitHub repository contains a full standalone web app', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /^<!doctype html>/i);
  assert.match(html, /<title>Zvone AI Studio<\/title>/);
  assert.match(html, /src="\.\/app\.js/);
  assert.match(html, /href="\.\/style\.css/);
  assert.match(html, /href="\.\/editor\.html/);
  assert.match(html, /href="\.\/video\.html/);
});

test('Root code matches GitHub Pages published docs/ copy exactly', async () => {
  for (const file of files) {
    const root = await readFile(path.join(process.cwd(), file));
    const published = await readFile(path.join(process.cwd(), 'docs', file));
    assert.ok(root.equals(published), file + ' mismatch between root and docs/');
  }
});
