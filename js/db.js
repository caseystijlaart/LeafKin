// On-device storage (IndexedDB). Plants are plain objects; photos are JPEG blobs kept in their own store.
// This module is the only place that touches storage, so a Supabase version can replace it later.

const DB_NAME = "leafkin";
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("plants")) db.createObjectStore("plants", { keyPath: "id" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result;
    Promise.resolve(fn(s)).then((r) => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export async function getPlants() {
  return tx("plants", "readonly", (s) => wrap(s.getAll()));
}
export async function putPlant(plant) {
  return tx("plants", "readwrite", (s) => { s.put(plant); });
}
export async function deletePlant(plant) {
  const photoIds = [...new Set([...(plant.growth || []), ...(plant.checks || [])].map((g) => g.photoId).filter(Boolean))];
  await tx("plants", "readwrite", (s) => { s.delete(plant.id); });
  if (photoIds.length) await tx("photos", "readwrite", (s) => { photoIds.forEach((id) => s.delete(id)); });
}

export async function putPhoto(id, blob) {
  return tx("photos", "readwrite", (s) => { s.put({ id, blob }); });
}
export async function getPhoto(id) {
  const row = await tx("photos", "readonly", (s) => wrap(s.get(id)));
  return row?.blob || null;
}
export async function deletePhoto(id) {
  return tx("photos", "readwrite", (s) => { s.delete(id); });
}
async function allPhotos() {
  return tx("photos", "readonly", (s) => wrap(s.getAll()));
}

// Ask the browser not to clear our data under storage pressure.
export async function persist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
export async function usage() {
  try { return navigator.storage?.estimate ? await navigator.storage.estimate() : null; } catch { return null; }
}

// ---- backup ----
const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function dataUrlToBlob(url) { return (await fetch(url)).blob(); }

export async function exportBackup() {
  const plants = await getPlants();
  const photos = await allPhotos();
  const out = { app: "LeafKin", version: 1, exportedAt: new Date().toISOString(), plants, photos: [] };
  for (const p of photos) out.photos.push({ id: p.id, data: await blobToDataUrl(p.blob) });
  return new Blob([JSON.stringify(out)], { type: "application/json" });
}

export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (data?.app !== "LeafKin" || !Array.isArray(data.plants)) throw new Error("not_leafkin");
  const blobs = [];
  for (const ph of data.photos || []) {
    if (typeof ph?.id === "string" && typeof ph?.data === "string" && ph.data.startsWith("data:image/")) {
      blobs.push({ id: ph.id, blob: await dataUrlToBlob(ph.data) });
    }
  }
  await tx("photos", "readwrite", (s) => { blobs.forEach((b) => s.put(b)); });
  await tx("plants", "readwrite", (s) => { data.plants.filter((p) => p && typeof p.id === "string").forEach((p) => s.put(p)); });
  return data.plants.length;
}
