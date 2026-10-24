// Pl@ntNet species identification, called straight from the browser.
// The site's key comes from config.js (written at deploy time from a GitHub secret).
// A key entered in Settings on a device overrides it.
// In my.plantnet.org, tick "expose my API key" and add https://caseystijlaart.github.io under Authorized domains.
import { PLANTNET_KEY } from "./config.js";

const KEY = "leafkin.plantnetKey";
const ENDPOINT = "https://my-api.plantnet.org/v2/identify/all";

export function deviceKey() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } }
export const hasSiteKey = () => !!PLANTNET_KEY;
export function getKey() { return deviceKey() || PLANTNET_KEY; }
export function setKey(v) { try { v ? localStorage.setItem(KEY, v.trim()) : localStorage.removeItem(KEY); } catch {} }

export class IdentifyError extends Error {
  constructor(code) { super(code); this.code = code; }
}

// Returns up to 5 candidates: [{ sci, genus, family, common: [], score }]
export async function identify(blob) {
  const key = getKey();
  if (!key) throw new IdentifyError("no_key");
  const form = new FormData();
  form.append("images", blob, "plant.jpg");
  form.append("organs", "auto");
  const url = `${ENDPOINT}?api-key=${encodeURIComponent(key)}&lang=en&nb-results=5&include-related-images=true`;
  let res;
  try { res = await fetch(url, { method: "POST", body: form }); }
  catch { throw new IdentifyError(navigator.onLine === false ? "offline" : "blocked"); }
  if (res.status === 404) return [];
  if (res.status === 401 || res.status === 403) throw new IdentifyError("bad_key");
  if (res.status === 429) throw new IdentifyError("quota");
  if (!res.ok) throw new IdentifyError("failed");
  const data = await res.json();
  return (data.results || []).slice(0, 5).map((r) => ({
    sci: r.species?.scientificNameWithoutAuthor || "",
    genus: r.species?.genus?.scientificNameWithoutAuthor || "",
    family: r.species?.family?.scientificNameWithoutAuthor || "",
    common: r.species?.commonNames || [],
    score: r.score || 0,
    images: (r.images || []).map(refImage).filter(Boolean).slice(0, 4),
  }));
}

// Disease identification (same key and daily quota as scanning; "a limited list of species and pathologies").
// Returns [{ code, name, score }] best first; [] when Pl@ntNet finds nothing.
export async function identifyDisease(blob) {
  const key = getKey();
  if (!key) throw new IdentifyError("no_key");
  const form = new FormData();
  form.append("images", blob, "leaf.jpg");
  form.append("organs", "leaf");
  let res;
  try { res = await fetch(`https://my-api.plantnet.org/v2/diseases/identify?api-key=${encodeURIComponent(key)}&lang=en&nb-results=5`, { method: "POST", body: form }); }
  catch { throw new IdentifyError(navigator.onLine === false ? "offline" : "blocked"); }
  if (res.status === 404) return [];
  if (res.status === 401 || res.status === 403) throw new IdentifyError("bad_key");
  if (res.status === 429) throw new IdentifyError("quota");
  if (!res.ok) throw new IdentifyError("failed");
  const data = await res.json();
  return (data.results || []).map((r) => ({ code: r.name || "", name: r.description || r.name || "", score: r.score || 0 }));
}

const ORGANS = { leaf: "Leaf", flower: "Flower", fruit: "Fruit", bark: "Bark", habit: "Whole plant", other: "" };
// Pl@ntNet reference photo: small and large URL plus the credit their terms ask for.
function refImage(img) {
  const u = img?.url;
  const thumb = typeof u === "string" ? u : u?.s || u?.m || u?.o;
  const full = typeof u === "string" ? u : u?.m || u?.o || u?.s; // medium: sharp enough, far smaller than the original
  if (!thumb || !/^https:\/\//.test(thumb)) return null;
  return {
    thumb, full,
    organ: ORGANS[img.organ] || "",
    credit: `${img.author || "Unknown"} / Pl@ntNet, ${String(img.license || "cc-by-sa").toUpperCase().replace(/^CC-/, "CC ")}`,
  };
}

export const errorText = (code) => ({
  no_key: "Scanning isn\u2019t set up yet. Add a Pl@ntNet API key in Settings.",
  offline: "You're offline. Scanning needs an internet connection.",
  blocked: "Pl@ntNet refused the request. Check that this site's address is listed under Authorized domains for your key.",
  bad_key: "Pl@ntNet didn't accept the API key. Check it in Settings.",
  quota: "Today's free scans are used up. Try again tomorrow.",
}[code] || "Scanning didn't work. Try again with a clearer photo.");
