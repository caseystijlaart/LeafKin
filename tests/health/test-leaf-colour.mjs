// Which plants count as naturally coloured or patterned (js/leaf-colour.js). Usage: node tests/health/test-leaf-colour.mjs
import { naturalLeafColour as f } from "../../js/leaf-colour.js";
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`${c ? "✓" : "✗"} ${m}`); };
const p = (sci, care = {}) => ({ sci, care });
ok(f(p("Goeppertia orbifolia")) === "patterned", "calathea (genus match) is patterned");
ok(f(p("Begonia maculata")).includes("spotted"), "polka dot begonia: spots are normal");
ok(f(p("Scindapsus pictus")).includes("spotted"), "satin pothos: silver spots are normal");
ok(f(p("Spathiphyllum wallisii 'Diamond Sensation'")) === "variegated", "variegated cultivar from the library");
ok(f(p("Spathiphyllum wallisii")) === "", "plain peace lily is plain green");
ok(f(p("Monstera deliciosa")) === "", "plain monstera is plain green");
ok(f(p("Monstera deliciosa", { leafColour: "yes" })) !== "", "own setting 'coloured' wins (e.g. Thai Constellation not in the list)");
ok(f(p("Begonia maculata", { leafColour: "no" })) === "", "own setting 'plain green' wins");
ok(f(p("")) === "" && f(null) === "", "unknown plant → plain green");
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
