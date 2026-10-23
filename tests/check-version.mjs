// Checks that the version number matches in the README, the app and the service worker.
// Usage: node tests/check-version.mjs
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const app = read("js/app.js").match(/APP_VERSION = "([\d.]+)"/)?.[1];
const sw = read("sw.js").match(/\+ "v([\d.]+)"/)?.[1];
const readme = read("README.md").match(/\*\*Version ([\d.]+)\*\*/)?.[1];
const ok = app && app === sw && app === readme;
console.log(`${ok ? "✓" : "✗"} app ${app}, service worker ${sw}, README ${readme}`);
process.exit(ok ? 0 : 1);
