// Care library: labels, species autocomplete and matching scan results to a care profile.
// The plant rows themselves live in plant-data.js.

export const LIGHT = { full: "Full sun", bright: "Bright, indirect", half: "Half shade", shade: "Shade" };
export const SUN_SHORT = { "0": "no direct sun", "0-2": "up to 2 h direct sun", "2-4": "2–4 h direct sun", "4-6": "4–6 h direct sun", "6+": "6+ h direct sun" };
export const SUN = { "0": "No direct sun", "0-2": "0–2 h (morning)", "2-4": "2–4 h", "4-6": "4–6 h", "6+": "6+ h" };
export const WATER = { moist: "Keep slightly moist", topdry: "Let top 2–3 cm dry", dry: "Let soil dry out fully" };
export const HUMIDITY = { low: "Low (dry air is fine)", normal: "Normal room air", high: "High (mist or tray)" };
export const PET = { safe: "Safe for pets", toxic: "Toxic to pets", unknown: "Unknown" };

import { PLANT_ROWS } from "./plant-data.js";

export const PLANTS = PLANT_ROWS.map(([sci, en, nl, light, sun, water, waterDays, feedDays, humidity, pet, tip]) =>
  ({ sci, en, nl, light, sun, water, waterDays, feedDays, humidity, pet, tip }));

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Autocomplete: best matches for what the user typed, in English, Dutch or Latin.
export function searchPlants(q, limit = 8) {
  const n = norm(q);
  if (n.length < 2) return [];
  const scored = [];
  for (const p of PLANTS) {
    const names = [p.en, p.nl, p.sci].map(norm);
    let best = -1;
    for (const name of names) {
      if (name.startsWith(n)) best = Math.max(best, 3);
      else if (name.split(/\s+/).some((w) => w.startsWith(n))) best = Math.max(best, 2);
      else if (name.includes(n)) best = Math.max(best, 1);
    }
    if (best >= 0) scored.push([best, p]);
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
const bySci = (s) => PLANTS.find((p) => norm(p.sci) === norm(s)) || null;

// Find a profile for a scientific name from Pl@ntNet: exact species, then known aliases, then the genus or family.
export function matchScientific(sciName, genus, family) {
  const n = norm(sciName);
  if (!n) return null;
  const g = norm(genus || n.split(" ")[0]);
  return bySci(n)
    || (ALIAS[n] && bySci(ALIAS[n]))
    || bySci(g)
    || (ALIAS[g] && bySci(ALIAS[g]))
    || PLANTS.find((p) => norm(p.sci).split(" ")[0] === g)
    || (norm(family) === "cactaceae" ? bySci("Cactaceae") : null);
}

// Find a profile from whatever is in the species field.
export function matchAny(text) {
  const n = norm(text);
  if (!n) return null;
  return PLANTS.find((p) => [p.en, p.nl, p.sci].some((x) => norm(x) === n)) || matchScientific(text) || null;
}

export const displayName = (p) => `${p.en} (${p.sci})`;
