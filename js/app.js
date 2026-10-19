import * as db from "./db.js";
import { DAY, daysBetween, dueIn, dueLabel, ageLabel, fmtDate, fmtDateTime, esc, uid, resizeImage, buildIcs } from "./util.js";
import { PLANTS, SPECIES, CULTIVARS, LIGHT, SUN, SUN_SHORT, WATER, HUMIDITY, PET, searchPlants, matchScientific, matchAny, cultivarsForGenus } from "./care-library.js";
import * as plantnet from "./plantnet.js";
import { SYMPTOMS, assess, STATUS_LABEL } from "./health.js";

const APP_VERSION = "1.2.1";
const $ = (s, root = document) => root.querySelector(s);
const state = { plants: [] };
const isWinter = () => [10, 11, 0, 1].includes(new Date().getMonth());

/* ---------- photos: blob -> object URL cache ---------- */
const urlCache = new Map();
async function photoUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const blob = await db.getPhoto(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}
function hydratePhotos(root) {
  root.querySelectorAll("img[data-photo]").forEach(async (img) => {
    const url = await photoUrl(img.dataset.photo);
    if (url) img.src = url; else img.removeAttribute("data-photo");
  });
}
const sortedGrowth = (p) => [...(p.growth || [])].sort((a, b) => a.at.localeCompare(b.at));
const latestPhotoId = (p) => sortedGrowth(p).filter((g) => g.photoId).pop()?.photoId;
async function storePhoto(file) {
  const blob = await resizeImage(file);
  const id = uid();
  await db.putPhoto(id, blob);
  return id;
}

/* ---------- data ---------- */
async function load() { state.plants = await db.getPlants(); }
async function savePlant(p) {
  p.updatedAt = new Date().toISOString();
  const i = state.plants.findIndex((x) => x.id === p.id);
  if (i >= 0) state.plants[i] = p; else state.plants.push(p);
  render();
  try { await db.putPlant(p); }
  catch { toast("Couldn't save on this device. Free up some storage and try again."); }
}

/* ---------- list ---------- */
const subtitle = (p) => p.sci && p.sci !== p.name ? p.sci : p.species && p.species !== p.name ? p.species : "";
const urgency = (p) => Math.min(dueIn(p.lastWatered, p.waterEvery) ?? 99, dueIn(p.lastFed, p.feedEvery) ?? 99);
const lastCheck = (p) => (p.checks || [])[0];
const statusPill = (s) => `<span class="pill ${s === "healthy" ? "ok" : s === "attention" ? "alert" : "food"}">${esc(STATUS_LABEL[s] || s)}</span>`;

function chipsFor(p, withHealth = true) {
  const out = [];
  const w = dueIn(p.lastWatered, p.waterEvery);
  if (w !== null) out.push(`<span class="pill ${w < 0 ? "alert" : w <= 1 ? "water" : "plain"}">💧 Water ${esc(dueLabel(w))}</span>`);
  const f = dueIn(p.lastFed, p.feedEvery);
  if (f !== null) out.push(`<span class="pill ${f < 0 ? "alert" : f <= 1 ? "food" : "plain"}">Feed ${esc(dueLabel(f))}</span>`);
  const lc = lastCheck(p);
  if (withHealth && lc && lc.status !== "healthy") out.push(statusPill(lc.status));
  return out.join("");
}
const leafSvg = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M20 4c-8 0-14 4-14 11 0 1.2.2 2.3.6 3.3L4 21l1.4 1.4 2.5-2.5c1 .4 2 .6 3.1.6 7 0 9-7 9-16.5Zm-9 14.5c-.6 0-1.2-.1-1.7-.3l6.4-6.4-1.4-1.4-6.4 6.4c-.2-.5-.3-1.1-.3-1.8 0-5 4-8.3 10.4-8.9C17.4 13 15.6 18.5 11 18.5Z"/></svg>`;
const camSvg = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>`;

function render() {
  $("#today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const list = $("#list");
  const sorted = [...state.plants].sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));
  $("#emptyState").hidden = sorted.length > 0;
  $("#addBtn").hidden = sorted.length === 0;
  list.querySelectorAll(".plant").forEach((n) => n.remove());
  let waterDue = 0, feedDue = 0;
  for (const p of sorted) {
    const w = dueIn(p.lastWatered, p.waterEvery), f = dueIn(p.lastFed, p.feedEvery);
    if (w !== null && w <= 0) waterDue++;
    if (f !== null && f <= 0) feedDue++;
    const u = urgency(p);
    const thumb = latestPhotoId(p);
    const el = document.createElement("article");
    el.className = "plant" + (u < 0 ? " overdue" : u === 0 ? " due" : "");
    el.innerHTML = `
      ${thumb ? `<button class="thumb" data-open style="overflow:hidden" aria-label="Open ${esc(p.name)}"><img class="thumb" data-photo="${esc(thumb)}" alt=""></button>` : `<button class="thumb blank" data-open aria-label="Open ${esc(p.name)}">${leafSvg}</button>`}
      <div class="meta"><button class="name" data-open>${esc(p.name)}</button>
        ${subtitle(p) ? `<div class="sp">${esc(subtitle(p))}</div>` : ""}
        ${p.location ? `<div class="muted" style="font-size:.85rem">${esc(p.location)}</div>` : ""}</div>
      <div class="chips">${chipsFor(p)}</div>
      ${p.waterEvery || p.feedEvery ? `<div class="acts">
        ${p.waterEvery ? `<button class="btn water grow" data-water>Watered</button>` : ""}
        ${p.feedEvery ? `<button class="btn food grow" data-feed>Fed</button>` : ""}
      </div>` : ""}`;
    el.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openDetail(p.id)));
    el.querySelector("[data-water]")?.addEventListener("click", () => logCare(p.id, "water"));
    el.querySelector("[data-feed]")?.addEventListener("click", () => logCare(p.id, "feed"));
    list.append(el);
  }
  hydratePhotos(list);
  const sum = [];
  if (sorted.length) {
    sum.push(`<span class="pill plain">${sorted.length} plant${sorted.length > 1 ? "s" : ""}</span>`);
    sum.push(waterDue ? `<span class="pill water">💧 ${waterDue} to water</span>` : `<span class="pill ok">Watering up to date</span>`);
    if (feedDue) sum.push(`<span class="pill food">${feedDue} to feed</span>`);
  }
  $("#summary").innerHTML = sum.join("");
  updateBadge();
}

// Number on the home-screen icon (iOS 16.4+ installed app, after notification permission).
function updateBadge() {
  try {
    if (!("setAppBadge" in navigator)) return;
    const n = state.plants.filter((p) => urgency(p) <= 0).length;
    if (n) navigator.setAppBadge(n).catch(() => {}); else navigator.clearAppBadge?.().catch(() => {});
  } catch {}
}

async function logCare(id, type) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  const now = new Date().toISOString();
  const prev = { lastWatered: p.lastWatered, lastFed: p.lastFed, history: p.history };
  if (type === "water") p.lastWatered = now; else p.lastFed = now;
  p.history = [{ type, at: now }, ...(p.history || [])].slice(0, 100);
  await savePlant(p);
  toast(type === "water" ? `${p.name} watered` : `${p.name} fed`, "Undo", async () => {
    Object.assign(p, prev); await savePlant(p);
    if (isOpen("detail")) openDetail(id);
  });
  if (isOpen("detail")) openDetail(id);
}

/* ---------- sheets & toast ---------- */
let currentSheet = null;
function sheet(name, html) {
  const root = $("#sheetRoot");
  root.innerHTML = `<div class="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;
  currentSheet = name;
  const scrim = root.firstElementChild;
  scrim.addEventListener("click", (e) => { if (e.target === scrim) closeSheet(); });
  scrim.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeSheet));
  document.body.style.overflow = "hidden";
  return scrim.querySelector(".sheet");
}
function closeSheet() { $("#sheetRoot").innerHTML = ""; currentSheet = null; document.body.style.overflow = ""; }
const isOpen = (name) => currentSheet === name;
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

function toast(msg, actionLabel, action) {
  const r = $("#toastRoot");
  r.innerHTML = `<div class="toast" role="status"><span>${esc(msg)}</span>${actionLabel ? `<button>${esc(actionLabel)}</button>` : ""}</div>`;
  if (action) r.querySelector("button").onclick = () => { r.innerHTML = ""; action(); };
  clearTimeout(toast.t); toast.t = setTimeout(() => (r.innerHTML = ""), actionLabel ? 5000 : 2200);
}

const options = (map, selected, blank = "Not set") =>
  `<option value="">${blank}</option>` + Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === selected ? "selected" : ""}>${esc(v)}</option>`).join("");

/* ---------- add / edit ---------- */
function openEdit(id) {
  const existing = state.plants.find((x) => x.id === id);
  const p = existing ? structuredClone(existing) : { id: uid(), name: "", species: "", location: "", waterEvery: 7, feedEvery: 28, care: {}, history: [], growth: [], checks: [], createdAt: new Date().toISOString() };
  const c = p.care || {};
  let scanFile = null;
  const s = sheet("edit", `
    <div class="sheet-head"><h2>${existing ? "Edit plant" : "New plant"}</h2><button class="x" data-close aria-label="Close">×</button></div>
    <form id="pf" style="display:flex;flex-direction:column;gap:14px" novalidate autocomplete="off">
      ${existing ? "" : `
      <div class="card scan">
        <div class="btnrow"><button type="button" class="btn primary grow" id="scanBtn">${camSvg} Scan plant</button></div>
        <p class="hint" id="scanHint">Take a photo and LeafKin suggests which plant it could be, then fills in the care.</p>
        <input type="file" id="scanIn" accept="image/*" hidden>
        <img class="preview" id="scanPrev" alt="Photo of the new plant" hidden>
        <div id="scanOut"></div>
      </div>`}
      <div class="field"><label for="f-name">Name</label><input id="f-name" required placeholder="e.g. Living room monstera" value="${esc(p.name)}"></div>
      <div class="field ac-wrap"><label for="f-species">Species or type</label>
        <input id="f-species" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="acList" placeholder="Start typing, e.g. monstera or gatenplant" value="${esc(p.species)}">
        <ul class="ac" id="acList" role="listbox" hidden></ul>
      </div>
      <button type="button" class="btn" id="autoFill" hidden>Fill care automatically</button>
      <p class="hint" id="fillMsg" hidden></p>
      <div class="field"><label for="f-loc">Spot</label><input id="f-loc" placeholder="e.g. East window, bedroom" value="${esc(p.location)}"></div>

      <h3>Care</h3>
      <div class="row2">
        <div class="field"><label for="f-light">Light</label><select id="f-light">${options(LIGHT, c.light)}</select></div>
        <div class="field"><label for="f-sun">Direct sun</label><select id="f-sun">${options(SUN, c.sun)}</select></div>
      </div>
      <div class="row2">
        <div class="field"><label for="f-wstyle">Watering</label><select id="f-wstyle">${options(WATER, c.water)}</select></div>
        <div class="field"><label for="f-hum">Humidity</label><select id="f-hum">${options(HUMIDITY, c.humidity)}</select></div>
      </div>
      <div class="row2">
        <div class="field"><label for="f-water">Water every (days)</label><input id="f-water" type="number" min="0" inputmode="numeric" value="${p.waterEvery ?? ""}"></div>
        <div class="field"><label for="f-feed">Feed every (days)</label><input id="f-feed" type="number" min="0" inputmode="numeric" value="${p.feedEvery ?? ""}"></div>
      </div>
      <div class="field"><label for="f-pet">Pets</label><select id="f-pet">${options(PET, c.pet)}</select></div>
      <div class="field"><label for="f-notes">Own note (optional)</label><input id="f-notes" maxlength="140" placeholder="e.g. repotted March 2026" value="${esc(c.notes)}"></div>
      <p class="hint">Set water or feed to 0 to switch that reminder off.</p>
      <p class="err" id="f-err" hidden></p>
      <button class="btn primary" type="submit">Save plant</button>
    </form>`);

  const species = s.querySelector("#f-species"), acList = s.querySelector("#acList");
  const autoBtn = s.querySelector("#autoFill"), fillMsg = s.querySelector("#fillMsg");
  let tip = c.tip || "";

  function applyProfile(prof, { setSpecies = true } = {}) {
    if (setSpecies) species.value = prof.en;
    const set = (sel, v) => { if (v !== undefined && v !== null) s.querySelector(sel).value = v; };
    set("#f-light", prof.light); set("#f-sun", prof.sun); set("#f-wstyle", prof.water);
    set("#f-hum", prof.humidity); set("#f-pet", prof.pet);
    set("#f-water", prof.waterDays); set("#f-feed", prof.feedDays);
    if (!s.querySelector("#f-name").value.trim()) s.querySelector("#f-name").value = prof.en;
    tip = prof.tip; p.sci = prof.sci;
    fillMsg.hidden = false;
    fillMsg.textContent = `Care filled in for ${prof.en} (${prof.sci}). Adjust anything that's different in your home.`;
    autoBtn.hidden = true;
  }
  function refreshAutoBtn() {
    const m = matchAny(species.value);
    autoBtn.hidden = !m;
    if (m) autoBtn.textContent = `Fill care automatically for ${m.en}`;
  }

  // autocomplete
  let acItems = [], acIndex = -1;
  function renderAc() {
    acItems = searchPlants(species.value);
    acIndex = -1;
    acList.innerHTML = acItems.map((it, i) => `<li role="option" id="ac-${i}" data-i="${i}"><b>${esc(it.en)}</b> <span class="muted">${esc(it.nl !== it.en ? it.nl + " · " : "")}<i>${esc(it.sci)}</i></span></li>`).join("");
    acList.hidden = !acItems.length;
    species.setAttribute("aria-expanded", String(!!acItems.length));
  }
  function pick(i) {
    const it = acItems[i]; if (!it) return;
    acList.hidden = true; species.setAttribute("aria-expanded", "false");
    applyProfile(it);
  }
  species.addEventListener("input", () => { renderAc(); refreshAutoBtn(); fillMsg.hidden = true; });
  species.addEventListener("focus", renderAc);
  species.addEventListener("blur", () => setTimeout(() => { acList.hidden = true; species.setAttribute("aria-expanded", "false"); }, 150));
  species.addEventListener("keydown", (e) => {
    if (acList.hidden) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      acIndex = (acIndex + (e.key === "ArrowDown" ? 1 : -1) + acItems.length) % acItems.length;
      acList.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === acIndex)));
      species.setAttribute("aria-activedescendant", `ac-${acIndex}`);
    } else if (e.key === "Enter" && acIndex >= 0) { e.preventDefault(); pick(acIndex); }
  });
  acList.addEventListener("pointerdown", (e) => { const li = e.target.closest("li"); if (li) { e.preventDefault(); pick(+li.dataset.i); } });
  autoBtn.onclick = () => { const m = matchAny(species.value); if (m) applyProfile(m, { setSpecies: false }); };
  refreshAutoBtn();

  // scan to identify
  if (!existing) {
    const scanIn = s.querySelector("#scanIn"), out = s.querySelector("#scanOut"), prev = s.querySelector("#scanPrev");
    s.querySelector("#scanBtn").onclick = () => scanIn.click();
    scanIn.onchange = async () => {
      const f = scanIn.files?.[0]; if (!f) return;
      scanFile = f;
      if (prev.src) URL.revokeObjectURL(prev.src);
      prev.src = URL.createObjectURL(f); prev.hidden = false;
      s.querySelector("#scanHint").hidden = true;
      out.innerHTML = `<p class="hint thinking">Identifying…</p>`;
      try {
        const small = await resizeImage(f, 1280);
        const results = await plantnet.identify(small);
        if (!results.length) { out.innerHTML = `<p class="hint">No match found. Try a closer photo of a leaf, or type the species below.</p>`; return; }
        out.innerHTML = `<p class="hint">Which one is it? Tap to choose.</p><ul class="cands">${results.map((r, i) => {
          const prof = matchScientific(r.sci, r.genus, r.family);
          return `<li><button type="button" class="cand" data-i="${i}">
            <span class="cand-main"><b>${esc(r.common[0] || r.sci)}</b><i class="muted">${esc(r.sci)}</i></span>
            <span class="cand-side"><span class="mono">${Math.round(r.score * 100)}%</span>${prof ? `<span class="pill ok">Care known</span>` : ""}</span>
          </button></li>`;
        }).join("")}</ul>`;
        out.querySelectorAll(".cand").forEach((b) => (b.onclick = () => {
          const r = results[+b.dataset.i];
          out.querySelectorAll(".cand").forEach((x) => x.classList.toggle("on", x === b));
          const genus = r.genus || r.sci.split(" ")[0];
          // Keep a variety the user already typed if it belongs to this genus.
          const typed = matchAny(species.value);
          const typedCv = typed?.cultivar && typed.base.split(" ")[0].toLowerCase() === genus.toLowerCase() ? typed : null;
          if (typedCv) {
            applyProfile(typedCv);
          } else {
            const prof = matchScientific(r.sci, r.genus, r.family);
            if (prof) applyProfile(prof, { setSpecies: false });
            else { fillMsg.hidden = false; fillMsg.textContent = `No care profile for ${r.sci} yet. Fill in the care below.`; }
            species.value = r.common[0] ? `${r.common[0]} (${r.sci})` : r.sci;
            p.sci = r.sci;
            if (!s.querySelector("#f-name").value.trim()) s.querySelector("#f-name").value = r.common[0] || r.sci;
          }
          // Offer the known varieties of this plant.
          const cvs = cultivarsForGenus(genus);
          out.querySelector(".cv-pick")?.remove();
          if (cvs.length) {
            const box = document.createElement("div");
            box.className = "cv-pick";
            box.innerHTML = `<p class="hint">Is it a specific variety? Pick it so it's saved as its own type.</p>
              <div class="chipset">${cvs.map((c, i) => `<button type="button" class="chipbtn" aria-pressed="${typedCv && typedCv.sci === c.sci}" data-cv="${i}">${esc(c.cultivar)}</button>`).join("")}</div>`;
            out.append(box);
            box.querySelectorAll("[data-cv]").forEach((chip) => (chip.onclick = () => {
              const on = chip.getAttribute("aria-pressed") !== "true";
              box.querySelectorAll("[data-cv]").forEach((x) => x.setAttribute("aria-pressed", "false"));
              if (on) {
                chip.setAttribute("aria-pressed", "true");
                const c = cvs[+chip.dataset.cv];
                const nameEl = s.querySelector("#f-name");
                if (!nameEl.value.trim() || nameEl.value === (r.common[0] || r.sci)) nameEl.value = c.en;
                applyProfile(c);
              } else {
                b.click();
              }
            }));
          }
        }));
      } catch (e) {
        out.innerHTML = `<p class="err">${esc(plantnet.errorText(e.code))}</p>${e.code === "no_key" ? `<button type="button" class="btn" id="goKey">Open Settings</button>` : ""}`;
        out.querySelector("#goKey")?.addEventListener("click", openSettings);
      }
    };
  }

  s.querySelector("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const v = (k) => s.querySelector(k).value.trim();
    const err = s.querySelector("#f-err");
    if (!v("#f-name")) { err.textContent = "Give the plant a name."; err.hidden = false; s.querySelector("#f-name").focus(); return; }
    p.name = v("#f-name"); p.species = v("#f-species"); p.location = v("#f-loc");
    p.waterEvery = Math.max(0, parseInt(v("#f-water"), 10) || 0);
    p.feedEvery = Math.max(0, parseInt(v("#f-feed"), 10) || 0);
    const m = matchAny(p.species);
    if (m && !tip) tip = m.tip;
    // Keep the exact type: a variety, the Latin name from a scan "(…)", or a typed Latin name.
    const bracket = /\(([^)]+)\)/.exec(p.species)?.[1]?.trim();
    const typedExact = m && [m.en, m.nl, m.sci].some((x) => x.toLowerCase() === p.species.toLowerCase());
    const looksLatin = /^[A-Z][a-z]+ [a-z×-]+/.test(p.species);
    p.sci = m?.cultivar ? m.sci : bracket ? bracket : typedExact ? m.sci : looksLatin ? p.species : (m?.sci || "");
    p.care = { light: v("#f-light"), sun: v("#f-sun"), water: v("#f-wstyle"), humidity: v("#f-hum"), pet: v("#f-pet"), notes: v("#f-notes"), tip };
    if (scanFile) {
      try { const photoId = await storePhoto(scanFile); p.growth = [...(p.growth || []), { id: uid(), at: new Date().toISOString(), photoId, note: "Added to LeafKin" }]; }
      catch { /* photo is optional */ }
    }
    await savePlant(p);
    toast("Saved");
    openDetail(p.id);
  };
}

/* ---------- detail ---------- */
function careRows(p) {
  const c = p.care || {};
  const rows = [];
  if (c.light || c.sun) rows.push(["Light", [LIGHT[c.light], SUN_SHORT[c.sun] || ""].filter(Boolean).join(" · ")]);
  if (c.water || p.waterEvery) rows.push(["Water", [WATER[c.water], p.waterEvery ? `every ${p.waterEvery} d` : ""].filter(Boolean).join(" · ")]);
  if (p.feedEvery) rows.push(["Feed", `every ${p.feedEvery} d, spring–summer`]);
  if (c.humidity) rows.push(["Air", HUMIDITY[c.humidity]]);
  if (c.pet && c.pet !== "unknown") rows.push(["Pets", PET[c.pet]]);
  return rows;
}

function openDetail(id) {
  const p = state.plants.find((x) => x.id === id); if (!p) return closeSheet();
  const c = p.care || {};
  const rows = careRows(p);
  const hist = (p.history || []).slice(0, 8);
  const checks = (p.checks || []).slice(0, 3);
  const s = sheet("detail", `
    <div class="sheet-head"><div><h2>${esc(p.name)}</h2>${subtitle(p) ? `<div class="muted" style="font-style:italic">${esc(subtitle(p))}</div>` : ""}</div><button class="x" data-close aria-label="Close">×</button></div>
    <div class="summary">${chipsFor(p, false)}</div>
    ${p.waterEvery || p.feedEvery ? `<div class="btnrow">${p.waterEvery ? `<button class="btn water grow" id="dW">Watered now</button>` : ""}${p.feedEvery ? `<button class="btn food grow" id="dF">Fed now</button>` : ""}</div>` : ""}

    <div class="card">
      <div class="card-head"><h3>Health</h3>${checks[0] ? statusPill(checks[0].status) : ""}</div>
      ${checks[0] ? `<p class="muted" style="font-size:.9rem">Last check ${fmtDate(checks[0].at)}${checks[0].causes?.length ? `: ${esc(checks[0].causes.map((x) => x.title).join(", "))}` : ""}</p>` : `<p class="muted">Take a photo and tick what you see to get a few quick fixes.</p>`}
      <button class="btn" id="dHealth">${camSvg} Check health</button>
    </div>

    <div class="card care"><h3>Care</h3>
      ${rows.length ? `<dl>${rows.map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl>` : `<p class="muted">No care set yet. Edit the plant to fill it in.</p>`}
      ${c.tip ? `<p class="tip">${esc(c.tip)}</p>` : ""}
      ${c.notes ? `<p class="muted" style="font-size:.9rem">${esc(c.notes)}</p>` : ""}
      ${isWinter() && p.waterEvery ? `<p class="hint">Winter: water less often and pause feeding until March.</p>` : ""}
    </div>

    <div class="card" id="growthCard">${growthHtml(p)}</div>

    <details class="card"><summary><h3 style="display:inline">History</h3></summary>
      ${hist.length ? `<ul class="log" style="margin-top:8px">${hist.map((h) => `<li><span>${h.type === "water" ? "💧 Watered" : "Fed"}</span><span class="mono muted">${fmtDateTime(h.at)}</span></li>`).join("")}</ul>` : `<p class="muted" style="margin-top:8px">Nothing logged yet.</p>`}
    </details>

    <div class="btnrow"><button class="btn grow" id="dEdit">Edit</button><button class="btn danger grow" id="dDel">Delete</button></div>
    <div class="confirm" id="delConfirm" hidden><span>Delete ${esc(p.name)} with its photos and history?</span><button class="btn danger" id="dDelYes">Delete</button><button class="btn" id="dDelNo">Keep</button></div>`);
  s.querySelector("#dW")?.addEventListener("click", () => logCare(id, "water"));
  s.querySelector("#dF")?.addEventListener("click", () => logCare(id, "feed"));
  s.querySelector("#dHealth").onclick = () => openHealth(id);
  s.querySelector("#dEdit").onclick = () => openEdit(id);
  s.querySelector("#dDel").onclick = () => { s.querySelector("#delConfirm").hidden = false; s.querySelector("#dDelYes").focus(); };
  s.querySelector("#dDelNo").onclick = () => { s.querySelector("#delConfirm").hidden = true; };
  s.querySelector("#dDelYes").onclick = async () => {
    state.plants = state.plants.filter((x) => x.id !== id);
    try { await db.deletePlant(p); } catch { toast("Couldn't delete. Try again."); return; }
    closeSheet(); render(); toast("Deleted");
  };
  wireGrowth(s, p);
  hydratePhotos(s);
}

/* ---------- health check ---------- */
function openHealth(id) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  let file = null;
  const picked = new Set();
  const s = sheet("health", `
    <div class="sheet-head"><h2>Check ${esc(p.name)}</h2><button class="x" id="hBack" aria-label="Back">×</button></div>
    <input type="file" id="hIn" accept="image/*" hidden>
    <button class="btn" id="hCam">${camSvg} Take a photo</button>
    <img class="preview" id="hPrev" alt="Photo of ${esc(p.name)}" hidden>
    <label class="check" id="hKeepRow" hidden><input type="checkbox" id="hKeep" checked> Add photo to the growth timeline</label>
    <h3>What do you see?</h3>
    <div class="chipset" role="group" aria-label="Symptoms">${SYMPTOMS.map(([k, label]) => `<button type="button" class="chipbtn" aria-pressed="false" data-k="${k}">${esc(label)}</button>`).join("")}</div>
    <button class="btn primary" id="hGo">Check</button>
    <div id="hOut"></div>`);
  s.querySelector("#hBack").onclick = () => openDetail(id);
  const input = s.querySelector("#hIn"), prev = s.querySelector("#hPrev");
  s.querySelector("#hCam").onclick = () => input.click();
  input.onchange = () => {
    file = input.files?.[0]; if (!file) return;
    if (prev.src) URL.revokeObjectURL(prev.src);
    prev.src = URL.createObjectURL(file); prev.hidden = false;
    s.querySelector("#hKeepRow").hidden = false;
    s.querySelector("#hCam").lastChild.textContent = " Change photo";
  };
  s.querySelectorAll(".chipbtn").forEach((b) => (b.onclick = () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(on));
    on ? picked.add(b.dataset.k) : picked.delete(b.dataset.k);
  }));
  s.querySelector("#hGo").onclick = async (e) => {
    e.target.disabled = true;
    const result = assess(p, [...picked]);
    let photoId = null;
    if (file) {
      try { photoId = await storePhoto(file); } catch { /* optional */ }
      if (photoId && s.querySelector("#hKeep").checked) {
        p.growth = [...(p.growth || []), { id: uid(), at: new Date().toISOString(), photoId, note: STATUS_LABEL[result.status] }];
      }
    }
    p.checks = [{ at: new Date().toISOString(), status: result.status, symptoms: [...picked], causes: result.causes.map((x) => ({ title: x.title })), photoId }, ...(p.checks || [])].slice(0, 20);
    await savePlant(p);
    const out = s.querySelector("#hOut");
    out.innerHTML = `<div class="card result">
      <div class="card-head"><h3>Result</h3>${statusPill(result.status)}</div>
      ${result.causes.length ? result.causes.map((c) => `<div class="cause"><b>${esc(c.title)}</b><p class="muted">${esc(c.why)}</p><ul>${c.actions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>`).join("")
        : `<p>No problems ticked. Keep to the schedule${isWinter() ? " and water a little less in winter" : ""}.</p>`}
    </div>
    <button class="btn" id="hDone">Done</button>`;
    out.querySelector("#hDone").onclick = () => openDetail(id);
    out.scrollIntoView({ behavior: "smooth", block: "start" });
    e.target.disabled = false;
  };
}

/* ---------- growth timeline ---------- */
function heightChart(snaps) {
  const pts = snaps.filter((s) => typeof s.heightCm === "number");
  if (pts.length < 2) return "";
  const W = 320, H = 130, L = 36, R = 12, T = 12, B = 22;
  const t0 = new Date(pts[0].at).getTime(), t1 = Math.max(new Date(pts[pts.length - 1].at).getTime(), t0 + DAY);
  const hs = pts.map((p) => p.heightCm);
  const lo = Math.max(0, Math.floor(Math.min(...hs) * 0.9)), hi = Math.max(lo + 1, Math.ceil(Math.max(...hs) * 1.05));
  const x = (t) => L + (W - L - R) * ((t - t0) / (t1 - t0));
  const y = (h) => T + (H - T - B) * (1 - (h - lo) / (hi - lo));
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(new Date(p.at).getTime()).toFixed(1)},${y(p.heightCm).toFixed(1)}`).join(" ");
  const lastX = x(new Date(pts[pts.length - 1].at).getTime());
  const area = `${line} L${lastX.toFixed(1)},${H - B} L${L},${H - B} Z`;
  const last = pts[pts.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Height over time, from ${pts[0].heightCm} to ${last.heightCm} centimetres">
    <line x1="${L}" x2="${W - R}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)" stroke-dasharray="2 3"/>
    <line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="var(--line)"/>
    <text x="${L - 6}" y="${y(hi) + 3}" text-anchor="end" fill="var(--muted)">${hi}</text>
    <text x="${L - 6}" y="${y(lo) + 3}" text-anchor="end" fill="var(--muted)">${lo}</text>
    <text x="${L}" y="${H - 6}" fill="var(--muted)">${fmtDate(pts[0].at)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" fill="var(--muted)">${fmtDate(last.at)}</text>
    <path d="${area}" fill="var(--leaf)" fill-opacity=".14"/>
    <path d="${line}" fill="none" stroke="var(--leaf)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p) => `<circle cx="${x(new Date(p.at).getTime()).toFixed(1)}" cy="${y(p.heightCm).toFixed(1)}" r="${p === last ? 4 : 2.5}" fill="var(--leaf)"/>`).join("")}
  </svg>`;
}

function growthHtml(p) {
  const g = sortedGrowth(p);
  const first = g[0];
  const hFirst = g.find((s) => typeof s.heightCm === "number");
  const hLast = [...g].reverse().find((s) => typeof s.heightCm === "number");
  const delta = hFirst && hLast && hFirst !== hLast ? hLast.heightCm - hFirst.heightCm : null;
  const photos = g.filter((s) => s.photoId);
  return `
    <div class="card-head"><h3>Growth timeline</h3>
      ${hLast ? `<span class="mono">${hLast.heightCm} cm${delta !== null ? ` <span class="muted">(${delta >= 0 ? "+" : ""}${Math.round(delta * 10) / 10})</span>` : ""}</span>` : ""}</div>
    ${heightChart(g)}
    ${g.length ? `<div class="tl">${[...g].reverse().map((s) => `
      <button class="tl-item" data-snap="${esc(s.id)}">
        ${s.photoId ? `<img data-photo="${esc(s.photoId)}" alt="${esc(p.name)} on ${fmtDate(s.at)}" loading="lazy">` : `<span class="tl-noimg">No photo</span>`}
        <span class="tl-cap"><b>${ageLabel(first.at, s.at)}</b><span class="mono muted">${fmtDate(s.at)}${typeof s.heightCm === "number" ? ` · ${s.heightCm} cm` : ""}</span></span>
      </button>`).join("")}</div>`
      : `<p class="muted">Add a dated photo and height now and again later to watch ${esc(p.name)} grow.</p>`}
    <div class="btnrow">
      <button class="btn grow" id="gAdd">Add snapshot</button>
      ${photos.length >= 2 ? `<button class="btn grow" id="gCompare">Then & now</button>` : ""}
    </div>`;
}

function wireGrowth(s, p) {
  s.querySelector("#gAdd").onclick = () => openSnapshot(p.id);
  s.querySelector("#gCompare")?.addEventListener("click", () => openCompare(p.id));
  s.querySelectorAll("[data-snap]").forEach((b) => (b.onclick = () => openSnapView(p.id, b.dataset.snap)));
}

function openSnapshot(id) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  let file = null;
  const today = new Date().toISOString().slice(0, 10);
  const lastH = [...sortedGrowth(p)].reverse().find((s) => typeof s.heightCm === "number")?.heightCm;
  const s = sheet("snapshot", `
    <div class="sheet-head"><h2>Snapshot of ${esc(p.name)}</h2><button class="x" id="sBack" aria-label="Back">×</button></div>
    <input type="file" id="sIn" accept="image/*" hidden>
    <button class="btn" id="sCam">${camSvg} Take or choose photo</button>
    <img class="preview" id="sPrev" alt="New photo of ${esc(p.name)}" hidden>
    <p class="hint">Shoot from the same spot and angle each time so the photos line up.</p>
    <div class="row2">
      <div class="field"><label for="sH">Height (cm)</label><input id="sH" type="number" step="0.5" min="0" inputmode="decimal" placeholder="${lastH ? `last: ${lastH}` : "e.g. 42"}"></div>
      <div class="field"><label for="sD">Date</label><input id="sD" type="date" value="${today}" max="${today}"></div>
    </div>
    <div class="field"><label for="sN">Note (optional)</label><input id="sN" autocomplete="off" maxlength="80" placeholder="e.g. new leaf, repotted"></div>
    <p class="err" id="sErr" hidden></p>
    <button class="btn primary" id="sSave">Add to timeline</button>`);
  s.querySelector("#sBack").onclick = () => openDetail(id);
  const input = s.querySelector("#sIn"), prev = s.querySelector("#sPrev");
  s.querySelector("#sCam").onclick = () => input.click();
  input.onchange = () => {
    file = input.files?.[0]; if (!file) return;
    if (prev.src) URL.revokeObjectURL(prev.src);
    prev.src = URL.createObjectURL(file); prev.hidden = false;
  };
  s.querySelector("#sSave").onclick = async () => {
    const err = s.querySelector("#sErr"), btn = s.querySelector("#sSave");
    const hRaw = s.querySelector("#sH").value;
    const heightCm = hRaw === "" ? null : Math.round(parseFloat(hRaw) * 10) / 10;
    if (!file && heightCm === null) { err.textContent = "Add a photo or a height."; err.hidden = false; return; }
    if (heightCm !== null && !(heightCm >= 0)) { err.textContent = "Height must be a number in centimetres."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Saving…";
    const d = s.querySelector("#sD").value || today;
    const at = d === today ? new Date().toISOString() : new Date(d + "T12:00:00").toISOString();
    let photoId = null;
    if (file) {
      try { photoId = await storePhoto(file); }
      catch { err.textContent = "Couldn't save the photo. Try another one, or free up storage."; err.hidden = false; btn.disabled = false; btn.textContent = "Add to timeline"; return; }
    }
    const snap = { id: uid(), at, photoId, note: s.querySelector("#sN").value.trim() };
    if (heightCm !== null) snap.heightCm = heightCm;
    p.growth = [...(p.growth || []), snap];
    await savePlant(p);
    toast("Snapshot added"); openDetail(id);
  };
}

function openSnapView(id, snapId) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  const g = sortedGrowth(p);
  const snap = g.find((x) => x.id === snapId); if (!snap) return;
  const s = sheet("snapview", `
    <div class="sheet-head"><div><h2>${ageLabel(g[0].at, snap.at)}</h2><div class="muted mono">${fmtDate(snap.at)}${typeof snap.heightCm === "number" ? ` · ${snap.heightCm} cm` : ""}</div></div><button class="x" id="svBack" aria-label="Back">×</button></div>
    ${snap.photoId ? `<img class="preview" style="max-height:none" data-photo="${esc(snap.photoId)}" alt="${esc(p.name)} on ${fmtDate(snap.at)}">` : ""}
    ${snap.note ? `<p>${esc(snap.note)}</p>` : ""}
    <button class="btn danger" id="svDel">Delete snapshot</button>
    <div class="confirm" id="svConfirm" hidden><span>Delete this snapshot?</span><button class="btn danger" id="svYes">Delete</button><button class="btn" id="svNo">Keep</button></div>`);
  s.querySelector("#svBack").onclick = () => openDetail(id);
  s.querySelector("#svDel").onclick = () => { s.querySelector("#svConfirm").hidden = false; };
  s.querySelector("#svNo").onclick = () => { s.querySelector("#svConfirm").hidden = true; };
  s.querySelector("#svYes").onclick = async () => {
    p.growth = (p.growth || []).filter((x) => x.id !== snapId);
    const stillUsed = (p.checks || []).some((c) => c.photoId === snap.photoId);
    await savePlant(p);
    if (snap.photoId && !stillUsed) { db.deletePhoto(snap.photoId).catch(() => {}); urlCache.delete(snap.photoId); }
    toast("Snapshot deleted"); openDetail(id);
  };
  hydratePhotos(s);
}

function openCompare(id) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  const g = sortedGrowth(p);
  const photos = g.filter((x) => x.photoId);
  const a = photos[0], b = photos[photos.length - 1];
  const fig = (x) => `<figure><img data-photo="${esc(x.photoId)}" alt="${esc(p.name)} on ${fmtDate(x.at)}"><figcaption class="tl-cap"><b>${ageLabel(g[0].at, x.at)}</b><span class="mono muted">${fmtDate(x.at)}${typeof x.heightCm === "number" ? ` · ${x.heightCm} cm` : ""}</span></figcaption></figure>`;
  const s = sheet("compare", `
    <div class="sheet-head"><h2>${esc(p.name)}: then & now</h2><button class="x" id="cBack" aria-label="Back">×</button></div>
    <div class="compare">${fig(a)}${fig(b)}</div>
    <p class="muted">${daysBetween(a.at, b.at)} days apart.</p>`);
  s.querySelector("#cBack").onclick = () => openDetail(id);
  hydratePhotos(s);
}

/* ---------- settings ---------- */
async function saveFile(filename, blob) {
  const file = new File([blob], filename, { type: blob.type });
  // iOS home-screen apps handle files best through the share sheet ("Save to Files", Calendar, AirDrop).
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return true; }
    catch (e) { if (e?.name === "AbortError") return false; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return true;
}

async function openSettings() {
  const est = await db.usage();
  const mb = est?.usage ? (est.usage / 1048576).toFixed(1) : null;
  const canBadge = "setAppBadge" in navigator && "Notification" in window;
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const key = plantnet.deviceKey();
  const siteKey = plantnet.hasSiteKey();
  const s = sheet("settings", `
    <div class="sheet-head"><h2>Settings</h2><button class="x" data-close aria-label="Close">×</button></div>
    <div class="card">
      <h3>Plant scanning</h3>
      ${siteKey && !key ? `<p>Scanning is ready on every device. It uses Pl@ntNet, free for up to 500 scans a day.</p>
      <details><summary class="hint" style="cursor:pointer">Use a different key on this device</summary>` : `<p>Scanning uses Pl@ntNet, free for up to 500 scans a day. Paste your API key from my.plantnet.org.</p>`}
      <div class="field"><label for="pnKey">Pl@ntNet API key</label><input id="pnKey" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="2b10…" value="${esc(key)}"></div>
      <div class="btnrow"><button class="btn grow" id="pnSave">Save key</button>${key ? `<button class="btn danger" id="pnClear">Remove</button>` : ""}</div>
      <p class="hint" id="pnMsg">${siteKey ? "A key saved here is only used on this device." : "The key is stored on this device only."}</p>
      ${siteKey && !key ? `</details>` : ""}
    </div>
    <div class="card">
      <h3>Reminders</h3>
      <p>Save a calendar file with a repeating 09:00 reminder for each plant's watering and feeding. Open it on your iPhone to add it to Calendar.</p>
      <button class="btn" id="icsBtn" ${state.plants.some((p) => p.waterEvery || p.feedEvery) ? "" : "disabled"}>Save calendar file</button>
      ${canBadge ? `<p style="margin-top:6px">Show how many plants need care on the app icon.</p>
        <button class="btn" id="badgeBtn" ${perm === "granted" ? "disabled" : ""}>${perm === "granted" ? "Icon badge is on" : perm === "denied" ? "Blocked in iOS Settings" : "Turn on icon badge"}</button>` : ""}
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p>Plants and photos are stored on this device only. Save a backup now and then, or to move to another device.</p>
      <div class="btnrow"><button class="btn grow" id="expBtn">Save backup</button><button class="btn grow" id="impBtn">Restore backup</button></div>
      <input type="file" id="impIn" accept="application/json,.json" hidden>
      <p class="hint" id="bMsg">${mb ? `Using about ${mb} MB.` : ""}</p>
    </div>
    <p class="hint">LeafKin ${APP_VERSION} · ${SPECIES.length} plants and ${CULTIVARS.length} varieties in the care library</p>`);
  s.querySelector("#pnSave").onclick = () => {
    const v = s.querySelector("#pnKey").value.trim();
    plantnet.setKey(v);
    s.querySelector("#pnMsg").textContent = v ? "Saved. Try Scan plant when adding a plant." : "Key removed.";
  };
  s.querySelector("#pnClear")?.addEventListener("click", () => { plantnet.setKey(""); s.querySelector("#pnKey").value = ""; s.querySelector("#pnMsg").textContent = "Key removed."; });
  s.querySelector("#icsBtn").onclick = async () => {
    await saveFile("leafkin-reminders.ics", new Blob([buildIcs(state.plants)], { type: "text/calendar" }));
  };
  s.querySelector("#badgeBtn")?.addEventListener("click", async (e) => {
    const r = await Notification.requestPermission().catch(() => "denied");
    e.target.textContent = r === "granted" ? "Icon badge is on" : "Not allowed";
    e.target.disabled = true;
    updateBadge();
  });
  s.querySelector("#expBtn").onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = "Preparing…";
    try { await saveFile(`leafkin-backup-${new Date().toISOString().slice(0, 10)}.json`, await db.exportBackup()); }
    catch { s.querySelector("#bMsg").textContent = "Couldn't create the backup."; }
    e.target.disabled = false; e.target.textContent = "Save backup";
  };
  const impIn = s.querySelector("#impIn");
  s.querySelector("#impBtn").onclick = () => impIn.click();
  impIn.onchange = async () => {
    const f = impIn.files?.[0]; if (!f) return;
    const msg = s.querySelector("#bMsg");
    try {
      const n = await db.importBackup(f);
      await load(); render();
      msg.textContent = `Restored ${n} plant${n === 1 ? "" : "s"}.`;
    } catch (e) {
      msg.textContent = e?.message === "not_leafkin" ? "That file isn't a LeafKin backup." : "Couldn't read that backup file.";
    }
  };
}

/* ---------- splash, install hint & updates ---------- */
function runSplash() {
  const el = $("#splash"); if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const done = () => { el.classList.add("out"); setTimeout(() => el.remove(), 450); };
  el.addEventListener("click", done, { once: true });
  setTimeout(done, reduce ? 500 : 2300);
}

function setupInstallHint() {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let dismissed = false;
  try { dismissed = localStorage.getItem("leafkin.installHint") === "off"; } catch {}
  $("#installHint").hidden = standalone || !ios || dismissed;
  $("#installClose").onclick = () => { $("#installHint").hidden = true; try { localStorage.setItem("leafkin.installHint", "off"); } catch {} };
}

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    // Home-screen apps can stay open for days: look for a new version whenever the app comes back.
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  // A new version took over: reload once to run it, unless a form is open.
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) { hadController = true; return; } // first install, nothing to reload
    if (reloaded) return;
    reloaded = true;
    if (currentSheet) toast("LeafKin was updated", "Reload", () => location.reload());
    else location.reload();
  });
}

/* ---------- boot ---------- */
$("#addBtn").onclick = () => openEdit(null);
$("#emptyAdd").onclick = () => openEdit(null);
$("#settingsBtn").onclick = openSettings;
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
setInterval(render, 60 * 60 * 1000);

runSplash();
setupInstallHint();
setupServiceWorker();
load().then(() => { render(); db.persist(); }).catch(() => {
  $("#emptyState").hidden = false;
  toast("Couldn't open storage. Private browsing can block it.");
});
