// Runs the migration in PGlite (Postgres in WebAssembly) and checks the security rules with real users.
// Usage: npm i --no-save @electric-sql/pglite && node tests/sql/test-migration.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const db = new PGlite();
await db.exec(readFileSync(path.join(here, "supabase-stubs.sql"), "utf8"));
for (const f of readdirSync(path.join(root, "supabase/migrations")).sort()) {
  await db.exec(readFileSync(path.join(root, "supabase/migrations", f), "utf8"));
}

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✓" : "✗"} ${msg}`); };
const ids = {};
for (const n of ["ann", "bob", "cat", "dan"]) {
  ids[n] = crypto.randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [ids[n], `${n}@example.com`]);
}
// Run SQL as a signed-in user.
async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${ids[user]}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
async function fails(user, sql, params, msg, expect) {
  try { await as(user, sql, params); ok(false, msg + " (should have failed)"); }
  catch (e) { ok(!expect || String(e.message).includes(expect), `${msg} → ${e.message}`); }
}
const one = async (user, sql, params) => (await as(user, sql, params)).rows[0];

ok((await db.query("select display_name from profiles where id = $1", [ids.ann])).rows[0]?.display_name === "ann", "profile created on sign-up");

const h1 = (await one("ann", "select create_household('Casa') as h")).h;
ok(!!h1, "ann creates a household");
await fails("ann", "select create_household('Second')", [], "ann can't create a second household", "already_in_household");
ok((await as("bob", "select * from households")).rows.length === 0, "bob can't see ann's household");

const code = (await one("ann", "select create_invite() as c")).c;
ok(/^[A-Z2-9]{6}$/.test(code), `invite code looks right (${code})`);
await fails("cat", "select join_household('ZZZZZZ')", [], "wrong invite code is refused", "invalid_code");
ok((await one("bob", "select join_household($1) as h", [code.toLowerCase()])).h === h1, "bob joins with the code (any case)");
ok((await as("bob", "select * from household_members")).rows.length === 2, "bob sees both members");
ok((await as("bob", "select * from profiles")).rows.length === 2, "bob sees ann's profile");
ok((await as("cat", "select * from profiles")).rows.length === 1, "cat only sees her own profile");

const plant = crypto.randomUUID();
await as("ann", "insert into plants (id, household_id, name) values ($1, $2, 'Peace lily')", [plant, h1]);
ok((await as("bob", "select * from plants")).rows.length === 1, "bob sees the shared plant");
ok((await as("cat", "select * from plants")).rows.length === 0, "cat sees no plants");
await fails("cat", "insert into plants (household_id, name) values ($1, 'Sneaky')", [h1], "cat can't add plants to ann's household", "row-level security");
ok((await as("cat", "update plants set name = 'Hacked' where id = $1 returning id", [plant])).rows.length === 0
  && (await one("ann", "select name from plants where id = $1", [plant])).name === "Peace lily", "cat can't rename ann's plant (0 rows changed)");

await as("bob", "update plants set snooze_until = now() + interval '2 days', snoozed_this_cycle = true where id = $1", [plant]);
const ev = crypto.randomUUID();
await as("bob", "insert into care_events (id, plant_id, household_id, type) values ($1, $2, $3, 'water')", [ev, plant, h1]);
let pr = await one("ann", "select * from plants where id = $1", [plant]);
ok(pr.last_watered !== null, "watering by bob sets last_watered");
ok(pr.snooze_until === null && pr.snoozed_this_cycle === false, "watering clears the snooze");
ok((await one("ann", "select by_user from care_events where id = $1", [ev])).by_user === ids.bob, "care log records who watered");

await as("ann", "update plants set last_watered = '2000-01-01', name = 'Peace lily 2' where id = $1", [plant]);
pr = await one("ann", "select * from plants where id = $1", [plant]);
ok(pr.name === "Peace lily 2" && new Date(pr.last_watered).getFullYear() > 2000, "app can't overwrite last_watered, other fields still save");

await as("ann", "delete from care_events where id = $1", [ev]);
ok((await one("ann", "select last_watered from plants where id = $1", [plant])).last_watered === null, "undo (deleting the event) recalculates last_watered");

await as("ann", "insert into care_events (plant_id, household_id, type, at) values ($1, $2, 'repot', '2025-03-15')", [plant, h1]);
ok(new Date((await one("ann", "select last_repotted from plants where id = $1", [plant])).last_repotted).getFullYear() === 2025, "repot event sets last_repotted");

const h2 = (await one("dan", "select create_household('Dan') as h")).h;
const dplant = crypto.randomUUID();
await as("dan", "insert into plants (id, household_id, name) values ($1, $2, 'Cactus')", [dplant, h2]);
await fails("ann", "insert into care_events (plant_id, household_id, type) values ($1, $2, 'water')", [dplant, h1], "can't log care for another household's plant", "row-level security");
await fails("ann", "insert into growth_snapshots (plant_id, household_id) values ($1, $2)", [dplant, h2], "can't add a snapshot to another household", "row-level security");
await as("bob", "insert into growth_snapshots (plant_id, household_id, height_cm, photo_id) values ($1, $2, 31.5, gen_random_uuid())", [plant, h1]);
await as("bob", "insert into health_checks (plant_id, household_id, status, symptoms) values ($1, $2, 'watch', '{brown_tips}')", [plant, h1]);
ok((await as("ann", "select * from growth_snapshots")).rows.length === 1 && (await as("ann", "select * from health_checks")).rows.length === 1, "snapshots and checks are shared");

await as("bob", "insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${h1}/${crypto.randomUUID()}.jpg`]);
ok((await as("ann", "select * from storage.objects")).rows.length === 1, "household photo upload works and is shared");
await fails("cat", "insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${h1}/x.jpg`], "cat can't upload into ann's photo folder", "row-level security");
ok((await as("dan", "select * from storage.objects")).rows.length === 0, "dan can't see ann's photos");

await fails("bob", "select remove_member($1)", [ids.ann], "a member can't remove the owner", "not_owner");
await as("bob", "insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/1', 'k', 'a')");
ok((await as("ann", "select * from push_subscriptions")).rows.length === 0, "devices are private to each person");

await as("ann", "select leave_household()");
ok((await one("bob", "select role from household_members where user_id = $1", [ids.bob])).role === "owner", "when the owner leaves, bob becomes owner");
ok((await as("ann", "select * from plants")).rows.length === 0, "ann no longer sees the plants");
await as("bob", "select leave_household()");
ok((await db.query("select count(*)::int n from plants where household_id = $1", [h1])).rows[0].n === 0, "last one out deletes the household and its plants");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
