// What each problem looks like: shown under the photo check as "What to look out for", so someone who doesn't know
// plants can compare their leaf with real examples. Photos: img/symptoms/, from the Indoor Plant Disease Image Dataset
// (Mahmud Opu et al.) and the Aloe Vera Leaf Disease Detection Dataset (Khan et al.), both CC BY 4.0 (see credits.js).
// Keys are the health check's symptom ids (js/health.js).
export const EXAMPLES = {
  spots: {
    look: "Round brown or black spots, often with a yellow ring, that spread or multiply. A natural pattern is even and repeats on every leaf; disease spots are random.",
    photos: [["spots-1.jpg", "Snake plant with fungal spots"], ["spots-2.jpg", "Snake plant: spots and a rotting patch"]],
  },
  brown_tips: {
    look: "Tips or edges turn brown, dry and papery, while the rest of the leaf stays green.",
    photos: [["brown_tips-1.jpg", "Spider plant: dried-out brown tip"], ["brown_tips-2.jpg", "Spider plant: tip browning down the leaf"]],
  },
  droop: {
    look: "Leaves hang limp, go soft or wrinkle and shrivel, instead of standing firm.",
    photos: [["droop-1.jpg", "Snake plant: withering, shrivelled leaf"], ["droop-2.jpg", "Snake plant: leaf drying out from the top"]],
  },
  scorch: {
    look: "Dry, bleached or tan patches, usually on the side facing the sun or a lamp.",
    photos: [["scorch-1.jpg", "Aloe: sunburnt, dried-out tissue"], ["scorch-2.jpg", "Aloe: pale, sun-bleached patches"]],
  },
  yellow_all: {
    look: "Many leaves, including new ones, turn pale or yellow: not just one old leaf at the bottom.",
    photos: [["yellow_all-1.jpg", "Pothos: leaf turned yellow"], ["yellow_all-2.jpg", "Pothos: yellow, blotchy leaf"]],
  },
  powder: {
    look: "A white, dusty layer on the leaves that you can wipe off with a finger.",
    photos: [],
  },
};
export const exampleUrl = (file) => new URL(`../img/symptoms/${file}`, import.meta.url).href;
