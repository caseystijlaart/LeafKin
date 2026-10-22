// Everything that talks to Supabase: sign-in with an emailed code, household actions, data, photos, live updates.
import { createClient } from "./vendor/supabase.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { BETA } from "./util.js";

// Accept the project URL with or without a path such as /rest/v1/ copied from the dashboard.
const BASE_URL = String(SUPABASE_URL || "").trim().replace(/\/(rest|auth|storage|realtime)\/v1\/?$/, "").replace(/\/+$/, "");
export const configured = !!(BASE_URL && SUPABASE_ANON_KEY);
export const sb = configured
  ? createClient(BASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: BETA ? "leafkin-beta.auth" : "leafkin.auth" },
    })
  : null;

// A failed request is "offline" (try again later) or a real refusal (don't retry).
export function isNetworkError(e) {
  const m = String(e?.message || e || "");
  return e?.name === "TypeError" || /fetch|network|load failed|timed? ?out|offline/i.test(m) || e?.status === 0 || e?.status >= 500;
}
const check = ({ data, error }) => { if (error) throw error; return data; };

// ---- sign in ----
export async function currentUser() {
  const { data } = await sb.auth.getSession();
  return data.session?.user || null;
}
// "Sign in" only works for existing accounts; "Create account" makes one if needed.
export const sendCode = async (email, create = false) => check(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: !!create } }));
export const verifyCode = async (email, token) => check(await sb.auth.verifyOtp({ email, token, type: "email" })).user;
export const signOut = () => sb.auth.signOut();
export const onAuthChange = (fn) => sb.auth.onAuthStateChange((event, session) => fn(event, session?.user || null));

// ---- household ----
export async function myHousehold(userId) {
  const row = check(await sb.from("household_members").select("role, households(id, name)").eq("user_id", userId).maybeSingle());
  return row ? { id: row.households.id, name: row.households.name, role: row.role } : null;
}
export async function members(householdId) {
  const rows = check(await sb.from("household_members").select("user_id, role, joined_at").eq("household_id", householdId).order("joined_at"));
  const profiles = check(await sb.from("profiles").select("id, display_name").in("id", rows.map((r) => r.user_id)));
  const names = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
  return rows.map((r) => ({ id: r.user_id, role: r.role, name: names[r.user_id] || "" }));
}
export const createHousehold = async (name) => check(await sb.rpc("create_household", { p_name: name }));
export const createInvite = async () => check(await sb.rpc("create_invite"));
export const joinHousehold = async (code) => check(await sb.rpc("join_household", { p_code: code }));
export const leaveHousehold = async () => check(await sb.rpc("leave_household"));
export const removeMember = async (userId) => check(await sb.rpc("remove_member", { p_user: userId }));
export const renameHousehold = async (id, name) => check(await sb.from("households").update({ name }).eq("id", id));
export const deleteAccount = async () => check(await sb.rpc("delete_account"));

// Remove every photo of a household from Storage (used when the last member leaves or deletes their account).
export async function deleteHouseholdPhotos(h) {
  for (;;) {
    const files = check(await sb.storage.from("photos").list(h, { limit: 100 }));
    if (!files?.length) return;
    check(await sb.storage.from("photos").remove(files.map((f) => `${h}/${f.name}`)));
    if (files.length < 100) return;
  }
}

// ---- push reminders ----
export const savePushDevice = async (row) => check(await sb.from("push_subscriptions").upsert(row, { onConflict: "endpoint" }));
export const updatePushDevice = async (endpoint, fields) => check(await sb.from("push_subscriptions").update(fields).eq("endpoint", endpoint));
export const deletePushDevice = async (endpoint) => check(await sb.from("push_subscriptions").delete().eq("endpoint", endpoint));
export const sendTestPush = async () => check(await sb.functions.invoke("send-reminders", { body: { test: true } }));

export const setDisplayName = async (userId, name) => check(await sb.from("profiles").update({ display_name: name }).eq("id", userId));

// ---- data ----
export async function fetchHousehold(h) {
  const [plants, events, snaps, checks] = await Promise.all([
    sb.from("plants").select("*").eq("household_id", h),
    sb.from("care_events").select("id, plant_id, type, at, by_user").eq("household_id", h).order("at", { ascending: false }).limit(5000),
    sb.from("growth_snapshots").select("id, plant_id, at, height_cm, note, photo_id, by_user").eq("household_id", h).order("at"),
    sb.from("health_checks").select("id, plant_id, at, status, symptoms, causes, photo_id, by_user").eq("household_id", h).order("at", { ascending: false }).limit(2000),
  ].map((q) => q.then(check)));
  return { plants, events, snaps, checks };
}

// One queued change → one request. Inserts are upserts on id, so retrying never duplicates.
export async function runOp(op) {
  switch (op.op) {
    case "upsertPlant": return check(await sb.from("plants").upsert(op.row, { onConflict: "id" }));
    case "deletePlant": return check(await sb.from("plants").delete().eq("id", op.id));
    case "insertEvent": return check(await sb.from("care_events").upsert(op.row, { onConflict: "id", ignoreDuplicates: true }));
    case "deleteEvent": return check(await sb.from("care_events").delete().eq("id", op.id));
    case "upsertSnapshot": return check(await sb.from("growth_snapshots").upsert(op.row, { onConflict: "id" }));
    case "deleteSnapshot": return check(await sb.from("growth_snapshots").delete().eq("id", op.id));
    case "upsertCheck": return check(await sb.from("health_checks").upsert(op.row, { onConflict: "id" }));
    case "deleteCheck": return check(await sb.from("health_checks").delete().eq("id", op.id));
    case "uploadPhoto": {
      if (!op.blob) return null; // photo no longer on this device; nothing to send
      return check(await sb.storage.from("photos").upload(`${op.household}/${op.id}.jpg`, op.blob, { upsert: true, contentType: "image/jpeg" }));
    }
    case "deletePhoto": return check(await sb.storage.from("photos").remove([`${op.household}/${op.id}.jpg`]));
    default: return null;
  }
}

export async function downloadPhoto(h, id) {
  const { data, error } = await sb.storage.from("photos").download(`${h}/${id}.jpg`);
  if (error) throw error;
  return data;
}

// ---- live updates: any change in the household calls `fn` ----
export function subscribe(h, fn) {
  const ch = sb.channel(`household-${h}`);
  for (const table of ["plants", "care_events", "growth_snapshots", "health_checks", "household_members"]) {
    ch.on("postgres_changes", { event: "*", schema: "public", table }, () => fn(table));
  }
  ch.subscribe();
  return () => sb.removeChannel(ch);
}
