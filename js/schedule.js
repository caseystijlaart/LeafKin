// When each plant needs something: watering, feeding, repotting and a new photo.
// Winter mode (November–February) stretches watering and pauses feeding.
import { daysBetween, dueIn, addDays } from "./util.js";

const WINTER_MONTHS = [10, 11, 0, 1];
const SPRING_MONTHS = [2, 3, 4];
export const isWinter = (d = new Date()) => WINTER_MONTHS.includes(d.getMonth());
export const isSpring = (d = new Date()) => SPRING_MONTHS.includes(d.getMonth());

export function winterModeOn() { try { return localStorage.getItem("leafkin.winter") !== "off"; } catch { return true; } }
export function setWinterMode(on) { try { localStorage.setItem("leafkin.winter", on ? "on" : "off"); } catch {} }
export const winterActive = () => winterModeOn() && isWinter();

// Intervals that apply today.
export function waterInterval(p) {
  if (!p.waterEvery) return 0;
  return winterActive() ? Math.round(p.waterEvery * 1.5) : p.waterEvery;
}
export function feedInterval(p) {
  if (!p.feedEvery) return 0;
  return winterActive() ? 0 : p.feedEvery;
}

// Days until due (negative = overdue, null = no reminder). A "still damp" snooze pushes watering out.
export function waterDue(p, now = new Date()) {
  const W = waterInterval(p);
  if (!W) return null;
  let d = dueIn(p.lastWatered, W, now);
  if (p.snoozeUntil) d = Math.max(d, daysBetween(now, p.snoozeUntil));
  return d;
}
export function feedDue(p, now = new Date()) {
  const F = feedInterval(p);
  return F ? dueIn(p.lastFed, F, now) : null;
}

// Snooze watering: check again `days` after it would have been due (or after today).
export function snoozeDate(p, days = 2, now = new Date()) {
  const due = Math.max(waterDue(p, now) ?? 0, 0);
  return addDays(now, due + days).toISOString();
}

// Repotting: about every two years, reminded in spring.
export const REPOT_DAYS = 730;
export function repotDue(p, now = new Date()) {
  const since = p.lastRepotted || p.createdAt;
  return !!since && isSpring(now) && daysBetween(since, now) >= REPOT_DAYS;
}

// Growth photos: a gentle nudge when the last one is a month old.
export const PHOTO_DAYS = 30;
export function lastPhotoAt(p) {
  const shots = (p.growth || []).filter((g) => g.photoId).map((g) => g.at).sort();
  return shots[shots.length - 1] || null;
}
export function photoDue(p, now = new Date()) {
  const last = lastPhotoAt(p) || p.createdAt;
  return !!last && daysBetween(last, now) >= PHOTO_DAYS;
}

// Lower = sooner. Used for sorting and the "Needs care today" group.
export function urgency(p) {
  return Math.min(waterDue(p) ?? 99, feedDue(p) ?? 99, repotDue(p) ? 0 : 99);
}

// Timeline photo limit: one photo per plant per week (or month), so the timeline stays even.
export const PHOTO_PERIODS = { week: { days: 7, label: "week" }, month: { days: 30, label: "month" } };
export function photoPeriod() { try { return localStorage.getItem("leafkin.photoPeriod") === "month" ? "month" : "week"; } catch { return "week"; } }
export function setPhotoPeriod(v) { try { localStorage.setItem("leafkin.photoPeriod", v === "month" ? "month" : "week"); } catch {} }
export const photoPeriodDays = () => PHOTO_PERIODS[photoPeriod()].days;

// The existing timeline photo that's too close to `atIso`, if any.
export function blockingPhoto(p, atIso) {
  const days = photoPeriodDays();
  return (p.growth || []).filter((g) => g.photoId)
    .sort((a, b) => Math.abs(daysBetween(a.at, atIso)) - Math.abs(daysBetween(b.at, atIso)))
    .find((g) => Math.abs(daysBetween(g.at, atIso)) < days) || null;
}
// First day a new photo is allowed again (null when it already is).
export function nextPhotoDate(p, now = new Date()) {
  const last = lastPhotoAt(p);
  if (!last) return null;
  const next = addDays(last, photoPeriodDays());
  return next > now ? next : null;
}
