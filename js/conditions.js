// Where a plant stands decides how much light it gets, and light decides how fast the soil dries.
// Spot → light + direct sun → watering and feeding interval.

export const ROOMS = {
  living: "Living room", bedroom: "Bedroom", kitchen: "Kitchen", bathroom: "Bathroom",
  office: "Office or study", hall: "Hallway or stairs", outdoor: "Balcony or garden", other: "Other",
};

// Window directions are for the Netherlands (northern hemisphere).
export const SPOTS = {
  south: "South-facing window", west: "West-facing window", east: "East-facing window", north: "North-facing window",
  near: "1–2 m from a window", far: "Far from windows",
  out_sun: "Outside, sunny", out_shade: "Outside, shaded",
};
const SPOT_LIGHT = {
  south: ["full", "4-6"], west: ["bright", "2-4"], east: ["bright", "0-2"], north: ["half", "0"],
  near: ["bright", "0"], far: ["shade", "0"], out_sun: ["full", "6+"], out_shade: ["half", "0"],
};
export const lightForSpot = (spot) => SPOT_LIGHT[spot] || null;

const L = { shade: 0, half: 1, bright: 2, full: 3 };
const S = { "0": 0, "0-2": 0.5, "2-4": 1, "4-6": 1.5, "6+": 2 };
const exposure = (light, sun) => (L[light] ?? 2) + (S[sun] ?? 0.5);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// prof: the plant's care profile (its ideal light and its watering at that light).
// Returns the adjusted intervals, how far the spot is from ideal, and a short reason.
export function adjustForConditions(prof, { light, sun, room } = {}) {
  if (!prof) return null;
  const diff = light ? exposure(light, sun) - exposure(prof.light, prof.sun) : 0;
  let waterF = clamp(1 - 0.18 * diff, 0.6, 1.7);
  if (room === "bathroom") waterF *= 1.15;   // humid air, soil dries slower
  if (room === "outdoor") waterF *= 0.75;    // wind and sun dry pots fast
  const water = Math.max(1, Math.round(prof.waterDays * waterF));
  const feed = prof.feedDays ? Math.round(prof.feedDays * (diff <= -1.5 ? 1.5 : 1)) : 0;
  let fit = "good";
  if (diff <= -1.5) fit = "dark";
  else if (diff >= 1.5) fit = "bright";
  return { water, feed, diff, fit };
}

export function fitText(fit, prof) {
  const name = prof?.en || "this plant";
  if (fit === "dark") return `Darker than a ${name} likes: it grows slower and needs less water.`;
  if (fit === "bright") return `Sunnier than a ${name} likes: watch for pale or scorched leaves.`;
  return "";
}

export function spotLabel(room, spot) {
  return [ROOMS[room], SPOTS[spot]].filter(Boolean).join(" · ");
}
