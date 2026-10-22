// End-to-end test of js/sync.js: two "phones" (Ann, Bob) share a household. Real schema and security rules
// in PGlite; only the network layer (cloud.js) is replaced by tests/sync/fake-cloud.mjs.
// Usage: npm i --no-save @electric-sql/pglite fake-indexeddb && node tests/sync/test-sync.mjs
import "fake-indexeddb/auto";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, mkdirSync, copyFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.LEAFKIN_ROOT || path.resolve(here, "../..");

// ---- database ----
const db = new PGlite();
await db.exec(readFileSync(path.join(root, "tests/sql/supabase-stubs.sql"), "utf8"));
for (const f of readdirSync(path.join(root, "supabase/migrations")).sort()) await db.exec(readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
const users = {};
for (const n of ["ann", "bob"]) { users[`${n}@example.com`] = crypto.randomUUID(); await db.query("insert into auth.users values ($1, $2)", [users[`${n}@example.com`], `${n}@example.com`]); }
globalThis.__lk = { db, users, files: new Map() };

// Browser bits sync.js touches (set after PGlite starts, or it thinks it's in a browser).
globalThis.window = globalThis;
globalThis.addEventListener ??= () => {}; globalThis.removeEventListener ??= () => {};
globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };

// ---- one copy of the app's modules per phone, each with its own IndexedDB ----
const tmp = mkdtempSync(path.join(tmpdir(), "leafkin-sync-"));
async function phone(name) {
  const dir = path.join(tmp, name); mkdirSync(dir);
  for (const f of ["sync.js", "util.js", "conditions.js"]) copyFileSync(path.join(root, "js", f), path.join(dir, f));
  writeFileSync(path.join(dir, "db.js"), readFileSync(path.join(root, "js/db.js"), "utf8").replace('const DB_NAME = "leafkin";', `const DB_NAME = "leafkin-${name}";`));
  copyFileSync(path.join(here, "fake-cloud.mjs"), path.join(dir, "cloud.js"));
  const sync = await import(pathToFileURL(path.join(dir, "sync.js")));
  const cloud = await import(pathToFileURL(path.join(dir, "cloud.js")));
  const local = await import(pathToFileURL(path.join(dir, "db.js")));
  return { sync, cloud, local };
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${m}`); };
const sql = async (q, p) => (await db.query(q, p)).rows;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ann had LeafKin 1.x with one plant on her phone.
const A = await phone("ann");
await A.local.putPlant({ id: "old-plant-1", name: "Old fern", species: "Boston fern", waterEvery: 4, feedEvery: 28, care: { room: "bathroom" },
  history: [{ type: "water", at: "2026-10-01T09:00:00Z" }], growth: [{ id: "g1", at: "2026-09-01T10:00:00Z", photoId: null, heightCm: 30 }], checks: [] });

ok(await A.sync.start() === "signed-out", "first start: signed out");
ok((await A.sync.legacyPlants()).length === 1, "1.x plant on Ann's phone is kept aside for import");
ok(await A.sync.signedIn(await A.cloud.verifyCode("ann@example.com", "123456")) === "no-household", "Ann signs in, has no household yet");
ok(await A.sync.createHousehold("Casa") === "ready", "Ann creates a household");
const h = A.sync.household().id;

// Add a plant with a photo
const pid = crypto.randomUUID(), photo = crypto.randomUUID();
await A.sync.putPhoto(photo, new Blob(["jpeg-bytes"], { type: "image/jpeg" }));
const lily = { id: pid, name: "Peace lily", species: "Peace lily", sci: "Spathiphyllum wallisii", care: { room: "living", light: "half" }, waterEvery: 5, feedEvery: 21,
  history: [], growth: [{ id: crypto.randomUUID(), at: new Date().toISOString(), photoId: photo, heightCm: 20 }], checks: [] };
await A.sync.putPlant(lily); await A.sync.flush();
ok((await sql("select * from plants where id = $1", [pid])).length === 1, "plant reaches the server");
ok((await sql("select * from growth_snapshots where plant_id = $1", [pid]))[0]?.photo_id === photo, "snapshot with its photo id reaches the server");
ok(globalThis.__lk.files.has(`${h}/${photo}.jpg`), "photo is uploaded into the household folder");
ok(await A.sync.pendingCount() === 0, "nothing left in the queue");

// Water + undo
const ev = { id: crypto.randomUUID(), type: "water", at: new Date().toISOString() };
lily.history = [ev, ...lily.history]; lily.lastWatered = ev.at;
await A.sync.putPlant(lily); await A.sync.flush();
ok((await sql("select last_watered from plants where id = $1", [pid]))[0].last_watered !== null, "watering sets last_watered on the server");
lily.history = lily.history.filter((e) => e.id !== ev.id); lily.lastWatered = null;
await A.sync.putPlant(lily); await A.sync.flush();
ok((await sql("select last_watered from plants where id = $1", [pid]))[0].last_watered === null, "undo removes the watering");

// Invite Bob
const code = await A.sync.createInvite();
const B = await phone("bob");
ok(await B.sync.start() === "signed-out", "Bob's phone starts signed out");
await B.sync.signedIn(await B.cloud.verifyCode("bob@example.com", "654321"));
ok(await B.sync.joinHousehold(code) === "ready", "Bob joins with Ann's invite code");
await B.sync.pull();
let bp = (await B.sync.getPlants()).find((p) => p.id === pid);
ok(bp && bp.name === "Peace lily" && bp.growth.length === 1 && bp.location === "Living room", "Bob sees the plant with its timeline and room");
ok(!!(await B.sync.getPhoto(photo)), "Bob's phone downloads the photo");

// Bob waters, Ann sees who did it
const bev = { id: crypto.randomUUID(), type: "water", at: new Date().toISOString() };
bp.history = [bev, ...bp.history]; bp.lastWatered = bev.at;
await B.sync.putPlant(bp); await B.sync.flush();
await A.sync.pull();
let ap = (await A.sync.getPlants()).find((p) => p.id === pid);
ok(!!ap.lastWatered && ap.history[0]?.by === users["bob@example.com"], "Ann sees Bob's watering, marked as Bob's");
await B.sync.setMyName("Bob"); await A.sync.pull();
ok(A.sync.memberName(users["bob@example.com"]) === "Bob" && A.sync.memberName(users["ann@example.com"]) === "you", "names show in the history (Bob / you)");

// Both edit: Ann renames, Bob snoozes — neither change is lost
ap.name = "Living room lily"; await A.sync.putPlant(ap); await A.sync.flush();
await B.sync.pull(); bp = (await B.sync.getPlants()).find((p) => p.id === pid);
ok(bp.name === "Living room lily", "Bob gets Ann's rename");
bp.snoozeUntil = new Date(Date.now() + 2 * 864e5).toISOString(); bp.snoozedThisCycle = true;
bp.history = [{ id: crypto.randomUUID(), type: "snooze", at: new Date().toISOString() }, ...bp.history];
await B.sync.putPlant(bp); await B.sync.flush(); await A.sync.pull();
ap = (await A.sync.getPlants()).find((p) => p.id === pid);
ok(ap.snoozedThisCycle && ap.name === "Living room lily" && !!ap.lastWatered, "Ann gets Bob's snooze; rename and watering kept");

// Offline: changes wait in the queue and go out later
A.cloud.device.offline = true;
ap.waterEvery = 6; await A.sync.putPlant(ap);
await wait(80);
ok(await A.sync.pendingCount() === 1 && A.sync.status().online === false, "offline: the change waits in the queue");
A.cloud.device.offline = false;
await A.sync.flush();
ok((await sql("select water_every from plants where id = $1", [pid]))[0].water_every === 6 && await A.sync.pendingCount() === 0, "back online: the change is sent");

// Health check with a photo, then a replaced timeline photo (old one removed from the server)
const p2 = crypto.randomUUID();
await A.sync.putPhoto(p2, new Blob(["second"], { type: "image/jpeg" }));
ap.checks = [{ id: crypto.randomUUID(), at: new Date().toISOString(), status: "watch", symptoms: ["brown_tips"], causes: [{ title: "Air too dry" }], photoId: p2 }];
ap.growth = [{ id: crypto.randomUUID(), at: new Date().toISOString(), photoId: p2, note: "Keep an eye on it" }];
await A.sync.putPlant(ap); await A.sync.flush();
ok((await sql("select causes from health_checks where plant_id = $1", [pid]))[0]?.causes[0] === "Air too dry", "health check reaches the server");
ok(!globalThis.__lk.files.has(`${h}/${photo}.jpg`) && globalThis.__lk.files.has(`${h}/${p2}.jpg`), "replaced photo is deleted from storage, new one uploaded");
await B.sync.pull(); bp = (await B.sync.getPlants()).find((p) => p.id === pid);
ok(bp.checks[0]?.causes[0]?.title === "Air too dry" && bp.growth.length === 1, "Bob sees the check and the updated timeline");

// Ann imports her 1.x plant
const n = await A.sync.importPlants(await A.sync.legacyPlants()); await A.sync.clearLegacy(); await A.sync.flush();
await B.sync.pull();
const fern = (await B.sync.getPlants()).find((p) => p.name === "Old fern");
ok(n === 1 && fern && fern.history.length === 1 && fern.growth[0]?.heightCm === 30, "1.x plant imported with its history and timeline");

// Delete
await A.sync.deletePlant((await A.sync.getPlants()).find((p) => p.name === "Old fern")); await A.sync.flush();
await B.sync.pull();
ok(!(await B.sync.getPlants()).some((p) => p.name === "Old fern"), "deleting a plant removes it for Bob too");

// Live update triggers a refresh
let refreshed = false; B.sync.onChange((w) => { if (w === "plants") refreshed = true; });
ap = (await A.sync.getPlants()).find((p) => p.id === pid); ap.name = "Lily"; await A.sync.putPlant(ap); await A.sync.flush();
B.cloud.fireLive("plants"); await wait(1000);
ok(refreshed && (await B.sync.getPlants()).find((p) => p.id === pid).name === "Lily", "a live update makes Bob's phone refresh");

// Bob leaves; Ann stays owner with her plants
ok(await B.sync.leaveHousehold() === "no-household" && (await B.sync.getPlants()).length === 0, "Bob leaves and his phone forgets the plants");
await A.sync.pull();
ok((await A.sync.getPlants()).length === 1 && A.sync.members().length === 1, "Ann keeps the household and plants");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
