// Small pure helpers: dates, escaping, ids, image resizing, calendar export.

export const DAY = 86400000;

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);

// Days until the next action is due. null = no schedule, 0 = today, negative = overdue.
export function dueIn(last, every, now = new Date()) {
  if (!every) return null;
  if (!last) return 0;
  return every - daysBetween(last, now);
}

export function dueLabel(n) {
  if (n === null) return null;
  if (n < 0) return `${-n}d overdue`;
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n}d`;
}

export function ageLabel(fromIso, toIso) {
  const d = daysBetween(fromIso, toIso);
  if (d <= 0) return "Start";
  if (d < 14) return `+${d} day${d === 1 ? "" : "s"}`;
  if (d < 60) return `+${Math.round(d / 7)} weeks`;
  if (d < 730) return `+${Math.round(d / 30.4)} months`;
  return `+${(d / 365).toFixed(1).replace(/\.0$/, "")} years`;
}

export const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

// Shrink a camera photo to at most `max` px on the long side as JPEG, so storage stays small.
export async function resizeImage(file, max = 1280, quality = 0.82) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { bmp = await createImageBitmap(file); }
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode_failed"))), "image/jpeg", quality));
}

// ---- calendar (.ics) ----
const icsDate = (d) => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
const icsText = (s) => String(s).replace(/[\\;,]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

export function buildIcs(plants, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const events = [];
  for (const p of plants) {
    const jobs = [["water", p.waterEvery, p.lastWatered, "Water", p.care?.water], ["feed", p.feedEvery, p.lastFed, "Feed", p.care?.feed]];
    for (const [type, every, last, verb, note] of jobs) {
      if (!every) continue;
      const n = Math.max(0, dueIn(last, every, now));
      const start = new Date(startOfDay(now).getTime() + n * DAY);
      const end = new Date(start.getTime() + DAY);
      events.push([
        "BEGIN:VEVENT", `UID:${p.id}-${type}@leafkin`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(end)}`,
        `RRULE:FREQ=DAILY;INTERVAL=${every}`, `SUMMARY:${icsText(`${verb} ${p.name}`)}`,
        `DESCRIPTION:${icsText(note || "")}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsText(`${verb} ${p.name}`)}`, "TRIGGER:PT9H", "END:VALARM",
        "END:VEVENT",
      ].join("\r\n"));
    }
  }
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LeafKin//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:LeafKin", ...events, "END:VCALENDAR"].join("\r\n");
}
