// Plants whose healthy leaves are naturally coloured, patterned, spotted or variegated. The photo check learned
// "brown, spotted or pale = sick" mostly from green leaves, so for these it is more careful (see app.js).
// Keys: a scientific species name, or a genus (first word) that covers the whole genus.
import { PLANTS } from "./care-library.js";

const COLOURFUL = {
  // aroids
  "Epipremnum aureum": "streaked", "Scindapsus pictus": "silver-spotted", "Scindapsus treubii": "silver-marked",
  "Philodendron erubescens": "red-tinted", "Philodendron melanochrysum": "dark, veined", "Philodendron micans": "bronze",
  "Philodendron birkin": "striped", "Syngonium podophyllum": "variegated or pink", "Aglaonema": "patterned or red",
  "Dieffenbachia": "variegated", "Anthurium clarinervium": "white-veined", "Alocasia amazonica": "dark, white-veined",
  "Alocasia zebrina": "patterned", "Caladium": "coloured", "Monstera standleyana": "variegated",
  // prayer plants
  Goeppertia: "patterned", Maranta: "patterned", Stromanthe: "pink and cream", Ctenanthe: "patterned",
  // colourful foliage
  "Ficus elastica": "dark or variegated", "Dracaena marginata": "red-edged", "Dracaena fragrans": "striped",
  "Dracaena trifasciata": "banded", "Chlorophytum comosum": "striped", Cordyline: "red or purple",
  Codiaeum: "multicoloured", Tradescantia: "striped or purple", Callisia: "pink-tinted", Coleus: "multicoloured",
  Hemigraphis: "purple", Oxalis: "purple", Begonia: "spotted or patterned", Fittonia: "veined",
  Hypoestes: "spotted", "Pilea cadierei": "silver-patched", "Pilea involucrata": "bronze",
  "Peperomia argyreia": "striped", "Peperomia caperata": "dark or red", "Peperomia prostrata": "patterned",
  Ludisia: "dark red", Episcia: "copper", Cryptanthus: "banded", Neoregelia: "red-centred", Vriesea: "banded",
  "Aechmea fasciata": "silver-banded", Guzmania: "coloured", Heuchera: "purple or bronze", "Acer palmatum": "red",
  Hosta: "variegated", Pelargonium: "zoned", "Euphorbia pulcherrima": "red bracts",
  // succulents (often red edges, bands or a bloom)
  Haworthiopsis: "white-banded", Echeveria: "pink-edged", Graptopetalum: "pinkish", Graptoveria: "pinkish",
  "Kalanchoe tomentosa": "brown-edged", Aeonium: "dark or red", "Crassula ovata": "red-edged", Sedum: "red-tinted",
  Sempervivum: "red-tinted", Lithops: "patterned", Gymnocalycium: "red or yellow", "Euphorbia trigona": "red-tinted",
  "Senecio serpens": "blue-grey",
};

// Varieties with plain green leaves of a species that is listed above as coloured.
const PLAIN = new Set(["Philodendron erubescens 'Green Princess'", "Epipremnum pinnatum 'Cebu Blue'", "Epipremnum pinnatum 'Baltic Blue'"]);

// Returns a short description ("patterned", "silver-spotted", …) or "" for plain green leaves.
// A setting on the plant (care.leafColour: "yes" | "no") overrides the library.
export function naturalLeafColour(plant) {
  const own = plant?.care?.leafColour;
  if (own === "no") return "";
  if (own === "yes") return "coloured or patterned";
  const sci = plant?.sci || "";
  const lib = PLANTS.find((x) => x.sci === sci);
  if (lib?.variegated) return "variegated";
  if (PLAIN.has(sci)) return "";
  const base = lib?.base || sci.replace(/\s*'.*$/, "");
  return COLOURFUL[base] || COLOURFUL[base.split(" ")[0]] || "";
}
