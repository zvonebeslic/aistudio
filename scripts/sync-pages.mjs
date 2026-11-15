// Root web files are the source of truth. docs/ is the GitHub Pages published mirror.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DOCS = join(ROOT, 'docs');
const FILES = [
  'index.html', 'editor.html', 'video.html',
  'app.js', 'style.css', 'tools.css',
  'cloud.js', 'storage.js', 'photo-editor.js', 'video-editor.js',
  '.nojekyll'
];
const checkOnly = process.argv.includes('--check');
await mkdir(DOCS, { recursive: true });
let diff = 0;
for (const filename of FILES) {
  const source = await readFile(join(ROOT, filename));
  const destination = join(DOCS, filename);
  const existing = await readFile(destination).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing?.equals(source)) continue;
  diff += 1;
  if (checkOnly) {
    console.error('NIJE SINKRONIZIRANO: docs/' + filename);
  } else {
    await writeFile(destination, source);
    console.log('Sinkronizirano: docs/' + filename);
  }
}
if (checkOnly && diff) {
  process.exitCode = 1;
} else {
  console.log(checkOnly ? 'Root i docs su identični.' : 'Gotovo: ' + diff + ' datoteka ažurirano.');
}
