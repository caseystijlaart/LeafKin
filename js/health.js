// Health check without AI: the symptoms you tick, combined with the plant's care profile and
// watering log, point to the most likely causes and a few short fixes.
import { daysBetween, dueIn } from "./util.js";
import { waterInterval } from "./schedule.js";

export const SYMPTOMS = [
  ["yellow_lower", "Yellow lower leaves"],
  ["yellow_all", "Pale or yellow all over"],
  ["brown_tips", "Brown, crispy tips or edges"],
  ["droop", "Drooping or wilting"],
  ["mushy", "Soft, mushy stems or base"],
  ["spots", "Brown or black spots"],
  ["scorch", "Pale, bleached or scorched patches"],
  ["curl", "Curling leaves"],
  ["drop", "Dropping leaves"],
  ["leggy", "Long, stretched stems"],
  ["pests", "Bugs, webs or sticky leaves"],
  ["powder", "White powder on leaves"],
  ["soil_mould", "Mould on the soil"],
  ["no_growth", "No new growth"],
];

const winter = (d = new Date()) => [10, 11, 0, 1].includes(d.getMonth());

// How much of the plant is affected, asked once a symptom is ticked (both optional).
export const EXTENT = [["one", "One or two leaves"], ["several", "Several leaves"], ["much", "Much of the plant"]];
export const WHERE = [["old", "Old, lower leaves"], ["new", "New growth"], ["all", "All over"]];
const SERIOUS = ["mushy", "pests", "powder", "soil_mould"];   // never "just ageing"

// Returns { status: "healthy" | "watch" | "attention", causes: [{ title, why, actions: [] }] }
// scope: { extent: "one" | "several" | "much", where: "old" | "new" | "all" } (optional)
export function assess(plant, symptoms, scope = {}) {
  const { extent, where } = scope;
  // One or two old, lower leaves browning, yellowing or drying is how plants shed old leaves.
  if (symptoms.length && extent === "one" && where === "old" && !symptoms.some((s) => SERIOUS.includes(s))) {
    return { status: "healthy", causes: [{ title: "Normal leaf ageing", why: "Older, lower leaves fade, brown and die off as the plant grows. One or two at a time is normal, as long as new leaves look good.",
      actions: ["Pull the leaf off once it comes loose, or snip it off near the stem.", "Check again if more leaves follow, or if new leaves show the same."] }] };
  }
  const set = new Set(symptoms);
  const c = plant.care || {};
  const W = waterInterval(plant) || 0;
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

  if (set.has("scorch")) add("Sunburn", "Bleached or papery patches appear where strong sun hits a leaf, often after a move to a sunnier spot.",
    [c.light === "full" ? "Even sun lovers need a week or two to get used to more sun: shade it for a while." : "Move it out of direct midday sun, or filter the light with a sheer curtain.", "Burnt patches don't recover; trim them if they bother you."]);

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
  // The more of the plant is affected, and the newer the leaves, the more it matters.
  if (out.length && (extent === "much" || where === "new" || where === "all")) status = "attention";
  const causes = out.slice(0, 3);
  if (out.length && where === "new") causes.unshift({ title: "New growth is affected", why: "Problems on fresh leaves point to something going on now, not old age.",
    actions: ["Act on the causes below soon.", "Check again in a week: new leaves should come out healthy."] });
  else if (out.length && extent === "much") causes.unshift({ title: "Much of the plant is affected", why: "When many leaves show it, the cause is affecting the whole plant.",
    actions: ["Start with the most likely cause below.", "Take a photo now and again in two weeks to see if it stops spreading."] });
  return { status, causes: causes.slice(0, 3) };
}

export const STATUS_LABEL = { healthy: "Looks healthy", watch: "Keep an eye on it", attention: "Needs attention" };
