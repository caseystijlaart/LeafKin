// Pl@ntNet species identification, called straight from the browser.
// The API key lives only on this device (Settings). In my.plantnet.org, tick "expose my API key"
// and add the site's address (e.g. https://caseystijlaart.github.io) under Authorized domains.

const KEY = "leafkin.plantnetKey";
const ENDPOINT = "https://my-api.plantnet.org/v2/identify/all";

export function getKey() { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } }
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
  const url = `${ENDPOINT}?api-key=${encodeURIComponent(key)}&lang=en&nb-results=5&include-related-images=false`;
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
  }));
}

export const errorText = (code) => ({
  no_key: "Add your free Pl@ntNet API key in Settings to scan plants.",
  offline: "You're offline. Scanning needs an internet connection.",
  blocked: "Pl@ntNet refused the request. Check that this site's address is listed under Authorized domains for your key.",
  bad_key: "Pl@ntNet didn't accept the API key. Check it in Settings.",
  quota: "Today's free scans are used up. Try again tomorrow.",
}[code] || "Scanning didn't work. Try again with a clearer photo.");
