/* Zvone Studio's own local gallery, saved in this browser via IndexedDB.
   No third-party analytics, credentials or cloud synchronization. */
(() => {
  const DB = 'zvone-ai-studio-v2';
  const STORE = 'media';
  let conn;
  const cache = new Map();
  const urls = new Map();
  const memory = new Map();
  function connect() {
    if (conn) return conn;
    conn = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB nije dostupan.'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return conn;
  }
  async function transaction(mode, fn) {
    const db = await connect();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.onerror = () => reject(tx.error);
    });
  }
  function makeId() {
    return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  }
  async function save(data) {
    const blob = data.blob;
    if (!(blob instanceof Blob) || !blob.size) throw Error('Nema medija za spremanje.');
    const item = {
      id: makeId(),
      type: blob.type.startsWith('video/') ? 'video' : 'image',
      mime: blob.type || 'application/octet-stream',
      ext: blob.type === 'video/mp4' ? 'mp4' : blob.type === 'video/webm' ? 'webm' : blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png',
      prompt: String(data.prompt || 'Moja kreacija').slice(0, 2000),
      model: String(data.model || 'Lokalni editor'),
      mode: String(data.mode || 'local'),
      bytes: blob.size,
      createdAt: new Date().toISOString(),
      blob
    };
    try { await transaction('readwrite', s => s.put(item)); }
    catch (err) {
      if (err?.name === 'QuotaExceededError') throw Error('Ponestalo je prostora u pregledniku. Preuzmi radove i oslobodi prostor.');
      memory.set(item.id, item);
    }
    cache.set(item.id, item);
    return { ...item, blob: undefined };
  }
  async function get(id) {
    if (cache.has(id)) return cache.get(id);
    if (memory.has(id)) return memory.get(id);
    const item = await transaction('readonly', s => s.get(id)).catch(() => null);
    if (item) cache.set(id, item);
    return item;
  }
  async function list() {
    let records = [];
    try { records = await transaction('readonly', s => s.getAll()); } catch { /* private mode */ }
    const combined = [...records, ...memory.values()];
    combined.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    for (const x of combined) cache.set(x.id, x);
    return combined.map(({ blob, ...rest }) => rest);
  }
  async function url(id) {
    if (urls.has(id)) return urls.get(id);
    const item = await get(id);
    if (!item?.blob) return null;
    const value = URL.createObjectURL(item.blob);
    urls.set(id, value);
    return value;
  }
  async function remove(id) {
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
    memory.delete(id);
    cache.delete(id);
    try { await transaction('readwrite', s => s.delete(id)); } catch { /* private mode */ }
  }
  window.StudioStore = { save, get, list, url, remove };
})();
