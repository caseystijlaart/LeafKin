// Health check rules for "how much of the plant" (js/health.js). Usage: node tests/health/test-scope.mjs
import { assess } from "../../js/health.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${m}`); };
const plant = { waterEvery: 7, lastWatered: new Date().toISOString(), care: {}, createdAt: "2026-01-01T00:00:00Z" };

let r = assess(plant, ["brown_tips"], { extent: "one", where: "old" });
ok(r.status === "healthy" && r.causes[0].title === "Normal leaf ageing", "one old leaf with brown tips → normal ageing, plant healthy");
r = assess(plant, ["spots", "yellow_lower"], { extent: "one", where: "old" });
ok(r.status === "healthy", "one old leaf with spots and yellowing → still just ageing");
r = assess(plant, ["pests"], { extent: "one", where: "old" });
ok(r.status === "attention" && r.causes.some((c) => c.title === "Pests"), "pests are never 'just ageing'");
r = assess(plant, ["brown_tips"], {});
ok(r.status === "watch", "no answer to the questions → same as before");
r = assess(plant, ["brown_tips"], { extent: "several", where: "old" });
ok(r.status === "watch" && r.causes[0].title !== "Normal leaf ageing", "several old leaves → keep an eye on it, normal causes");
r = assess(plant, ["spots"], { extent: "one", where: "new" });
ok(r.status === "attention" && r.causes[0].title === "New growth is affected", "new growth affected → needs attention, says why");
r = assess(plant, ["brown_tips"], { extent: "much" });
ok(r.status === "attention" && r.causes[0].title === "Much of the plant is affected", "much of the plant → needs attention");
r = assess(plant, [], { extent: "one", where: "old" });
ok(r.status === "healthy" && r.causes.length === 0, "nothing ticked → healthy, no causes");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
