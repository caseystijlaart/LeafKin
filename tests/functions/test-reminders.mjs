// Checks the reminder rules of the send-reminders Edge Function (pure parts only; no network).
// Usage: node tests/functions/test-reminders.mjs   (Node 22.18+ runs the TypeScript file directly)
import { duePlants, reminderMessage, localDate, localHour, nameList } from "../../supabase/functions/send-reminders/index.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${m}`); };
const tz = "Europe/Amsterdam";
const P = (name, o) => ({ name, water_every: 7, feed_every: 0, last_watered: null, last_fed: null, snooze_until: null, ...o });

// 8:00 in Amsterdam on 15 June 2026 (summer time, UTC+2)
const june = new Date("2026-06-15T06:00:00Z");
ok(localHour(june, tz) === 8 && localDate(june, tz) === "2026-06-15", "local hour and date in Amsterdam");
// Late evening UTC is already the next day in Amsterdam
ok(localDate(new Date("2026-06-15T22:30:00Z"), tz) === "2026-06-16", "dates follow the local calendar, not UTC");

let r = duePlants([
  P("Fern", { last_watered: "2026-06-08T19:00:00Z" }),      // 7 days ago → due
  P("Cactus", { last_watered: "2026-06-10T09:00:00Z" }),    // 5 days ago → not yet
  P("Basil", {}),                                          // never watered → due
  P("Lily", { last_watered: "2026-06-01T09:00:00Z", snooze_until: "2026-06-17T00:00:00Z" }), // snoozed
  P("Pothos", { water_every: 0, feed_every: 14, last_fed: "2026-05-30T10:00:00Z" }),        // feed due
], june, tz, true);
ok(r.water.join() === "Fern,Basil", "due for water: 7+ days since, or never watered; not snoozed");
ok(r.feed.join() === "Pothos", "due for food after its interval");

// Winter: water every 7 → 11 days, feeding paused
const jan = new Date("2027-01-20T07:00:00Z");
r = duePlants([P("Fern", { last_watered: "2027-01-11T10:00:00Z", feed_every: 14 }), P("Ivy", { last_watered: "2027-01-08T10:00:00Z" })], jan, tz, true);
ok(r.water.join() === "Ivy" && !r.feed.length, "winter care stretches watering and pauses feeding");
r = duePlants([P("Fern", { last_watered: "2027-01-11T10:00:00Z" })], jan, tz, false);
ok(r.water.join() === "Fern", "with winter care off, normal intervals apply");

// Daylight saving change (25 Oct 2026): still counts calendar days
r = duePlants([P("Fern", { last_watered: "2026-10-20T08:00:00Z" })], new Date("2026-10-27T07:00:00Z"), tz, false);
ok(r.water.length === 1, "7 calendar days across the clock change");

ok(nameList(["A"]) === "A" && nameList(["A", "B", "C"]) === "A, B and C" && nameList(["A", "B", "C", "D", "E", "F"]) === "A, B, C, D and 2 more", "plant names read naturally");
const m = reminderMessage({ water: ["Fern", "Basil"], feed: ["Pothos"] });
ok(m.title === "2 plants to water today" && m.body === "Fern and Basil. Feed: Pothos." && m.count === 3, `message: "${m.title}" / "${m.body}"`);
ok(reminderMessage({ water: [], feed: ["Pothos"] }).title === "1 plant to feed today", "food-only message");
ok(reminderMessage({ water: [], feed: [] }) === null, "nothing due → no notification");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
