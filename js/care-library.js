// Built-in care profiles for common houseplants. Powers species autocomplete and automatic care fill.
// Intervals are for the growing season (spring–summer); the app reminds you to water less in winter.
//
// light: full = full sun · bright = bright, indirect · half = half shade · shade = shade
// sun:   direct sun hours per day ("0", "0-2", "2-4", "4-6", "6+")
// water: moist = keep slightly moist · topdry = let the top 2–3 cm dry · dry = let the soil dry out fully
// humidity: low · normal · high      pet: safe · toxic (to cats and dogs)

export const LIGHT = { full: "Full sun", bright: "Bright, indirect", half: "Half shade", shade: "Shade" };
export const SUN_SHORT = { "0": "no direct sun", "0-2": "up to 2 h direct sun", "2-4": "2–4 h direct sun", "4-6": "4–6 h direct sun", "6+": "6+ h direct sun" };
export const SUN = { "0": "No direct sun", "0-2": "0–2 h (morning)", "2-4": "2–4 h", "4-6": "4–6 h", "6+": "6+ h" };
export const WATER = { moist: "Keep slightly moist", topdry: "Let top 2–3 cm dry", dry: "Let soil dry out fully" };
export const HUMIDITY = { low: "Low (dry air is fine)", normal: "Normal room air", high: "High (mist or tray)" };
export const PET = { safe: "Safe for pets", toxic: "Toxic to pets", unknown: "Unknown" };

const P = (sci, en, nl, light, sun, water, waterDays, feedDays, humidity, pet, tip) =>
  ({ sci, en, nl, light, sun, water, waterDays, feedDays, humidity, pet, tip });

export const PLANTS = [
  P("Monstera deliciosa", "Swiss cheese plant", "Gatenplant", "bright", "0-2", "topdry", 7, 21, "normal", "toxic", "Give it a moss pole to climb."),
  P("Monstera adansonii", "Monkey mask monstera", "Monstera adansonii", "bright", "0-2", "topdry", 7, 21, "high", "toxic", "Likes humid air; brown edges mean too dry."),
  P("Epipremnum aureum", "Pothos", "Epipremnum", "half", "0-2", "topdry", 7, 28, "normal", "toxic", "Trim long vines to keep it bushy."),
  P("Scindapsus pictus", "Satin pothos", "Scindapsus", "half", "0-2", "topdry", 8, 28, "normal", "toxic", "Curling leaves mean it's thirsty."),
  P("Philodendron hederaceum", "Heartleaf philodendron", "Philodendron", "half", "0-2", "topdry", 7, 28, "normal", "toxic", "Very forgiving; trails or climbs."),
  P("Thaumatophyllum bipinnatifidum", "Philodendron selloum", "Philodendron selloum", "bright", "0-2", "topdry", 7, 21, "normal", "toxic", "Needs space; rotate for even growth."),
  P("Syngonium podophyllum", "Arrowhead plant", "Syngonium", "half", "0-2", "topdry", 7, 21, "normal", "toxic", "Pinch tips to keep it compact."),
  P("Dracaena trifasciata", "Snake plant", "Vrouwentong", "half", "0-2", "dry", 18, 42, "low", "toxic", "Overwatering is the main killer."),
  P("Zamioculcas zamiifolia", "ZZ plant", "Zamioculcas", "half", "0", "dry", 18, 42, "low", "toxic", "Copes with low light and neglect."),
  P("Spathiphyllum wallisii", "Peace lily", "Lepelplant", "half", "0", "moist", 5, 21, "high", "toxic", "Droops when thirsty, recovers fast after water."),
  P("Ficus lyrata", "Fiddle-leaf fig", "Vioolbladplant", "bright", "2-4", "topdry", 7, 21, "normal", "toxic", "Hates being moved and cold drafts."),
  P("Ficus elastica", "Rubber plant", "Rubberboom", "bright", "0-2", "topdry", 10, 28, "normal", "toxic", "Wipe the leaves to keep them shiny."),
  P("Ficus benjamina", "Weeping fig", "Treurvijg", "bright", "0-2", "topdry", 7, 21, "normal", "toxic", "Drops leaves after a move; it settles."),
  P("Chlorophytum comosum", "Spider plant", "Graslelie", "bright", "0-2", "topdry", 7, 21, "normal", "safe", "Pot up the babies to make new plants."),
  P("Goeppertia", "Calathea", "Calathea", "half", "0", "moist", 5, 21, "high", "safe", "Use rain or filtered water; tap water browns the tips."),
  P("Maranta leuconeura", "Prayer plant", "Gebedsplant", "half", "0", "moist", 5, 21, "high", "safe", "Leaves fold up at night; that's normal."),
  P("Aglaonema", "Chinese evergreen", "Aglaonema", "half", "0", "topdry", 8, 28, "normal", "toxic", "Handles low light well."),
  P("Dieffenbachia", "Dumb cane", "Dieffenbachia", "half", "0-2", "topdry", 7, 21, "normal", "toxic", "Sap irritates skin; wash hands after pruning."),
  P("Dracaena marginata", "Dragon tree", "Drakenboom", "bright", "0-2", "topdry", 10, 28, "low", "toxic", "Brown tips often come from tap water."),
  P("Dracaena fragrans", "Corn plant", "Massangeana", "half", "0", "topdry", 10, 28, "normal", "toxic", "Slow grower; water sparingly in winter."),
  P("Dracaena sanderiana", "Lucky bamboo", "Geluksbamboe", "half", "0", "moist", 7, 56, "normal", "toxic", "In water: refresh it every 1–2 weeks."),
  P("Schefflera arboricola", "Umbrella plant", "Vingersboom", "bright", "0-2", "topdry", 7, 28, "normal", "toxic", "Prune to shape; it branches well."),
  P("Yucca elephantipes", "Yucca", "Yucca", "full", "4-6", "dry", 14, 28, "low", "toxic", "Wants the sunniest window you have."),
  P("Beaucarnea recurvata", "Ponytail palm", "Olifantspoot", "full", "4-6", "dry", 14, 42, "low", "safe", "Stores water in its trunk; water rarely."),
  P("Strelitzia reginae", "Bird of paradise", "Paradijsvogelbloem", "full", "4-6", "topdry", 7, 14, "normal", "toxic", "Needs lots of light to flower."),
  P("Strelitzia nicolai", "White bird of paradise", "Strelitzia nicolai", "bright", "2-4", "topdry", 7, 14, "normal", "toxic", "Split leaves are natural."),
  P("Anthurium andraeanum", "Flamingo flower", "Anthurium", "bright", "0-2", "topdry", 7, 21, "high", "toxic", "Remove spent flowers at the base."),
  P("Phalaenopsis", "Moth orchid", "Vlinderorchidee", "bright", "0-2", "dry", 8, 14, "normal", "safe", "Soak 10 min when roots turn silvery, then drain."),
  P("Pilea peperomioides", "Chinese money plant", "Pannenkoekplant", "bright", "0-2", "topdry", 7, 28, "normal", "safe", "Turn weekly so it grows straight."),
  P("Peperomia obtusifolia", "Baby rubber plant", "Peperomia", "half", "0-2", "dry", 10, 28, "normal", "safe", "Thick leaves store water; don't overwater."),
  P("Hoya carnosa", "Wax plant", "Wasbloem", "bright", "0-2", "dry", 10, 28, "normal", "safe", "Don't cut the flower spurs; they bloom again."),
  P("Tradescantia zebrina", "Inch plant", "Vaderplant", "bright", "0-2", "topdry", 7, 28, "normal", "toxic", "Goes leggy in low light; pinch and replant cuttings."),
  P("Hedera helix", "English ivy", "Klimop", "half", "0-2", "topdry", 7, 28, "normal", "toxic", "Prone to spider mites in dry air."),
  P("Nephrolepis exaltata", "Boston fern", "Zwaardvaren", "half", "0", "moist", 4, 28, "high", "safe", "Never let it dry out completely."),
  P("Asplenium nidus", "Bird's nest fern", "Nestvaren", "half", "0", "moist", 5, 28, "high", "safe", "Water the soil, not the centre rosette."),
  P("Adiantum raddianum", "Maidenhair fern", "Venushaar", "half", "0", "moist", 3, 28, "high", "safe", "Fussy: steady moisture and humid air."),
  P("Chamaedorea elegans", "Parlour palm", "Dwergpalm", "half", "0", "topdry", 7, 28, "normal", "safe", "Does fine away from the window."),
  P("Dypsis lutescens", "Areca palm", "Goudpalm", "bright", "0-2", "topdry", 7, 28, "normal", "safe", "Brown tips: raise humidity, use soft water."),
  P("Howea forsteriana", "Kentia palm", "Kentiapalm", "half", "0", "topdry", 10, 28, "normal", "safe", "Slow and tough; good for darker rooms."),
  P("Alocasia", "Elephant ear", "Olifantsoor", "bright", "0-2", "topdry", 5, 14, "high", "toxic", "May go dormant in winter; keep it slightly dry."),
  P("Begonia maculata", "Polka dot begonia", "Begonia maculata", "bright", "0-2", "topdry", 7, 21, "high", "toxic", "Don't mist the leaves; use a humidity tray."),
  P("Fittonia albivenis", "Nerve plant", "Mozaïekplant", "half", "0", "moist", 4, 28, "high", "safe", "Faints dramatically when dry; water and it revives."),
  P("Ceropegia woodii", "String of hearts", "Chinees lampionplantje", "bright", "0-2", "dry", 10, 28, "low", "safe", "Thin, soft leaves mean it needs water."),
  P("Curio rowleyanus", "String of pearls", "Erwtenplant", "bright", "2-4", "dry", 14, 42, "low", "toxic", "Wrinkled pearls mean it's thirsty."),
  P("Aloe vera", "Aloe vera", "Aloë vera", "full", "6+", "dry", 18, 56, "low", "toxic", "Use a cactus soil mix with good drainage."),
  P("Crassula ovata", "Jade plant", "Jadeplant", "full", "4-6", "dry", 14, 42, "low", "toxic", "Wrinkled leaves mean water; mushy means too much."),
  P("Echeveria", "Echeveria", "Echeveria", "full", "6+", "dry", 14, 42, "low", "safe", "Stretching means it needs more sun."),
  P("Haworthiopsis attenuata", "Zebra haworthia", "Haworthia", "bright", "2-4", "dry", 14, 42, "low", "safe", "Takes less sun than most succulents."),
  P("Cactaceae", "Cactus", "Cactus", "full", "6+", "dry", 21, 56, "low", "safe", "Barely any water in winter."),
  P("Kalanchoe blossfeldiana", "Kalanchoe", "Kalanchoë", "full", "4-6", "dry", 14, 28, "low", "toxic", "Short days trigger new flowers."),
  P("Saintpaulia ionantha", "African violet", "Kaaps viooltje", "bright", "0-2", "topdry", 5, 14, "normal", "safe", "Water from below; drops on leaves leave spots."),
  P("Cyclamen persicum", "Cyclamen", "Cyclaam", "half", "0", "moist", 5, 14, "normal", "toxic", "Likes it cool, about 15 °C."),
  P("Ocimum basilicum", "Basil", "Basilicum", "full", "6+", "moist", 2, 14, "normal", "safe", "Pick from the top to keep it bushy."),
  P("Lavandula angustifolia", "Lavender", "Lavendel", "full", "6+", "dry", 7, 28, "low", "toxic", "Prune after flowering; never into old wood."),
  P("Citrus limon", "Lemon tree", "Citroenboom", "full", "6+", "topdry", 5, 14, "normal", "toxic", "Bring indoors before frost."),
  P("Olea europaea", "Olive tree", "Olijfboom", "full", "6+", "dry", 10, 28, "low", "safe", "Hardy to about −5 °C in a sheltered spot."),
  P("Musa", "Banana plant", "Bananenplant", "full", "4-6", "moist", 4, 14, "high", "safe", "Thirsty and hungry in summer."),
];

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Autocomplete: best matches for what the user typed, in English, Dutch or Latin.
export function searchPlants(q, limit = 6) {
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
  "calathea": "Goeppertia", "sansevieria": "Dracaena trifasciata", "sansevieria trifasciata": "Dracaena trifasciata",
  "senecio rowleyanus": "Curio rowleyanus", "haworthia": "Haworthiopsis attenuata", "philodendron bipinnatifidum": "Thaumatophyllum bipinnatifidum",
  "dracaena": "Dracaena fragrans", "ficus": "Ficus elastica", "monstera": "Monstera deliciosa", "strelitzia": "Strelitzia reginae",
  "philodendron": "Philodendron hederaceum", "begonia": "Begonia maculata", "citrus": "Citrus limon", "peperomia": "Peperomia obtusifolia",
};
const bySci = (s) => PLANTS.find((p) => norm(p.sci) === norm(s)) || null;

// Find a profile for a scientific name from Pl@ntNet: exact species, then known aliases, then the genus or family.
export function matchScientific(sciName, genus, family) {
  const n = norm(sciName);
  if (!n) return null;
  const g = norm(genus || n.split(" ")[0]);
  return bySci(n)
    || (ALIAS[n] && bySci(ALIAS[n]))
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
