// LeafKin daily reminders (Supabase Edge Function "send-reminders").
// Runs every hour (Supabase Cron). Each device gets one push per day, at the hour picked in the app,
// listing the household's plants that need water or food today. Nothing due → nothing sent.
// POST { "test": true } with a signed-in user's token sends a test notification to that person's devices.
//
// Secrets (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com).
// SUPABASE_URL and the server key are provided by Supabase automatically.
// Turn OFF "Verify JWT" for this function: the new API keys aren't JWTs. The test request checks the
// signed-in user itself; the hourly run is safe to trigger (each device gets at most one reminder a day).

type Plant = {
  name: string; water_every: number; feed_every: number;
  last_watered: string | null; last_fed: string | null; snooze_until: string | null;
};
type Device = { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; hour: number; tz: string; winter: boolean; last_sent: string | null };

// ---------- pure helpers (also tested in Node: tests/functions/test-reminders.mjs) ----------

export function localDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function localHour(d: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d));
}
const dayNumber = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const isWinter = (ymd: string) => [11, 12, 1, 2].includes(Number(ymd.slice(5, 7)));

// Same rules as the app (js/schedule.js): winter stretches watering by half and pauses feeding,
// a "still damp" snooze holds watering until its date, never-watered plants are due straight away.
export function duePlants(plants: Plant[], now: Date, tz: string, winterSetting: boolean) {
  const today = localDate(now, tz);
  const winter = winterSetting && isWinter(today);
  const daysSince = (iso: string) => dayNumber(today) - dayNumber(localDate(new Date(iso), tz));
  const water: string[] = [], feed: string[] = [];
  for (const p of plants) {
    const W = p.water_every ? (winter ? Math.round(p.water_every * 1.5) : p.water_every) : 0;
    const snoozed = p.snooze_until && localDate(new Date(p.snooze_until), tz) > today;
    if (W && !snoozed && (!p.last_watered || W - daysSince(p.last_watered) <= 0)) water.push(p.name);
    const F = winter ? 0 : p.feed_every || 0;
    if (F && (!p.last_fed || F - daysSince(p.last_fed) <= 0)) feed.push(p.name);
  }
  return { water, feed };
}

export function nameList(names: string[], max = 4): string {
  const shown = names.slice(0, max), more = names.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0] || "";
}

export function reminderMessage({ water, feed }: { water: string[]; feed: string[] }) {
  if (!water.length && !feed.length) return null;
  const n = water.length || feed.length;
  const title = water.length ? `${n} plant${n === 1 ? "" : "s"} to water today` : `${n} plant${n === 1 ? "" : "s"} to feed today`;
  const body = water.length
    ? nameList(water) + (feed.length ? `. Feed: ${nameList(feed, 3)}.` : ".")
    : nameList(feed) + ".";
  return { title, body, count: new Set([...water, ...feed]).size, url: "./" };
}

// ---------- the function itself (Deno only) ----------

declare const Deno: any;
if (typeof Deno !== "undefined") {
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const webpush = (await import("npm:web-push@3.6.7")).default;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:leafkinapp@outlook.com", Deno.env.get("VAPID_PUBLIC_KEY"), Deno.env.get("VAPID_PRIVATE_KEY"));
  // New projects have secret keys (SUPABASE_SECRET_KEYS, a JSON map); older ones the legacy service_role key.
  let serverKey = "";
  try { serverKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || ""; } catch { /* not set */ }
  serverKey ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL"), serverKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // Send one push; a device that's gone (404/410) is removed.
  async function push(d: Device, payload: unknown) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(payload), { TTL: 12 * 3600 });
      return true;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from("push_subscriptions").delete().eq("id", d.id);
      else console.error("push failed", e?.statusCode, e?.body || e?.message);
      return false;
    }
  }

  Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    let body: any = {};
    try { body = await req.json(); } catch { /* cron sends an empty body */ }

    if (body?.test) {
      const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
      const { data } = await sb.auth.getUser(token);
      if (!data?.user) return json({ error: "not_signed_in" }, 401);
      const { data: devices } = await sb.from("push_subscriptions").select("*").eq("user_id", data.user.id);
      let sent = 0;
      for (const d of devices || []) if (await push(d, { title: "LeafKin reminders are on", body: "This is what a reminder looks like. You'll get one on days when a plant needs care.", url: "./" })) sent++;
      return json({ sent });
    }

    const now = new Date();
    const { data: devices, error } = await sb.from("push_subscriptions").select("*");
    if (error) return json({ error: error.message }, 500);
    const due = (devices || []).filter((d: Device) => localHour(now, d.tz) === d.hour && d.last_sent !== localDate(now, d.tz));
    if (!due.length) return json({ checked: devices?.length || 0, sent: 0 });

    const users = [...new Set(due.map((d: Device) => d.user_id))];
    const { data: memberships } = await sb.from("household_members").select("user_id, household_id").in("user_id", users);
    const householdOf = new Map((memberships || []).map((m: any) => [m.user_id, m.household_id]));
    const households = [...new Set(householdOf.values())];
    const { data: plants } = households.length
      ? await sb.from("plants").select("household_id, name, water_every, feed_every, last_watered, last_fed, snooze_until").in("household_id", households)
      : { data: [] };

    let sent = 0;
    for (const d of due as Device[]) {
      const h = householdOf.get(d.user_id);
      const mine = (plants || []).filter((p: any) => p.household_id === h);
      const msg = reminderMessage(duePlants(mine, now, d.tz, d.winter));
      if (msg && (await push(d, msg))) sent++;
      await sb.from("push_subscriptions").update({ last_sent: localDate(now, d.tz), last_used_at: now.toISOString() }).eq("id", d.id);
    }
    return json({ checked: devices.length, due: due.length, sent });
  });
}
