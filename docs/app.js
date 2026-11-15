const IS_PAGES_DEMO = true; // GitHub Pages has no server API
const $ = id => document.getElementById(id);
const MODES = {
  image: { title: 'Tvoja ideja.<br><em>Nova stvarnost.</em>', description: 'Opiši što zamišljaš, odaberi model i pretvori riječi u spektakularne vizuale.', breadcrumb: 'Generiranje slika', button: 'Generiraj sliku' },
  edit: { title: 'Ista fotografija.<br><em>Nove mogućnosti.</em>', description: 'Dodaj fotografiju, reci što mijenjaš i prepusti preostalo umjetnoj inteligenciji.', breadcrumb: 'Uredi fotografiju', button: 'Prepravi fotografiju' },
  video: { title: 'Pokreni ideju.<br><em>Stvori film.</em>', description: 'Pretvori tekst ili fotografiju u kratak video s pokretom i zvukom.', breadcrumb: 'Video studio', button: 'Generiraj video' },
  'video-edit': { title: 'Svaki kadar.<br><em>Nova priča.</em>', description: 'Učitaj vlastiti video i opiši promjene koje želiš vidjeti.', breadcrumb: 'Uredi video', button: 'Prepravi video' },
  gallery: { breadcrumb: 'Moja galerija' },
  settings: { breadcrumb: 'Postavke' }
};
const IMAGE_MODELS = [
  { id: 'gemini-nano-banana-2.1', label: '✦ Nano Banana 2.1 · preporučeno', info: 'Google · najnoviji model za generiranje i uređivanje slika' },
  { id: 'gemini-3.1-flash-lite-image', label: '◈ Nano Banana 2 Lite · ekonomično', info: 'Google · brz i povoljniji model' },
  { id: 'gemini-3.1-flash-image', label: '✧ Nano Banana 2 · Flash', info: 'Google · univerzalan model za slike' },
  { id: 'gemini-3-pro-image', label: '◆ Nano Banana Pro · premium', info: 'Google · složeni dizajni i detalji' },
  { id: 'gpt-image-2.5-sunburst', label: '✺ GPT Image 2.5 Sunburst', info: 'OpenAI · precizno uređivanje i kvalitetni vizuali' },
  { id: 'gpt-image-2.5-flare', label: '✷ GPT Image 2.5 Flare', info: 'OpenAI · brze kvalitetne slike' }
];
const VIDEO_MODELS = [{ id: 'gemini-omni-1.2-flash', label: '▷ Gemini Omni 1.2 Flash', info: 'Google · tekst, fotografija i video kao ulaz' }];
const PROMPTS = {
  image: [
    ['Fotorealistično', 'Fotorealistična filmska fotografija planinskog grebena tijekom zlatnog sata, detaljne teksture stijena, magla u dolini, 35mm objektiv'],
    ['Filmski kadar', 'Kinematografski kadar futurističkog grada noću, neonski odsjaji, dramatično osvjetljenje, široki kadar'],
    ['3D dizajn', 'Minimalistički 3D prikaz luksuznog proizvoda na tamnoj pozadini, studijska rasvjeta i savršene refleksije']
  ],
  edit: [
    ['Promijeni odjeću', 'Promijeni odjeću osobe u elegantno crno odijelo, zadrži lice, pozu i osvjetljenje fotografije'],
    ['Nova pozadina', 'Zamijeni pozadinu prizorom modernog interijera, prirodno spoji osvjetljenje i sjene'],
    ['Filmska obrada', 'Pretvori fotografiju u filmski portret s toplim tonovima i mekanim svjetlom, sačuvaj identitet osobe']
  ],
  video: [
    ['Kamera prati', 'Kamera polako prati planinara koji se uspinje kamenitom stazom, jutarnja magla, prirodni pokret, filmska atmosfera'],
    ['Oživi fotografiju', 'Suptilan pokret kamere prema naprijed, lagani vjetar u kosi i prirodno pomicanje svjetla, realistični detalji'],
    ['Filmski dron', 'Kinematografski let drona preko planinskih vrhova, jutarnje sunce, spori glatki pokreti kamere']
  ],
  'video-edit': [
    ['Promijeni atmosferu', 'Zadrži postojeći kadar i radnju, ali promijeni rasvjetu u toplo zlatno svjetlo zalaska sunca'],
    ['Filmska obrada', 'Pretvori postojeći video u filmski stil s profinjenim kontrastom, zadrži originalne pokrete'],
    ['Zamijeni pozadinu', 'Zadrži glavnog subjekta i pokrete, a okolinu pretvori u planinski krajolik']
  ]
};
let mode = 'image';
let uploads = [];
let uploadedVideo = null;
let sourceId = '';
let activeItem = null;
let gallery = [];
let providerStatus = null;
let busy = false;
let toastTimer = null;
let referenceUrls = [];
const drafts = Object.fromEntries(['image', 'edit', 'video', 'video-edit'].map(key => [key, '']));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function toast(message) {
  const element = $('toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 4200);
}
async function requestJson(url, options) {
  if (IS_PAGES_DEMO) {
    if (url === '/api/status') return { providers: { gemini: false, openai: false }, galleryCount: 0, protected: false };
    if (url === '/api/gallery') return { items: [] };
    throw new Error('Javni web pregled. Za AI generiranje potreban je Node.js backend.');
  }
  const response = await fetch(url, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Mrežna greška (' + response.status + ').');
  return data;
}
function setStatusChip(id, ready, yes, no) {
  const el = $(id);
  el.textContent = ready ? yes : no;
  el.classList.toggle('ready', ready);
  el.classList.toggle('missing', !ready);
}
async function loadStatus() {
  try {
    providerStatus = await requestJson('/api/status');
    $('galleryBadge').textContent = providerStatus.galleryCount;
    setStatusChip('geminiStatus', providerStatus.providers.gemini, 'POVEZANO', 'POVEŽI NA SERVERU');
    setStatusChip('openaiStatus', providerStatus.providers.openai, 'POVEZANO', 'POVEŽI NA SERVERU');
    setStatusChip('passwordStatus', providerStatus.protected, 'ZAŠTIĆENO', 'JAVNI WEB PREGLED');
  } catch (error) { toast(error.message); }
}
function setMode(next) {
  if (!MODES[next]) return;
  if (MODES[mode] && drafts[mode] !== undefined) drafts[mode] = $('promptInput').value;
  mode = next;
  document.querySelectorAll('[data-tab]').forEach(link => link.classList.toggle('active', link.dataset.tab === next));
  $('breadcrumb').textContent = MODES[next].breadcrumb;
  const showStudio = !['gallery', 'settings'].includes(next);
  $('studioPanel').hidden = !showStudio;
  $('galleryPanel').hidden = next !== 'gallery';
  $('settingsPanel').hidden = next !== 'settings';
  if (next === 'gallery') { loadGallery(); return; }
  if (!showStudio) { loadStatus(); return; }
  $('pageTitle').innerHTML = MODES[next].title;
  $('pageDescription').textContent = MODES[next].description;
  $('generateBtn').querySelector('strong').textContent = MODES[next].button;
  $('imageUploadGroup').hidden = next === 'video-edit';
  $('videoUploadGroup').hidden = next !== 'video-edit';
  $('resolutionGroup').hidden = next === 'video' || next === 'video-edit';
  $('durationGroup').hidden = next !== 'video' && next !== 'video-edit';
  $('referenceRequirement').textContent = next === 'edit' ? 'OBAVEZNO' : 'NEOBAVEZNO';
  $('promptInput').value = drafts[next] || '';
  const isVideo = next === 'video' || next === 'video-edit';
  const models = isVideo ? VIDEO_MODELS : IMAGE_MODELS;
  const current = $('modelSelect').value;
  $('modelSelect').innerHTML = models.map(m => '<option value="' + escapeHtml(m.id) + '">' + escapeHtml(m.label) + '</option>').join('');
  if (models.some(m => m.id === current)) $('modelSelect').value = current;
  $('modelSelect').dispatchEvent(new Event('change'));
  for (const option of $('ratioSelect').options) option.hidden = isVideo && !['16:9', '9:16'].includes(option.value);
  if (isVideo && !['16:9', '9:16'].includes($('ratioSelect').value)) $('ratioSelect').value = '16:9';
  if (!isVideo && ['16:9', '9:16'].includes($('ratioSelect').value) && next === 'image') $('ratioSelect').value = '1:1';
  renderSuggestions();
  renderRefs();
  if (activeItem) renderResult(activeItem);
}
function renderSuggestions() {
  $('promptSuggestions').innerHTML = '';
  for (const [label, prompt] of PROMPTS[mode] || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion';
    button.textContent = '+ ' + label;
    button.addEventListener('click', () => {
      $('promptInput').value = prompt;
      $('promptInput').focus();
    });
    $('promptSuggestions').append(button);
  }
}
function showResultState(state) {
  if (IS_PAGES_DEMO && $('demoMediaPreview')) $('demoMediaPreview').hidden = true;
  for (const id of ['emptyResult', 'progressResult', 'finishedResult', 'errorResult']) $(id).hidden = id !== state;
  const label = { emptyResult: 'SPREMNO', progressResult: 'U IZRADI', finishedResult: 'GOTOVO', errorResult: 'GREŠKA' };
  $('resultStatus').textContent = label[state] || 'SPREMNO';
  $('resultFooterRight').textContent = state === 'progressResult' ? 'GENERATING...' : state === 'finishedResult' ? 'CREATION COMPLETE' : 'READY TO CREATE';
}
function renderResult(item) {
  activeItem = item;
  showResultState('finishedResult');
  const url = '/api/media/' + encodeURIComponent(item.id);
  $('resultMedia').replaceChildren();
  const media = document.createElement(item.type === 'video' ? 'video' : 'img');
  media.src = url;
  if (item.type === 'video') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; }
  else media.alt = item.prompt;
  $('resultMedia').append(media);
  $('downloadResult').href = url + '/download';
  $('downloadResult').download = 'ai-studio.' + item.ext;
  $('resultCaption').textContent = item.model + ' · ' + item.prompt;
  $('editResult').textContent = item.type === 'video' ? '◈ Uredi video' : '◈ Uredi';
  $('animateResult').hidden = item.type === 'video';
}
function showError(message) {
  showResultState('errorResult');
  $('errorText').textContent = message;
}
function renderRefs() {
  for (const url of referenceUrls) URL.revokeObjectURL(url);
  referenceUrls = [];
  const list = $('referenceList');
  list.replaceChildren();
  if (sourceId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'reference-item';
    const image = document.createElement('img');
    image.src = '/api/media/' + encodeURIComponent(sourceId);
    image.alt = 'Slika iz galerije';
    const remove = document.createElement('button');
    remove.type = 'button'; remove.title = 'Ukloni referencu'; remove.textContent = '×';
    remove.addEventListener('click', () => { sourceId = ''; renderRefs(); });
    wrapper.append(image, remove);
    list.append(wrapper);
  }
  uploads.forEach((file, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'reference-item';
    const url = URL.createObjectURL(file);
    referenceUrls.push(url);
    const image = document.createElement('img');
    image.src = url;
    image.alt = file.name;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.title = 'Ukloni fotografiju'; remove.textContent = '×';
    remove.addEventListener('click', () => { uploads.splice(index, 1); renderRefs(); });
    wrapper.append(image, remove);
    list.append(wrapper);
  });
  if (sourceId || uploads.length) {
    const caption = document.createElement('span');
    caption.className = 'reference-caption';
    caption.textContent = (uploads.length + (sourceId ? 1 : 0)) + ' / 4 slike';
    list.append(caption);
  }
  if (IS_PAGES_DEMO) renderDemoPreview();
}
let previewBlobUrl = null;
function renderDemoPreview() {
  const isVideo = mode === 'video-edit' && uploadedVideo;
  const file = isVideo ? uploadedVideo : uploads[0];
  let panel = $('demoMediaPreview');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'demoMediaPreview';
    panel.className = 'demo-preview';
    $('resultStage').append(panel);
  }
  if (previewBlobUrl) { URL.revokeObjectURL(previewBlobUrl); previewBlobUrl = null; }
  if (!file) {
    panel.hidden = true;
    if (!$('progressResult').hidden || !$('errorResult').hidden || !$('finishedResult').hidden) return;
    showResultState('emptyResult');
    return;
  }
  for (const id of ['emptyResult', 'progressResult', 'finishedResult', 'errorResult']) $(id).hidden = true;
  panel.replaceChildren();
  panel.hidden = false;
  panel.style.display = 'flex';
  const label = document.createElement('strong');
  label.textContent = isVideo ? 'PREGLED UČITANOG VIDEA' : 'PREGLED UČITANE FOTOGRAFIJE';
  const media = document.createElement(isVideo ? 'video' : 'img');
  previewBlobUrl = URL.createObjectURL(file);
  media.src = previewBlobUrl;
  if (isVideo) { media.controls = true; media.playsInline = true; } else media.alt = file.name;
  const note = document.createElement('p');
  note.textContent = 'Ovo je izvorna datoteka, a ne AI rezultat. Isprobaj odabir prompta i modela, a generiranje aktiviraj nakon povezivanja hostinga.';
  panel.append(label, media, note);
  $('resultStatus').textContent = 'LOKALNI PREGLED';
  $('resultFooterRight').textContent = 'BEZ AI GENERIRANJA';
}
function addImages(files) {
  const valid = Array.from(files).filter(f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type));
  if (!valid.length) { toast('Odaberi JPG, PNG ili WEBP fotografiju.'); return; }
  if (valid.some(f => f.size > 12 * 1024 * 1024)) { toast('Jedna fotografija smije imati najviše 12 MB.'); return; }
  if (uploads.length + valid.length + (sourceId ? 1 : 0) > 4) { toast('Možeš dodati najviše 4 referentne fotografije.'); return; }
  uploads.push(...valid);
  renderRefs();
  toast(valid.length === 1 ? 'Fotografija je dodana.' : 'Fotografije su dodane.');
}
async function useGalleryItem(id, targetMode) {
  const item = gallery.find(i => i.id === id);
  if (!item) return toast('Rad nije pronađen.');
  if (item.type === 'video') {
    if (targetMode !== 'video-edit') return;
    try {
      toast('Učitavam video iz galerije...');
      const response = await fetch('/api/media/' + encodeURIComponent(id));
      if (!response.ok) throw new Error('Video nije dostupan.');
      const blob = await response.blob();
      uploadedVideo = new File([blob], 'studio-' + id.slice(0, 8) + '.mp4', { type: item.mime });
      $('videoUploadLabel').textContent = uploadedVideo.name;
      setMode('video-edit');
      toast('Video spreman za doradu.');
    } catch (error) { toast(error.message); }
  } else {
    uploads = [];
    sourceId = item.id;
    setMode(targetMode);
    renderRefs();
    toast(targetMode === 'video' ? 'Fotografija spremna za animaciju.' : 'Fotografija spremna za uređivanje.');
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function renderGallery() {
  $('galleryBadge').textContent = gallery.length;
  const grid = $('galleryGrid');
  if (!gallery.length) {
    grid.innerHTML = '<div class="gallery-empty"><strong>Galerija još nema radova.</strong><span>Prva generirana slika ili video pojavit će se ovdje.</span></div>';
    return;
  }
  grid.innerHTML = gallery.map(item => {
    const id = encodeURIComponent(item.id);
    const url = '/api/media/' + id;
    const image = item.type === 'video'
      ? '<video src="' + url + '" preload="metadata" muted playsinline></video>'
      : '<img src="' + url + '" loading="lazy" alt="' + escapeHtml(item.prompt) + '">';
    const date = new Date(item.createdAt).toLocaleDateString('hr-HR');
    const useLabel = item.type === 'video' ? '◈ Uredi video' : '◈ Uredi';
    const target = item.type === 'video' ? 'video-edit' : 'edit';
    const animate = item.type === 'video' ? '' : '<button type="button" data-use="' + id + '" data-target="video">▷ Animiraj</button>';
    return '<article class="gallery-card"><div class="gallery-media">' + image + '</div><div class="gallery-card-body">' +
      '<p>' + escapeHtml(item.prompt.length > 95 ? item.prompt.slice(0, 95) + '…' : item.prompt) + '</p>' +
      '<div class="gallery-meta"><span>' + escapeHtml(item.model) + '</span><span>' + date + '</span></div>' +
      '<div class="gallery-card-actions"><a href="' + url + '/download" download>↓ Preuzmi</a><button type="button" data-use="' + id + '" data-target="' + target + '">' + useLabel + '</button>' + animate + '</div></div></article>';
  }).join('');
}
async function loadGallery() {
  try {
    const data = await requestJson('/api/gallery');
    gallery = data.items || [];
    renderGallery();
    return gallery;
  } catch (error) { toast(error.message); return []; }
}
async function submitGeneration(event) {
  if (event) event.preventDefault();
  if (IS_PAGES_DEMO) {
    showError('Ovo je web-pregled na GitHub Pagesu. Sučelje, odabir prompta i pregled fotografija rade, ali stvarno generiranje zahtijeva Node.js hosting i API ključ. Upute su na GitHubu u README.md.');
    toast('Za AI generiranje potrebno je povezati Node.js hosting.');
    return;
  }
  if (busy) return;
  const prompt = $('promptInput').value.trim();
  if (!prompt) { $('promptInput').focus(); return toast('Prvo upiši opis koji želiš generirati.'); }
  if (mode === 'edit' && !uploads.length && !sourceId) return toast('Dodaj fotografiju za prepravku.');
  if (mode === 'video-edit' && !uploadedVideo) return toast('Dodaj video za prepravku.');
  if (providerStatus) {
    const google = $('modelSelect').value.startsWith('gemini-');
    if (google && !providerStatus.providers.gemini) return toast('Za ovaj model postavi GEMINI_API_KEY na serveru.');
    if (!google && !providerStatus.providers.openai) return toast('Za ovaj model postavi OPENAI_API_KEY na serveru.');
  }
  const data = new FormData();
  data.append('mode', mode);
  data.append('model', $('modelSelect').value);
  data.append('prompt', prompt);
  data.append('ratio', $('ratioSelect').value);
  data.append('resolution', $('resolutionSelect').value);
  data.append('duration', $('durationSelect').value);
  if (sourceId) data.append('sourceId', sourceId);
  for (const file of uploads) data.append('images', file);
  if (mode === 'video-edit' && uploadedVideo) data.append('video', uploadedVideo);
  busy = true;
  $('generateBtn').disabled = true;
  $('generateBtn').querySelector('strong').textContent = 'Kreiranje u tijeku...';
  $('progressTitle').textContent = mode.startsWith('video') ? 'Stvaramo tvoj video' : 'Stvaramo tvoju sliku';
  $('progressNote').textContent = 'Šaljem zahtjev AI modelu...';
  showResultState('progressResult');
  try {
    const created = await requestJson('/api/generate', { method: 'POST', body: data });
    const started = Date.now();
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 3500));
      const job = await requestJson('/api/jobs/' + encodeURIComponent(created.id));
      if (job.note) $('progressNote').textContent = job.note;
      if (job.status === 'completed') {
        if (!job.item) throw new Error('Nema rezultata.');
        renderResult(job.item);
        await loadGallery();
        toast('Kreacija je spremljena u tvoju galeriju.');
        break;
      }
      if (job.status === 'failed') throw new Error(job.note || 'Generiranje nije uspjelo.');
      if (Date.now() - started > 13 * 60_000) throw new Error('Isteklo je vrijeme čekanja. Provjeri galeriju.');
    }
  } catch (error) {
    showError(error.message);
    toast('Greška: ' + error.message);
  } finally {
    busy = false;
    $('generateBtn').disabled = false;
    $('generateBtn').querySelector('strong').textContent = MODES[mode].button;
    await loadStatus();
  }
}
function bindEvents() {
  document.querySelectorAll('[data-tab]').forEach(link => link.addEventListener('click', () => setMode(link.dataset.tab)));
  $('modelSelect').addEventListener('change', () => {
    const item = [...IMAGE_MODELS, ...VIDEO_MODELS].find(i => i.id === $('modelSelect').value);
    $('modelHint').textContent = item?.info || '';
    const model = $('modelSelect').value;
    if (model === 'gemini-3.1-flash-lite-image') $('resolutionSelect').value = '1K';
  });
  $('imageUpload').addEventListener('change', e => { addImages(e.target.files); e.target.value = ''; });
  $('videoUpload').addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 60 * 1024 * 1024) { toast('Video mora biti manji od 60 MB.'); e.target.value = ''; return; }
      uploadedVideo = file;
      $('videoUploadLabel').textContent = file.name;
      if (IS_PAGES_DEMO) renderDemoPreview();
    }
  });
  const drop = $('imageDrop');
  for (const name of ['dragenter', 'dragover']) drop.addEventListener(name, e => { e.preventDefault(); drop.classList.add('dragover'); });
  for (const name of ['dragleave', 'drop']) drop.addEventListener(name, e => { e.preventDefault(); drop.classList.remove('dragover'); });
  drop.addEventListener('drop', e => addImages(e.dataTransfer.files));
  $('generatorForm').addEventListener('submit', submitGeneration);
  $('refreshGallery').addEventListener('click', () => { loadGallery(); toast('Galerija je osvježena.'); });
  $('retryBtn').addEventListener('click', submitGeneration);
  $('editResult').addEventListener('click', () => {
    if (activeItem) useGalleryItem(activeItem.id, activeItem.type === 'video' ? 'video-edit' : 'edit');
  });
  $('animateResult').addEventListener('click', () => { if (activeItem) useGalleryItem(activeItem.id, 'video'); });
  $('galleryGrid').addEventListener('click', e => {
    const button = e.target.closest('button[data-use]');
    if (button) useGalleryItem(button.dataset.use, button.dataset.target);
  });
}
bindEvents();
setMode('image');
loadStatus();
loadGallery();
