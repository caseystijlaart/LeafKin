// Care library: labels, species autocomplete and matching scan results to a care profile.
// The plant rows themselves live in plant-data.js.

export const LIGHT = { full: "Full sun", bright: "Bright, indirect", half: "Half shade", shade: "Shade" };
export const SUN_SHORT = { "0": "no direct sun", "0-2": "up to 2 h direct sun", "2-4": "2–4 h direct sun", "4-6": "4–6 h direct sun", "6+": "6+ h direct sun" };
export const SUN = { "0": "No direct sun", "0-2": "0–2 h (morning)", "2-4": "2–4 h", "4-6": "4–6 h", "6+": "6+ h" };
export const WATER = { moist: "Keep slightly moist", topdry: "Let top 2–3 cm dry", dry: "Let soil dry out fully" };
export const HUMIDITY = { low: "Low (dry air is fine)", normal: "Normal room air", high: "High (mist or tray)" };
export const PET = { safe: "Safe for pets", toxic: "Toxic to pets", unknown: "Unknown" };

import { PLANT_ROWS, CULTIVAR_ROWS } from "./plant-data.js";

export const SPECIES = PLANT_ROWS.map(([sci, en, nl, light, sun, water, waterDays, feedDays, humidity, pet, tip]) =>
  ({ sci, en, nl, light, sun, water, waterDays, feedDays, humidity, pet, tip }));

// Cultivars share their species' care. Variegated ones get brighter light.
const brighter = { shade: "half", half: "bright", bright: "bright", full: "full" };
export const CULTIVARS = CULTIVAR_ROWS.map(([baseSci, cv, variegated, tip]) => {
  const base = SPECIES.find((p) => p.sci === baseSci);
  if (!base) return null;
  return {
    ...base, base: base.sci, cultivar: cv,
    sci: `${base.sci} '${cv}'`, en: `${base.en} '${cv}'`, nl: `${base.nl} '${cv}'`,
    light: variegated ? brighter[base.light] : base.light,
    tip: tip || (variegated ? "Variegated: bright, indirect light keeps the colour; no harsh sun." : base.tip),
  };
}).filter(Boolean);

export const PLANTS = [...SPECIES, ...CULTIVARS];

// Lowercase, no accents, no quotes, single spaces.
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[\u2018\u2019'"`]/g, "").replace(/\s+/g, " ").trim();

// Autocomplete: best matches for what the user typed, in English, Dutch or Latin, in any word order.
// Every typed word must be the start of some word in the plant's names, so
// "spathiphyllum diamond", "peace lily dia" and "diamond" all find 'Diamond Sensation'.
export function searchPlants(q, limit = 10) {
  const n = norm(q);
  if (n.length < 2) return [];
  const tokens = n.split(" ");
  const scored = [];
  for (const p of PLANTS) {
    const names = [p.en, p.nl, p.sci, p.cultivar].filter(Boolean).map(norm);
    const words = new Set(names.join(" ").split(" "));
    let score = -1;
    if (names.some((name) => name.startsWith(n))) score = 3;
    else if (tokens.every((t) => [...words].some((w) => w.startsWith(t)))) score = 2;
    else if (names.some((name) => name.includes(n))) score = 1;
    if (score < 0) continue;
    // Prefer a cultivar when the query names it, and the plain species otherwise.
    const cvHit = p.cultivar && tokens.some((t) => norm(p.cultivar).split(" ").some((w) => w.startsWith(t)));
    scored.push([score + (cvHit ? 0.5 : p.cultivar ? 0 : 0.25), p]);
  }
  return scored.sort((a, b) => b[0] - a[0] || a[1].en.localeCompare(b[1].en)).slice(0, limit).map((x) => x[1]);
}

// Older or alternative names, and the profile to use when only the genus is known.
const ALIAS = {
  // older or alternative scientific names
  "calathea": "Goeppertia", "calathea orbifolia": "Goeppertia orbifolia", "calathea lancifolia": "Goeppertia lancifolia",
  "calathea makoyana": "Goeppertia makoyana", "calathea zebrina": "Goeppertia zebrina",
  "sansevieria": "Dracaena trifasciata", "sansevieria trifasciata": "Dracaena trifasciata", "sansevieria cylindrica": "Dracaena angolensis",
  "senecio rowleyanus": "Curio rowleyanus", "senecio radicans": "Curio radicans",
  "haworthia": "Haworthiopsis attenuata", "haworthia attenuata": "Haworthiopsis attenuata", "haworthia fasciata": "Haworthiopsis fasciata",
  "philodendron bipinnatifidum": "Thaumatophyllum bipinnatifidum", "philodendron selloum": "Thaumatophyllum bipinnatifidum",
  "philodendron scandens": "Philodendron hederaceum", "scindapsus aureus": "Epipremnum aureum",
  "rosmarinus officinalis": "Salvia rosmarinus", "solenostemon scutellarioides": "Coleus scutellarioides", "plectranthus scutellarioides": "Coleus scutellarioides",
  "dracaena massangeana": "Dracaena fragrans", "dracaena deremensis": "Dracaena fragrans", "dypsis lutescens": "Dypsis lutescens",
  "chrysalidocarpus lutescens": "Dypsis lutescens", "aloe barbadensis": "Aloe vera", "crassula argentea": "Crassula ovata",
  "kalanchoe tubiflora": "Kalanchoe daigremontiana", "bryophyllum daigremontianum": "Kalanchoe daigremontiana",
  "schlumbergera truncata": "Schlumbergera", "rhipsalidopsis gaertneri": "Hatiora gaertneri", "tradescantia pallida": "Tradescantia zebrina",
  "epiphyllum anguliger": "Epiphyllum", "fragaria ananassa": "Fragaria × ananassa", "citrus microcarpa": "Citrus × microcarpa",
  "mandevilla sanderi": "Mandevilla", "dipladenia": "Mandevilla", "cissus alata": "Cissus rhombifolia",
  // genus-only fallbacks
  "dracaena": "Dracaena fragrans", "ficus": "Ficus elastica", "monstera": "Monstera deliciosa", "strelitzia": "Strelitzia reginae",
  "philodendron": "Philodendron hederaceum", "peperomia": "Peperomia obtusifolia", "epipremnum": "Epipremnum aureum",
  "scindapsus": "Scindapsus pictus", "anthurium": "Anthurium andraeanum", "pilea": "Pilea peperomioides", "chamaedorea": "Chamaedorea elegans",
  "tradescantia": "Tradescantia zebrina", "goeppertia": "Goeppertia", "maranta": "Maranta leuconeura", "ceropegia": "Ceropegia woodii",
  "curio": "Curio rowleyanus", "haworthiopsis": "Haworthiopsis attenuata", "asparagus": "Asparagus setaceus", "cordyline": "Cordyline fruticosa",
  "phoenix": "Phoenix roebelenii", "zantedeschia": "Zantedeschia aethiopica", "hydrangea": "Hydrangea macrophylla", "lavandula": "Lavandula angustifolia",
  "salvia": "Salvia officinalis", "allium": "Allium schoenoprasum", "capsicum": "Capsicum annuum", "solanum": "Solanum lycopersicum",
  "jasminum": "Jasminum polyanthum", "saintpaulia": "Saintpaulia ionantha", "spathiphyllum": "Spathiphyllum wallisii", "yucca": "Yucca elephantipes",
};
const bySci = (s) => SPECIES.find((p) => norm(p.sci) === norm(s)) || null;

// Find a profile for a scientific name from Pl@ntNet: exact species, then known aliases, then the genus or family.
export function matchScientific(sciName, genus, family) {
  const n = norm(sciName);
  if (!n) return null;
  const g = norm(genus || n.split(" ")[0]);
  return bySci(n)
    || (ALIAS[n] && bySci(ALIAS[n]))
    || bySci(g)
    || (ALIAS[g] && bySci(ALIAS[g]))
    || SPECIES.find((p) => norm(p.sci).split(" ")[0] === g)
    || (norm(family) === "cactaceae" ? bySci("Cactaceae") : null);
}

// Find a profile from whatever is in the species field: an exact name, a cultivar name inside
// the text (e.g. "Spathiphyllum diamond sensation"), a name in brackets, or the genus.
export function matchAny(text) {
  const n = norm(text);
  if (!n) return null;
  const exact = PLANTS.find((p) => [p.en, p.nl, p.sci].some((x) => norm(x) === n));
  if (exact) return exact;

  const inBrackets = /\(([^)]+)\)/.exec(String(text));
  const species = (inBrackets && matchScientific(inBrackets[1]))
    || SPECIES.find((p) => [p.en, p.nl].some((x) => n.startsWith(norm(x) + " ")))
    || matchScientific(text);

  // Cultivar named in the text: it must belong to the species found, or be the only cultivar with that name.
  const hits = CULTIVARS.filter((c) => (` ${n} `).includes(` ${norm(c.cultivar)} `));
  if (hits.length) {
    const longest = Math.max(...hits.map((c) => c.cultivar.length));
    const best = hits.filter((c) => c.cultivar.length === longest);
    const ofSpecies = species && best.find((c) => c.base === species.sci);
    if (ofSpecies) return ofSpecies;
    if (!species && best.length === 1) return best[0];
  }
  return species || null;
}

export const displayName = (p) => `${p.en} (${p.sci})`;

// Known cultivars in a genus, for "which variety is it?" after a scan.
export function cultivarsForGenus(genus) {
  const g = norm(genus);
  if (!g) return [];
  return CULTIVARS.filter((c) => norm(c.base).split(" ")[0] === g || norm(ALIAS[g] || "").split(" ")[0] === norm(c.base).split(" ")[0]);
}
