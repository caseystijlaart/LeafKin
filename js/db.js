// On-device storage (IndexedDB): a local copy of the household's plants so the app opens instantly and
// works offline, photo blobs, a queue of changes waiting to be sent, and a few settings.
// Only sync.js talks to this module.

const DB_NAME = "leafkin";
const DB_VERSION = 2; // 1 = LeafKin 1.x (plants + photos), 2 adds outbox + meta
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("plants")) db.createObjectStore("plants", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(stores, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    Promise.resolve(fn(Array.isArray(stores) ? stores.map((n) => t.objectStore(n)) : t.objectStore(stores))).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

// ---- plants (local copy) ----
export const getPlants = () => tx("plants", "readonly", (s) => wrap(s.getAll()));
export const putPlant = (plant) => tx("plants", "readwrite", (s) => { s.put(plant); });
export const deletePlant = (id) => tx("plants", "readwrite", (s) => { s.delete(id); });
export const replacePlants = (list) => tx("plants", "readwrite", (s) => { s.clear(); list.forEach((p) => s.put(p)); });

// ---- photos (JPEG blobs by photo id) ----
export const putPhoto = (id, blob) => tx("photos", "readwrite", (s) => { s.put({ id, blob }); });
export async function getPhoto(id) {
  const row = await tx("photos", "readonly", (s) => wrap(s.get(id)));
  return row?.blob || null;
}
export const deletePhoto = (id) => tx("photos", "readwrite", (s) => { s.delete(id); });

// ---- outbox: changes waiting to be sent, in order ----
export const addOps = (ops) => tx("outbox", "readwrite", (s) => { ops.forEach((op) => s.add(op)); });
export const getOps = () => tx("outbox", "readonly", (s) => wrap(s.getAll()));
export const deleteOp = (seq) => tx("outbox", "readwrite", (s) => { s.delete(seq); });
export const countOps = () => tx("outbox", "readonly", (s) => wrap(s.count()));

// ---- meta: small key/value settings (household, user, plants from before 2.0) ----
export async function getMeta(key) {
  const row = await tx("meta", "readonly", (s) => wrap(s.get(key)));
  return row?.value;
}
export const setMeta = (key, value) => tx("meta", "readwrite", (s) => { s.put({ key, value }); });
export const delMeta = (key) => tx("meta", "readwrite", (s) => { s.delete(key); });

// Signing out: forget the household's copy, queued changes and session info. Photos stay cached.
export const clearAccountData = () => tx(["plants", "outbox", "meta"], "readwrite", ([p, o, m]) => {
  p.clear(); o.clear(); ["household", "user"].forEach((k) => m.delete(k));
});

// Ask the browser not to clear our data under storage pressure.
export async function persist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
export async function usage() {
  try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch { return null; }
}

// ---- backup files ----
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function dataUrlToBlob(url) { return (await fetch(url)).blob(); }

export async function makeBackup(plants) {
  const ids = [...new Set(plants.flatMap((p) => [...(p.growth || []), ...(p.checks || [])].map((g) => g.photoId).filter(Boolean)))];
  const out = { app: "LeafKin", version: 2, exportedAt: new Date().toISOString(), plants, photos: [] };
  for (const id of ids) {
    const blob = await getPhoto(id);
    if (blob) out.photos.push({ id, data: await blobToDataUrl(blob) });
  }
  return new Blob([JSON.stringify(out)], { type: "application/json" });
}

// Read a backup file: stores its photos locally and returns its plants (not yet added anywhere).
export async function readBackup(file) {
  const data = JSON.parse(await file.text());
  if (data?.app !== "LeafKin" || !Array.isArray(data.plants)) throw new Error("not_leafkin");
  for (const ph of data.photos || []) {
    if (typeof ph?.id === "string" && typeof ph?.data === "string" && ph.data.startsWith("data:image/")) {
      await putPhoto(ph.id, await dataUrlToBlob(ph.data));
    }
  }
  return data.plants.filter((p) => p && typeof p.id === "string" && typeof p.name === "string");
}
