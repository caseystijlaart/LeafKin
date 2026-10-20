// Stand-in for js/cloud.js used by the sync test: same functions, but talking straight to PGlite
// with row level security on, as the user signed in on this "device". Shared state lives on globalThis.__lk.
const lk = globalThis.__lk;
let me = null;          // signed-in user on this device
let liveCb = null;
export const configured = true;
export const device = { offline: false };
export const isNetworkError = (e) => e?.name === "TypeError";
const net = () => { if (device.offline) { const e = new TypeError("Failed to fetch"); throw e; } };

async function as(sql, params = []) {
  net();
  await lk.db.exec(`reset role; select set_config('request.jwt.claim.sub', '${me.id}', false); set role authenticated;`);
  try { return (await lk.db.query(sql, params)).rows; } finally { await lk.db.exec("reset role;"); }
}

export async function currentUser() { return me; }
export async function sendCode() {}
export async function verifyCode(email) { me = { id: lk.users[email], email }; return me; }
export async function signOut() { me = null; }
export function onAuthChange() {}

export async function myHousehold(userId) {
  const r = await as("select m.role, h.id, h.name from household_members m join households h on h.id = m.household_id where m.user_id = $1", [userId]);
  return r[0] ? { id: r[0].id, name: r[0].name, role: r[0].role } : null;
}
export async function members(h) {
  return (await as("select m.user_id as id, m.role, coalesce(p.display_name,'') as name from household_members m left join profiles p on p.id = m.user_id where m.household_id = $1 order by joined_at", [h]));
}
export const createHousehold = async (name) => (await as("select create_household($1) as h", [name]))[0].h;
export const createInvite = async () => (await as("select create_invite() as c"))[0].c;
export const joinHousehold = async (code) => (await as("select join_household($1) as h", [code]))[0].h;
export const leaveHousehold = async () => { await as("select leave_household()"); };
export const removeMember = async (u) => { await as("select remove_member($1)", [u]); };
export const renameHousehold = async (id, name) => { await as("update households set name = $2 where id = $1", [id, name]); };
export const setDisplayName = async (id, name) => { await as("update profiles set display_name = $2 where id = $1", [id, name]); };

export async function fetchHousehold(h) {
  return {
    plants: await as("select * from plants where household_id = $1", [h]),
    events: await as("select id, plant_id, type, at, by_user from care_events where household_id = $1 order by at desc", [h]),
    snaps: await as("select id, plant_id, at, height_cm, note, photo_id, by_user from growth_snapshots where household_id = $1 order by at", [h]),
    checks: await as("select id, plant_id, at, status, symptoms, causes, photo_id, by_user from health_checks where household_id = $1 order by at desc", [h]),
  };
}

const TABLE = { upsertPlant: "plants", insertEvent: "care_events", upsertSnapshot: "growth_snapshots", upsertCheck: "health_checks" };
async function upsert(table, row, ignore) {
  const cols = Object.keys(row);
  const vals = cols.map((c) => (row[c] !== null && typeof row[c] === "object" && !Array.isArray(row[c]) ? JSON.stringify(row[c]) : row[c]));
  const set = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  await as(`insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
            on conflict (id) do ${ignore ? "nothing" : `update set ${set}`}`, vals);
}
export async function runOp(op) {
  switch (op.op) {
    case "upsertPlant": case "upsertSnapshot": case "upsertCheck": return upsert(TABLE[op.op], op.row);
    case "insertEvent": return upsert("care_events", op.row, true);
    case "deletePlant": return as("delete from plants where id = $1", [op.id]);
    case "deleteEvent": return as("delete from care_events where id = $1", [op.id]);
    case "deleteSnapshot": return as("delete from growth_snapshots where id = $1", [op.id]);
    case "deleteCheck": return as("delete from health_checks where id = $1", [op.id]);
    case "uploadPhoto": {
      if (!op.blob) return null;
      await as("insert into storage.objects (bucket_id, name) values ('photos', $1)", [`${op.household}/${op.id}.jpg`]);
      lk.files.set(`${op.household}/${op.id}.jpg`, op.blob);
      return null;
    }
    case "deletePhoto": await as("delete from storage.objects where name = $1", [`${op.household}/${op.id}.jpg`]); lk.files.delete(`${op.household}/${op.id}.jpg`); return null;
  }
}
export async function downloadPhoto(h, id) {
  const rows = await as("select name from storage.objects where name = $1", [`${h}/${id}.jpg`]);
  if (!rows.length) throw new Error("not found");
  return lk.files.get(`${h}/${id}.jpg`);
}
export function subscribe(h, fn) { liveCb = fn; return () => { liveCb = null; }; }
export const fireLive = (table) => liveCb?.(table);
