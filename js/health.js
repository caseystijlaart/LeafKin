// Health check without AI: the symptoms you tick, combined with the plant's care profile and
// watering log, point to the most likely causes and a few short fixes.
import { daysBetween, dueIn } from "./util.js";

export const SYMPTOMS = [
  ["yellow_lower", "Yellow lower leaves"],
  ["yellow_all", "Pale or yellow all over"],
  ["brown_tips", "Brown, crispy tips or edges"],
  ["droop", "Drooping or wilting"],
  ["mushy", "Soft, mushy stems or base"],
  ["spots", "Brown or black spots"],
  ["curl", "Curling leaves"],
  ["drop", "Dropping leaves"],
  ["leggy", "Long, stretched stems"],
  ["pests", "Bugs, webs or sticky leaves"],
  ["powder", "White powder on leaves"],
  ["soil_mould", "Mould on the soil"],
  ["no_growth", "No new growth"],
];

const winter = (d = new Date()) => [10, 11, 0, 1].includes(d.getMonth());

// Returns { status: "healthy" | "watch" | "attention", causes: [{ title, why, actions: [] }] }
export function assess(plant, symptoms) {
  const set = new Set(symptoms);
  const c = plant.care || {};
  const W = plant.waterEvery || 0;
  const sinceWater = plant.lastWatered ? daysBetween(plant.lastWatered, new Date()) : null;
  const thirsty = W && sinceWater !== null && dueIn(plant.lastWatered, W) < -Math.ceil(W * 0.3);
  const justWatered = W && sinceWater !== null && sinceWater <= Math.floor(W / 2);
  const dryLover = c.water === "dry" || c.water === "topdry";
  const sunLover = c.light === "full" || c.light === "bright";
  const ownedDays = plant.createdAt ? daysBetween(plant.createdAt, new Date()) : 0;
  const unfed = plant.feedEvery && !winter() && (plant.lastFed ? daysBetween(plant.lastFed, new Date()) > plant.feedEvery * 2 : ownedDays > plant.feedEvery * 2);
  const out = [];
  const add = (title, why, actions) => { if (!out.some((x) => x.title === title)) out.push({ title, why, actions }); };

  if (set.has("mushy")) add("Root or stem rot", "Soft tissue usually means the roots sat wet too long.",
    ["Stop watering and check the roots: cut off brown, mushy ones.", "Repot in fresh, dry soil in a pot with drainage."]);

  if (set.has("droop")) {
    if (thirsty || set.has("curl")) add("Thirsty", sinceWater !== null ? `Last watered ${sinceWater} days ago.` : "No watering logged yet.",
      ["Water thoroughly until it drains from the bottom.", "Check the soil again in a few days."]);
    else if (justWatered) add("Too much water", "It droops even though the soil should still be wet.",
      ["Let the soil dry out before the next watering.", "Empty the saucer so roots don't stand in water."]);
    else add("Thirsty or stressed", "Drooping usually means water: feel the soil 3 cm down.",
      ["Water if the soil is dry; wait if it's still damp."]);
  }

  if (set.has("yellow_lower")) {
    if (dryLover && !thirsty) add("Too much water", "Yellow lower leaves are the classic sign of overwatering.",
      ["Let the top 2–3 cm dry before watering.", "Make sure the pot drains."]);
    else if (unfed) add("Hungry", "It hasn't been fed for a while.", ["Feed at half strength during spring and summer."]);
    else add("Old leaves ageing", "One or two yellow lower leaves now and then is normal.", ["Pull them off once they come loose easily."]);
  }

  if (set.has("yellow_all")) {
    if (unfed) add("Hungry", "Pale all over often means the soil is out of nutrients.", ["Feed at half strength, then on schedule.", "Repot if it's been more than two years."]);
    if (sunLover) add("Not enough light", "Sun-loving plants fade in a dark spot.", ["Move it closer to a window."]);
  }

  if (set.has("brown_tips")) {
    if (c.humidity === "high") add("Air too dry", "This plant likes humid air, and heated rooms dry it out.",
      ["Stand it on a tray of wet pebbles or group plants together.", "Keep it away from radiators."]);
    else if (thirsty) add("Thirsty", "Tips dry out when watering is late.", ["Water a little more regularly."]);
    else add("Dry air or hard water", "Crispy tips often come from dry air or tap-water salts.", ["Use rainwater or filtered water.", "Snip off brown tips with clean scissors."]);
  }

  if (set.has("spots")) add(c.light === "full" ? "Sunburn or leaf spot" : "Leaf spot", "Spots come from fungus, bacteria or (in strong sun) burning.",
    ["Remove the affected leaves.", "Water the soil, not the leaves, and give it some airflow."]);

  if (set.has("curl") && !thirsty) add("Heat, sun or pests", "Leaves curl to protect themselves.",
    ["Check the leaf undersides for bugs.", "Move it out of hot, direct afternoon sun."]);

  if (set.has("drop")) add("Shock or watering swing", "Leaf drop follows moves, cold drafts, or very wet or dry soil.",
    ["Keep it in one spot away from drafts.", "Water on a steady rhythm."]);

  if (set.has("leggy")) add("Not enough light", "Long gaps between leaves mean it's stretching for light.",
    ["Move it to a brighter spot.", "Prune the long stems to make it bushier."]);

  if (set.has("pests")) add("Pests", "Webs, sticky leaves or tiny bugs mean mites, aphids, mealybugs or scale.",
    ["Keep it away from other plants.", "Wipe the leaves with mild soapy water every few days."]);

  if (set.has("powder")) add("Powdery mildew", "A fungus that likes still, humid air.",
    ["Remove the worst leaves.", "Improve airflow and keep the leaves dry."]);

  if (set.has("soil_mould")) add("Soil stays too wet", "Mould grows when the top of the soil never dries.",
    ["Scrape off the top layer.", "Water less often and give it more light."]);

  if (set.has("no_growth")) {
    if (winter()) add("Winter rest", "Most houseplants barely grow from November to February. That's normal.", ["Water less and pause feeding until spring."]);
    else add("Stalled growth", "Usually too little light, no food, or a cramped pot.", ["Feed during spring and summer.", "Check if roots fill the pot; repot one size up."]);
  }

  let status = "healthy";
  if (out.length) status = ["Root or stem rot", "Pests", "Powdery mildew"].some((t) => out.some((x) => x.title === t)) ? "attention" : "watch";
  return { status, causes: out.slice(0, 3) };
}

export const STATUS_LABEL = { healthy: "Looks healthy", watch: "Keep an eye on it", attention: "Needs attention" };
