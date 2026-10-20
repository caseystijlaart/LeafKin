// Small pure helpers: dates, escaping, ids, image resizing.

export const DAY = 86400000;

export const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
// Midnight `n` calendar days after `d` (safe across daylight-saving changes).
export const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };

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
// Random UUID v4 (the database uses UUIDs for every id).
export const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

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
