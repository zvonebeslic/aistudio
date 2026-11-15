import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'gallery.json');
const PORT = Number(process.env.PORT || 3000);
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const STUDIO_PASSWORD = process.env.STUDIO_PASSWORD || '';
const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com';
const IMAGE_MODELS = new Set(['gemini-nano-banana-2.1', 'gemini-3.1-flash-lite-image', 'gemini-3.1-flash-image', 'gemini-3-pro-image', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']);
const VIDEO_MODEL = 'gemini-omni-1.1-flash';

if (process.env.NODE_ENV === 'production' && !STUDIO_PASSWORD) {
  throw new Error('U produkciji postavi STUDIO_PASSWORD. Aplikacija je zaštićena lozinkom.');
}
await mkdir(MEDIA_DIR, { recursive: true });
let gallery = [];
try { gallery = JSON.parse(await readFile(DB_PATH, 'utf8')); if (!Array.isArray(gallery)) gallery = []; }
catch (e) { if (e.code !== 'ENOENT') console.warn('Galerija nije učitana:', e.message); }
let saveQueue = Promise.resolve();
function persistGallery() {
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const temp = DB_PATH + '.tmp';
    await writeFile(temp, JSON.stringify(gallery, null, 2));
    await rename(temp, DB_PATH);
  });
  return saveQueue;
}
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  next();
});
function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
app.use((req, res, next) => {
  if (!STUDIO_PASSWORD) return next();
  const value = req.get('authorization') || '';
  let password = '';
  if (value.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(value.slice(6), 'base64').toString('utf8');
      password = decoded.slice(decoded.indexOf(':') + 1);
    } catch { /* wrong credentials */ }
  }
  if (value.startsWith('Basic ') && safeEqual(password, STUDIO_PASSWORD)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Zvone AI Studio", charset="UTF-8"');
  res.status(401).send('Prijava je obavezna.');
});
app.use(express.static(path.join(ROOT, 'public'), { index: 'index.html' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024, files: 5, fields: 12 },
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === 'video'
      ? ['video/mp4', 'video/webm', 'video/quicktime']
      : ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return cb(new Error('Nepodržan format datoteke.'));
    cb(null, true);
  }
}).fields([{ name: 'images', maxCount: 4 }, { name: 'video', maxCount: 1 }]);

const jobs = new Map();
const recentRequests = new Map();
function limit(req, res, next) {
  const key = req.ip || 'local';
  const now = Date.now();
  const times = (recentRequests.get(key) || []).filter(t => now - t < 10 * 60_000);
  if (times.length >= 12) return res.status(429).json({ error: 'Previše zahtjeva. Pokušaj za nekoliko minuta.' });
  times.push(now);
  recentRequests.set(key, times);
  next();
}
function parseRequest(req) {
  const mode = String(req.body.mode || '');
  const model = String(req.body.model || '');
  const prompt = String(req.body.prompt || '').trim();
  const ratio = String(req.body.ratio || '1:1');
  const resolution = String(req.body.resolution || '1K');
  const duration = Number(req.body.duration || 8);
  const sourceId = String(req.body.sourceId || '');
  const images = req.files?.images || [];
  const video = req.files?.video?.[0] || null;
  if (!['image', 'edit', 'video', 'video-edit'].includes(mode)) throw new Error('Nepoznat način rada.');
  if (!prompt || prompt.length > 6000) throw new Error('Opis mora sadržavati 1 do 6000 znakova.');
  if (!['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].includes(ratio)) throw new Error('Neispravan format slike.');
  if (!['1K', '2K', '4K'].includes(resolution)) throw new Error('Neispravna rezolucija.');
  if (!Number.isInteger(duration) || duration < 3 || duration > 10) throw new Error('Video mora trajati 3 do 10 sekundi.');
  if (mode === 'image' || mode === 'edit') {
    if (!IMAGE_MODELS.has(model)) throw new Error('Nepodržani model za slike.');
    if (model.startsWith('gemini-') && !GEMINI_KEY) throw new Error('Nije postavljen GEMINI_API_KEY.');
    if (model.startsWith('gpt-') && !OPENAI_KEY) throw new Error('Nije postavljen OPENAI_API_KEY.');
  } else if (model !== VIDEO_MODEL || !GEMINI_KEY) {
    throw new Error('Za video je potreban Gemini API ključ i model Omni 1.2 Flash.');
  }
  if (video && mode !== 'video-edit') throw new Error('Video datoteka može se koristiti samo za uređivanje videa.');
  if (mode === 'video-edit' && !video) throw new Error('Učitaj video koji želiš urediti.');
  if ((mode === 'edit') && !images.length && !sourceId) throw new Error('Dodaj barem jednu izvornu sliku.');
  if (images.some(f => f.size > 12 * 1024 * 1024)) throw new Error('Svaka slika mora biti manja od 12 MB.');
  if (sourceId && !/^[a-f0-9-]{36}$/.test(sourceId)) throw new Error('Neispravna referentna slika.');
  return { mode, model, prompt, ratio, resolution, duration, sourceId, images, video };
}
async function getImageRefs(input) {
  const refs = input.images.map(f => ({ mime: f.mimetype, data: f.buffer.toString('base64') }));
  if (input.sourceId) {
    const item = gallery.find(x => x.id === input.sourceId && x.type === 'image');
    if (!item) throw new Error('Referentna slika nije pronađena u galeriji.');
    const bytes = await readFile(path.join(MEDIA_DIR, item.id + '.' + item.ext));
    refs.unshift({ mime: item.mime, data: bytes.toString('base64') });
  }
  if (refs.length > 4) throw new Error('Maksimalno četiri referentne slike.');
  return refs;
}
async function remoteJson(url, opts) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(12 * 60_000) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = String(payload.error?.message || payload.message || res.statusText || 'Nepoznata greška');
    throw new Error('AI servis (' + res.status + '): ' + detail.slice(0, 450));
  }
  return payload;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function mediaBlocks(payload, wanted) {
  const parts = [];
  if (wanted === 'image' && payload.output_image) parts.push(payload.output_image);
  if (wanted === 'video' && payload.output_video) parts.push(payload.output_video);
  for (const step of payload.steps || []) {
    if (step.type === 'model_output' || step.type === 'output') {
      for (const item of step.content || []) if (item.type === wanted) parts.push(item);
    }
  }
  for (const item of payload.outputs || []) if (item.type === wanted) parts.push(item);
  return parts;
}
async function uploadGoogleVideo(file) {
  const headers = {
    'x-goog-api-key': GEMINI_KEY,
    'X-Goog-Upload-Protocol': 'resumable',
    'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': String(file.size),
    'X-Goog-Upload-Header-Content-Type': file.mimetype,
    'Content-Type': 'application/json'
  };
  const start = await fetch(GEMINI_ORIGIN + '/upload/v1beta/files', {
    method: 'POST', headers, body: JSON.stringify({ file: { display_name: 'studio-upload' } }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!start.ok) throw new Error('Neuspješan prijenos videa na Google (' + start.status + ').');
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl || !uploadUrl.startsWith(GEMINI_ORIGIN + '/')) throw new Error('Pogrešna Google adresa za upload.');
  const finish = await remoteJson(uploadUrl, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
      'Content-Type': file.mimetype
    },
    body: file.buffer
  });
  if (!finish.file?.uri) throw new Error('Google nije vratio URI učitanog videa.');
  return finish.file.uri;
}
async function googleInteraction(input, refs, job) {
  let mediaInput = [{ type: 'text', text: input.prompt }];
  if (input.mode === 'video-edit') {
    job.note = 'Prijenos izvornog videa...';
    const uri = await uploadGoogleVideo(input.video);
    mediaInput.unshift({ type: 'video', uri, mime_type: input.video.mimetype });
  } else {
    mediaInput.push(...refs.map(r => ({ type: 'image', data: r.data, mime_type: r.mime })));
  }
  const video = input.mode.startsWith('video');
  const response_format = video
    ? { type: 'video', delivery: 'uri', aspect_ratio: ['9:16', '16:9'].includes(input.ratio) ? input.ratio : '16:9', duration: input.duration + 's', resolution: '720p' }
    : { type: 'image', aspect_ratio: input.ratio, ...(input.model === 'gemini-3.1-flash-lite-image' ? {} : { image_size: input.resolution }) };
  const body = {
    model: input.model,
    input: mediaInput.length === 1 ? input.prompt : mediaInput,
    response_format
  };
  let payload = await remoteJson(GEMINI_ORIGIN + '/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json', 'Api-Revision': '2026-05-20' },
    body: JSON.stringify(body)
  });
  job.note = 'AI model obrađuje zahtjev...';
  const started = Date.now();
  while (payload.status && !['completed', 'failed', 'cancelled'].includes(payload.status) && Date.now() - started < 11 * 60_000) {
    if (!payload.id || !/^v[\w-]+$/.test(payload.id)) throw new Error('Servis nije vratio valjan ID operacije.');
    await sleep(4000);
    payload = await remoteJson(GEMINI_ORIGIN + '/v1beta/interactions/' + encodeURIComponent(payload.id), {
      headers: { 'x-goog-api-key': GEMINI_KEY, 'Api-Revision': '2026-05-20' }
    });
  }
  if (payload.status && payload.status !== 'completed') throw new Error('Model nije dovršio zahtjev: ' + payload.status);
  const candidates = mediaBlocks(payload, video ? 'video' : 'image');
  const chosen = candidates.at(-1);
  if (!chosen) throw new Error('AI nije vratio ' + (video ? 'video' : 'sliku') + '. Provjeri odgovor modela.');
  if (chosen.data) {
    const mime = chosen.mime_type || (video ? 'video/mp4' : 'image/png');
    return { bytes: Buffer.from(chosen.data, 'base64'), mime };
  }
  if (chosen.uri && video) {
    job.note = 'Preuzimanje generiranog videa...';
    const u = new URL(chosen.uri);
    if (u.origin !== GEMINI_ORIGIN || !u.pathname.startsWith('/v1beta/files/')) throw new Error('Neočekivana adresa generiranog videa.');
    for (let i = 0; i < 12; i++) {
      const response = await fetch(u, {
        headers: { 'x-goog-api-key': GEMINI_KEY },
        signal: AbortSignal.timeout(120_000)
      });
      if (response.ok) return { bytes: Buffer.from(await response.arrayBuffer()), mime: 'video/mp4' };
      if (i === 11) throw new Error('Video je generiran, ali preuzimanje nije uspjelo (' + response.status + ').');
      await sleep(4000);
    }
  }
  throw new Error('AI nije vratio medijsku datoteku.');
}
async function openaiImage(input, refs) {
  const ratioSize = {
    '1:1': '1024x1024', '16:9': '1536x1024', '9:16': '1024x1536',
    '4:3': '1536x1024', '3:4': '1024x1536', '3:2': '1536x1024', '2:3': '1024x1536'
  };
  const edit = input.mode === 'edit' || refs.length > 0;
  const url = 'https://api.openai.com/v1/images/' + (edit ? 'edits' : 'generations');
  const body = { model: input.model, prompt: input.prompt, size: ratioSize[input.ratio], quality: 'medium', output_format: 'png', n: 1 };
  if (edit) {
    if (!refs.length) throw new Error('Za uređivanje je potrebna fotografija.');
    body.images = refs.map(r => ({ image_url: 'data:' + r.mime + ';base64,' + r.data }));
  }
  const payload = await remoteJson(url, {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + OPENAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const first = payload.data?.[0];
  if (!first?.b64_json) throw new Error('OpenAI nije vratio sliku.');
  return { bytes: Buffer.from(first.b64_json, 'base64'), mime: 'image/png' };
}
function extension(mime) {
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/png') return 'png';
  throw new Error('Nepodržani izlazni format: ' + mime);
}
async function runJob(job, input) {
  try {
    const refs = input.mode === 'video-edit' ? [] : await getImageRefs(input);
    job.note = 'Generiranje je u tijeku...';
    const output = input.model.startsWith('gpt-')
      ? await openaiImage(input, refs)
      : await googleInteraction(input, refs, job);
    if (!output.bytes.length || output.bytes.length > 200 * 1024 * 1024) throw new Error('Datoteka je prazna ili prevelika.');
    const id = randomUUID();
    const ext = extension(output.mime);
    await writeFile(path.join(MEDIA_DIR, id + '.' + ext), output.bytes, { flag: 'wx' });
    const item = {
      id, ext, mime: output.mime, type: input.mode.startsWith('video') ? 'video' : 'image',
      mode: input.mode, model: input.model, prompt: input.prompt,
      ratio: input.ratio, createdAt: new Date().toISOString(),
      bytes: output.bytes.length
    };
    gallery.unshift(item);
    await persistGallery();
    job.status = 'completed';
    job.item = item;
    job.note = 'Gotovo!';
  } catch (err) {
    console.error('AI job:', err);
    job.status = 'failed';
    job.note = err?.message || 'Nepoznata greška.';
  } finally {
    setTimeout(() => jobs.delete(job.id), 60 * 60_000).unref?.();
  }
}
app.get('/api/status', (req, res) => res.json({
  providers: { gemini: Boolean(GEMINI_KEY), openai: Boolean(OPENAI_KEY) },
  galleryCount: gallery.length,
  protected: Boolean(STUDIO_PASSWORD),
  videoModel: VIDEO_MODEL
}));
app.get('/api/gallery', (req, res) => res.json({ items: gallery.slice(0, 100) }));
app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Zadatak nije pronađen ili je istekao.' });
  return res.json({ id: job.id, status: job.status, note: job.note, item: job.item || null });
});
app.post('/api/generate', limit, (req, res, next) => {
  upload(req, res, err => err ? next(err) : next());
}, async (req, res) => {
  try {
    const input = parseRequest(req);
    if (jobs.size >= 30) return res.status(429).json({ error: 'Previše zadataka u obradi.' });
    const job = { id: randomUUID(), status: 'processing', note: 'Pokretanje...', item: null };
    jobs.set(job.id, job);
    res.status(202).json({ id: job.id, status: job.status });
    void runJob(job, input);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get('/api/media/:id', async (req, res) => {
  const item = gallery.find(x => x.id === req.params.id);
  if (!item) return res.status(404).send('Datoteka nije pronađena.');
  const mediaPath = path.join(MEDIA_DIR, item.id + '.' + item.ext);
  try { await stat(mediaPath); }
  catch { return res.status(404).send('Datoteka više nije na disku.'); }
  res.type(item.mime).sendFile(mediaPath);
});
app.get('/api/media/:id/download', async (req, res) => {
  const item = gallery.find(x => x.id === req.params.id);
  if (!item) return res.status(404).send('Datoteka nije pronađena.');
  res.download(path.join(MEDIA_DIR, item.id + '.' + item.ext), 'ai-studio-' + item.id.slice(0, 8) + '.' + item.ext);
});
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error(err.message);
  res.status(400).json({ error: err.message || 'Greška na poslužitelju.' });
});
app.listen(PORT, '0.0.0.0', () => {
  console.log('Zvone AI Studio: http://localhost:' + PORT);
  if (!STUDIO_PASSWORD) console.warn('UPOZORENJE: STUDIO_PASSWORD nije postavljen; aplikacija nije zaštićena.');
  if (!GEMINI_KEY && !OPENAI_KEY) console.warn('Dodaj GEMINI_API_KEY ili OPENAI_API_KEY u .env.');
});
