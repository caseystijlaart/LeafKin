// Daily push reminders on this device. The reminder itself is sent by the "send-reminders" Edge Function;
// this module asks permission, subscribes the device and stores it (with the chosen hour) in Supabase.
// iPhone: only works in LeafKin added to the Home Screen (iOS 16.4 or later).
import { VAPID_PUBLIC_KEY } from "./config.js";
import * as db from "./sync.js";
import { winterModeOn } from "./schedule.js";

const HOUR_KEY = "leafkin.pushHour";
export const configured = () => !!VAPID_PUBLIC_KEY;
export const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const permission = () => ("Notification" in window ? Notification.permission : "unsupported");
export function hour() { try { const h = Number(localStorage.getItem(HOUR_KEY)); return Number.isInteger(h) && h >= 0 && h < 24 && localStorage.getItem(HOUR_KEY) !== null ? h : 8; } catch { return 8; } }
const saveHour = (h) => { try { localStorage.setItem(HOUR_KEY, String(h)); } catch {} };

// The service worker can be missing (first open, private mode); don't wait for it forever.
const ready = () => Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error("no_worker")), 4000))]);

export async function subscription() {
  if (!supported()) return null;
  try { return await (await ready()).pushManager.getSubscription(); } catch { return null; }
}

const fromB64url = (s) => { const b = atob((s + "===".slice((s.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const toB64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const tz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam"; } catch { return "Europe/Amsterdam"; } };
const deviceName = () => (/iphone/i.test(navigator.userAgent) ? "iPhone" : /ipad/i.test(navigator.userAgent) ? "iPad" : /android/i.test(navigator.userAgent) ? "Android" : "Browser");

// Must be called from a tap (iOS only shows the permission prompt then).
export async function turnOn(h = hour()) {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("denied");
  const reg = await ready();
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64url(VAPID_PUBLIC_KEY) }));
  await db.savePushDevice({
    endpoint: sub.endpoint, p256dh: toB64url(sub.getKey("p256dh")), auth: toB64url(sub.getKey("auth")),
    device: deviceName(), hour: h, tz: tz(), winter: winterModeOn(),
  });
  saveHour(h);
}

export async function setHour(h) {
  saveHour(h);
  const sub = await subscription();
  if (sub) await db.updatePushDevice(sub.endpoint, { hour: h, tz: tz() });
}

// Keep the server's copy of the winter-care setting in step with this device.
export async function syncWinter() {
  const sub = await subscription();
  if (sub) await db.updatePushDevice(sub.endpoint, { winter: winterModeOn() }).catch(() => {});
}

// Stop reminders on this device (also used before signing out or deleting the account).
export async function turnOff() {
  const sub = await subscription();
  if (!sub) return;
  try { await db.deletePushDevice(sub.endpoint); } catch {}
  try { await sub.unsubscribe(); } catch {}
}

export const sendTest = () => db.sendTestPush();
