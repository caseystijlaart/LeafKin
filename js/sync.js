// The app's data store in 2.0. The app keeps working with whole plant objects (as in 1.x);
// this module compares each saved plant with its last known version and queues only what changed:
// plant fields, care log entries, timeline snapshots, health checks and photos.
// Queued changes are sent in order when online; changes from housemates arrive via live updates.
import * as local from "./db.js";
import * as cloud from "./cloud.js";
import { ROOMS } from "./conditions.js";
import { uid } from "./util.js";

const st = {
  user: null,           // { id, email }
  household: null,      // { id, name, role }
  members: [],          // [{ id, name, role }]
  shadow: new Map(),    // plant id → last saved/pulled version (JSON)
  online: navigator.onLine !== false,
  flushing: null,
  unsubscribe: null,
  pullTimer: null,
  lastError: "",
};
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (what) => listeners.forEach((fn) => { try { fn(what); } catch (e) { console.error(e); } });

export const configured = cloud.configured;
export const user = () => st.user;
export const household = () => st.household;
export const members = () => st.members;
export const memberName = (id) => (id && st.user && id === st.user.id ? "you" : st.members.find((m) => m.id === id)?.name || "");
export const lastError = () => st.lastError;
const isUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------- rows ⇄ app plant objects ----------------

function toPlant(row, events, snaps, checks) {
  const care = row.care || {};
  return {
    id: row.id, name: row.name, species: row.species || "", sci: row.sci || "", care,
    location: ROOMS[care.room] || "",
    waterEvery: row.water_every || 0, feedEvery: row.feed_every || 0,
    lastWatered: row.last_watered, lastFed: row.last_fed, lastRepotted: row.last_repotted,
    snoozeUntil: row.snooze_until, snoozedThisCycle: !!row.snoozed_this_cycle, snoozeStreak: row.snooze_streak || 0,
    createdAt: row.created_at, updatedAt: row.updated_at,
    history: events.map((e) => ({ id: e.id, type: e.type, at: e.at, by: e.by_user })),
    growth: snaps.map((g) => ({ id: g.id, at: g.at, heightCm: g.height_cm == null ? undefined : Number(g.height_cm), note: g.note || "", photoId: g.photo_id, by: g.by_user })),
    checks: checks.map((c) => ({ id: c.id, at: c.at, status: c.status, symptoms: c.symptoms || [], causes: (c.causes || []).map((t) => ({ title: t })), photoId: c.photo_id, by: c.by_user })),
  };
}
const plantRow = (p, h) => ({
  id: p.id, household_id: h, name: String(p.name || "Plant").slice(0, 80), species: (p.species || "").slice(0, 120), sci: (p.sci || "").slice(0, 120),
  care: p.care || {}, water_every: p.waterEvery || 0, feed_every: p.feedEvery || 0,
  last_repotted: p.lastRepotted || null, snooze_until: p.snoozeUntil || null,
  snoozed_this_cycle: !!p.snoozedThisCycle, snooze_streak: Math.min(10, p.snoozeStreak || 0),
});
const eventRow = (e, p, h) => ({ id: e.id, plant_id: p.id, household_id: h, type: e.type, at: e.at });
const snapRow = (g, p, h) => ({ id: g.id, plant_id: p.id, household_id: h, at: g.at, height_cm: typeof g.heightCm === "number" ? g.heightCm : null, note: (g.note || "").slice(0, 80), photo_id: g.photoId || null });
const checkRow = (c, p, h) => ({ id: c.id, plant_id: p.id, household_id: h, at: c.at, status: c.status, symptoms: c.symptoms || [], causes: (c.causes || []).map((x) => x.title), photo_id: c.photoId || null });
const PLANT_FIELDS = ["name", "species", "sci", "care", "waterEvery", "feedEvery", "lastRepotted", "snoozeUntil", "snoozedThisCycle", "snoozeStreak"];

// Give everything a proper id (older 1.x entries have none) and note who added new entries.
function normalise(p) {
  if (!isUuid(p.id)) p.id = uid();
  for (const list of [p.history, p.growth, p.checks]) {
    for (const x of list || []) {
      if (!isUuid(x.id)) x.id = uid();
      if (!x.by && st.user) x.by = st.user.id;
    }
  }
  for (const list of [p.growth, p.checks]) for (const x of list || []) if (x.photoId && !isUuid(x.photoId)) x.photoId = null;
  p.history = (p.history || []).filter((e) => ["water", "feed", "snooze", "repot"].includes(e.type));
  p.checks = (p.checks || []).filter((c) => ["healthy", "watch", "attention"].includes(c.status));
  p.location = ROOMS[p.care?.room] || p.location || "";
  return p;
}

const photoIds = (p) => new Set([...(p?.growth || []), ...(p?.checks || [])].map((x) => x.photoId).filter(Boolean));

// Compare a plant with its last known version and list the requests needed.
function diff(prev, p, h) {
  const ops = [];
  if (!prev || PLANT_FIELDS.some((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(p[k] ?? null))) {
    ops.push({ op: "upsertPlant", row: plantRow(p, h) });
  }
  const byId = (list) => new Map((list || []).map((x) => [x.id, x]));
  const [pe, pg, pc] = [byId(prev?.history), byId(prev?.growth), byId(prev?.checks)];
  const [ne, ng, nc] = [byId(p.history), byId(p.growth), byId(p.checks)];
  // Photos first, so a snapshot never points at a photo that isn't uploaded yet.
  const oldPhotos = photoIds(prev), newPhotos = photoIds(p);
  for (const id of newPhotos) if (!oldPhotos.has(id)) ops.push({ op: "uploadPhoto", household: h, id });
  for (const [id, e] of ne) if (!pe.has(id)) ops.push({ op: "insertEvent", row: eventRow(e, p, h) });
  for (const id of pe.keys()) if (!ne.has(id)) ops.push({ op: "deleteEvent", id });
  for (const [id, g] of ng) if (!pg.has(id) || JSON.stringify(pg.get(id)) !== JSON.stringify(g)) ops.push({ op: "upsertSnapshot", row: snapRow(g, p, h) });
  for (const id of pg.keys()) if (!ng.has(id)) ops.push({ op: "deleteSnapshot", id });
  for (const [id, c] of nc) if (!pc.has(id)) ops.push({ op: "upsertCheck", row: checkRow(c, p, h) });
  for (const id of pc.keys()) if (!nc.has(id)) ops.push({ op: "deleteCheck", id });
  for (const id of oldPhotos) if (!newPhotos.has(id)) ops.push({ op: "deletePhoto", household: h, id });
  return ops;
}

// ---------------- the store API used by the app ----------------

export async function getPlants() {
  const plants = await local.getPlants();
  st.shadow = new Map(plants.map((p) => [p.id, clone(p)]));
  return plants;
}

export async function putPlant(p) {
  if (!st.household) throw new Error("no_household");
  normalise(p);
  const ops = diff(st.shadow.get(p.id), p, st.household.id);
  st.shadow.set(p.id, clone(p));
  await local.putPlant(p);
  if (ops.length) { await local.addOps(ops); flushSoon(); }
}

export async function deletePlant(p) {
  if (!st.household) return;
  const ops = [{ op: "deletePlant", id: p.id }, ...[...photoIds(p)].map((id) => ({ op: "deletePhoto", household: st.household.id, id }))];
  st.shadow.delete(p.id);
  await local.deletePlant(p.id);
  for (const id of photoIds(p)) await local.deletePhoto(id).catch(() => {});
  await local.addOps(ops);
  flushSoon();
}

export const putPhoto = (id, blob) => local.putPhoto(id, blob);
export const deletePhoto = (id) => local.deletePhoto(id); // local copy only; the server copy follows the plant's photos
export async function getPhoto(id) {
  const blob = await local.getPhoto(id);
  if (blob || !st.household || !st.online) return blob;
  try {
    const remote = await cloud.downloadPhoto(st.household.id, id);
    await local.putPhoto(id, remote);
    return remote;
  } catch { return null; }
}
export const persist = local.persist;
export const usage = local.usage;
export const exportBackup = async () => local.makeBackup(await local.getPlants());
export const pendingCount = () => local.countOps();

// Add plants from a backup file or from 1.x on this phone to the household (new ids, so nothing clashes).
export async function importPlants(plants) {
  let n = 0;
  for (const raw of plants) {
    const p = clone(raw);
    p.id = uid();
    for (const list of [p.history, p.growth, p.checks]) for (const x of list || []) x.id = uid();
    await putPlant(p);
    n++;
  }
  return n;
}
export async function importBackup(file) { return importPlants(await local.readBackup(file)); }

// Plants saved by LeafKin 1.x on this phone, kept aside until they're imported.
export const legacyPlants = async () => (await local.getMeta("legacy")) || [];
export const clearLegacy = () => local.delMeta("legacy");

// ---------------- sending and receiving ----------------

export function flushSoon() { setTimeout(() => flush().catch(() => {}), 50); }

export async function flush() {
  if (st.flushing) return st.flushing;
  st.flushing = (async () => {
    try {
      for (const op of await local.getOps()) {
        if (op.op === "uploadPhoto") op.blob = await local.getPhoto(op.id);
        try {
          await cloud.runOp(op);
          st.lastError = "";
        } catch (e) {
          if (cloud.isNetworkError(e)) { st.online = false; emit("status"); return false; }
          console.warn("LeafKin: change refused by the server, skipped", op, e);
          st.lastError = e?.message || "A change couldn't be saved.";
        }
        await local.deleteOp(op.seq);
      }
      st.online = true;
      return true;
    } finally {
      st.flushing = null;
      emit("status");
    }
  })();
  return st.flushing;
}

// Fetch the household's current state. Local changes are sent first so nothing is lost.
export async function pull() {
  if (!st.household) return false;
  const sent = await flush();
  if (!sent || (await local.countOps())) return false;
  let data;
  try { data = await cloud.fetchHousehold(st.household.id); }
  catch (e) { if (cloud.isNetworkError(e)) { st.online = false; emit("status"); return false; } throw e; }
  const group = (rows) => rows.reduce((m, r) => (m.get(r.plant_id)?.push(r) ?? m.set(r.plant_id, [r]), m), new Map());
  const ev = group(data.events), sn = group(data.snaps), ch = group(data.checks);
  const plants = data.plants.map((r) => toPlant(r, ev.get(r.id) || [], sn.get(r.id) || [], ch.get(r.id) || []));
  if (await local.countOps()) return false; // something changed while fetching; next pull picks it up
  await local.replacePlants(plants);
  st.shadow = new Map(plants.map((p) => [p.id, clone(p)]));
  st.online = true;
  try { st.members = await cloud.members(st.household.id); } catch {}
  emit("plants");
  return true;
}
function pullSoon(delay = 700) {
  clearTimeout(st.pullTimer);
  st.pullTimer = setTimeout(() => pull().catch(() => {}), delay);
}

export function status() {
  return { online: st.online };
}

// ---------------- session ----------------

// Called once at start. Returns "unconfigured" | "signed-out" | "no-household" | "ready".
export async function start() {
  if (!cloud.configured) return "unconfigured";
  // 1.x plants on this phone: keep them aside so they can be imported into the household.
  if (!(await local.getMeta("mode"))) {
    const old = await local.getPlants();
    if (old.length) await local.setMeta("legacy", old);
    await local.replacePlants([]);
    await local.setMeta("mode", "cloud");
  }
  const u = await cloud.currentUser().catch(() => null);
  if (!u) return "signed-out";
  st.user = { id: u.id, email: u.email };
  return refreshHousehold();
}

export async function refreshHousehold() {
  let h = null;
  try {
    h = await cloud.myHousehold(st.user.id);
    await local.setMeta("household", h);
  } catch (e) {
    if (!cloud.isNetworkError(e)) throw e;
    h = await local.getMeta("household"); // offline: use the last known household
    st.online = false;
  }
  if (h && st.household && h.id !== st.household.id) await local.replacePlants([]);
  st.household = h;
  if (!h) { stopLive(); return "no-household"; }
  startLive();
  pullSoon(0);
  return "ready";
}

function startLive() {
  stopLive();
  st.unsubscribe = cloud.subscribe(st.household.id, (table) => {
    if (table === "household_members") refreshHousehold().then((r) => emit(r === "ready" ? "members" : "household")).catch(() => {});
    else pullSoon();
  });
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
}
function stopLive() {
  st.unsubscribe?.(); st.unsubscribe = null;
  window.removeEventListener("online", onOnline);
  document.removeEventListener("visibilitychange", onVisible);
}
const onOnline = () => { st.online = true; pullSoon(0); };
const onVisible = () => { if (!document.hidden) pullSoon(0); };

export async function signedIn(u) {
  st.user = { id: u.id, email: u.email };
  return refreshHousehold();
}
export async function signOut() {
  stopLive();
  await cloud.signOut().catch(() => {});
  await local.clearAccountData();
  st.user = null; st.household = null; st.members = []; st.shadow = new Map();
}

export async function createHousehold(name) { await cloud.createHousehold(name); return refreshHousehold(); }
export async function joinHousehold(code) { await cloud.joinHousehold(code); return refreshHousehold(); }
export async function leaveHousehold() {
  await flush();
  await cloud.leaveHousehold();
  await local.replacePlants([]);
  await local.delMeta("household");
  st.shadow = new Map();
  return refreshHousehold();
}
export const createInvite = () => cloud.createInvite();
export async function removeMember(id) { await cloud.removeMember(id); st.members = await cloud.members(st.household.id); emit("members"); }
export async function renameHousehold(name) {
  await cloud.renameHousehold(st.household.id, name);
  st.household = { ...st.household, name };
  await local.setMeta("household", st.household);
  emit("members");
}
export async function setMyName(name) {
  await cloud.setDisplayName(st.user.id, name);
  st.members = await cloud.members(st.household.id);
  emit("members");
}
export const sendCode = (email) => cloud.sendCode(email);
export const verifyCode = (email, code) => cloud.verifyCode(email, code);
