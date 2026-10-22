import * as db from "./sync.js";
import { DAY, daysBetween, dueIn, dueLabel, ageLabel, fmtDate, fmtDateTime, esc, uid, resizeImage, aOrAn } from "./util.js";
import { PLANTS, SPECIES, CULTIVARS, LIGHT, SUN, SUN_SHORT, WATER, HUMIDITY, PET, searchPlants, matchScientific, matchAny, cultivarsForGenus } from "./care-library.js";
import * as plantnet from "./plantnet.js";
import { SYMPTOMS, assess, STATUS_LABEL } from "./health.js";
import { ROOMS, adjustForConditions, fitText } from "./conditions.js";
import { waterDue, feedDue, urgency, waterInterval, feedInterval, winterActive, winterModeOn, setWinterMode, snoozeDate, repotDue, photoDue, lastPhotoAt, isWinter as inWinter, PHOTO_PERIODS, photoPeriod, setPhotoPeriod, blockingPhoto, nextPhotoDate } from "./schedule.js";

const APP_VERSION = "2.0.0";
const $ = (s, root = document) => root.querySelector(s);
const state = { plants: [] };
const isWinter = () => inWinter();

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
let detailId = null; // plant whose details are open, refreshed when housemates change something
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
const lastCheck = (p) => (p.checks || [])[0];
const statusPill = (s) => `<span class="pill ${s === "healthy" ? "ok" : s === "attention" ? "alert" : "food"}">${esc(STATUS_LABEL[s] || s)}</span>`;

function chipsFor(p, withHealth = true) {
  const out = [];
  const w = waterDue(p);
  if (w !== null) out.push(`<span class="pill ${w < 0 ? "alert" : w <= 1 ? "water" : "plain"}">💧 Water ${esc(dueLabel(w))}</span>`);
  const f = feedDue(p);
  if (f !== null) out.push(`<span class="pill ${f < 0 ? "alert" : f <= 1 ? "food" : "plain"}">Feed ${esc(dueLabel(f))}</span>`);
  else if (p.feedEvery && winterActive()) out.push(`<span class="pill plain">Feeding paused for winter</span>`);
  if (repotDue(p)) out.push(`<span class="pill food">Repot this spring</span>`);
  const lc = lastCheck(p);
  if (withHealth && lc && lc.status !== "healthy") out.push(statusPill(lc.status));
  return out.join("");
}
const leafSvg = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path fill="currentColor" d="M20 4c-8 0-14 4-14 11 0 1.2.2 2.3.6 3.3L4 21l1.4 1.4 2.5-2.5c1 .4 2 .6 3.1.6 7 0 9-7 9-16.5Zm-9 14.5c-.6 0-1.2-.1-1.7-.3l6.4-6.4-1.4-1.4-6.4 6.4c-.2-.5-.3-1.1-.3-1.8 0-5 4-8.3 10.4-8.9C17.4 13 15.6 18.5 11 18.5Z"/></svg>`;
const camSvg = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Zm0 2a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>`;

// List view: compact rows grouped by when care is due, with search and room filters once the list grows.
const view = { q: "", room: "", open: { later: false } };
try { Object.assign(view.open, JSON.parse(localStorage.getItem("leafkin.sections") || "{}")); } catch {}
const saveView = () => { try { localStorage.setItem("leafkin.sections", JSON.stringify(view.open)); } catch {} };

function nextLabel(p) {
  const w = waterDue(p), f = feedDue(p);
  const parts = [];
  if (w !== null && (w <= 0 || f === null || w <= f)) parts.push(`Water ${dueLabel(w)}`);
  if (f !== null && (f <= 0 || w === null || f < w)) parts.push(`Feed ${dueLabel(f)}`);
  if (repotDue(p)) parts.push("Repot");
  return parts.join(" · ") || "No reminders";
}

const camMini = `<svg class="photo-due" viewBox="0 0 24 24" width="14" height="14" aria-label="Time for a new photo"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"/></svg>`;

function rowHtml(p) {
  const w = waterDue(p), f = feedDue(p);
  const thumb = latestPhotoId(p);
  const u = urgency(p);
  const lc = lastCheck(p);
  const where = ROOMS[p.care?.room] || "";
  return `<article class="row${u < 0 ? " overdue" : u === 0 ? " due" : ""}" data-id="${esc(p.id)}">
    ${p.waterEvery ? `<div class="row-bg" aria-hidden="true"><span class="bg-water">💧 Watered</span><span class="bg-damp">Still damp · +2 d</span></div>` : ""}
    <div class="row-fg">
      <button class="row-open" data-open aria-label="Open ${esc(p.name)}">
        ${thumb ? `<img class="rthumb" data-photo="${esc(thumb)}" alt="">` : `<span class="rthumb blank">${leafSvg}</span>`}
        <span class="rmeta">
          <span class="rname">${esc(p.name)}${lc && lc.status === "attention" ? ` <span class="dot" title="Needs attention"></span>` : ""}${photoDue(p) ? ` ${camMini}` : ""}</span>
          <span class="rsub"><span class="${u < 0 ? "late" : ""}">${esc(nextLabel(p))}</span>${where ? ` · ${esc(where)}` : ""}</span>
        </span>
      </button>
      <span class="racts">
        ${w !== null && w <= 0 ? `<button class="qbtn water" data-water aria-label="Watered ${esc(p.name)}">💧</button>` : ""}
        ${f !== null && f <= 0 ? `<button class="qbtn food" data-feed aria-label="Fed ${esc(p.name)}">Feed</button>` : ""}
      </span>
    </div>
  </article>`;
}

// Swipe a row right when watered, left when the soil is still damp.
function attachSwipe(row, id) {
  const fg = row.querySelector(".row-fg");
  if (!row.querySelector(".row-bg")) return;
  let x0 = null, y0 = 0, dx = 0, axis = null, pid = null, swiped = false;
  fg.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; axis = null; pid = e.pointerId; swiped = false;
    fg.style.transition = "none";
  });
  fg.addEventListener("pointermove", (e) => {
    if (x0 === null || e.pointerId !== pid) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!axis) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (axis === "x") { try { fg.setPointerCapture(pid); } catch {} }
    }
    if (axis !== "x") return;
    dx = mx; swiped = true;
    row.classList.toggle("swipe-right", dx > 0);
    row.classList.toggle("swipe-left", dx < 0);
    fg.style.transform = `translateX(${dx}px)`;
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null;
    fg.style.transition = "";
    const threshold = Math.min(110, row.offsetWidth * 0.3);
    if (axis === "x" && Math.abs(dx) > threshold) {
      fg.style.transform = `translateX(${dx > 0 ? "100%" : "-100%"})`;
      const right = dx > 0;
      setTimeout(() => (right ? logCare(id, "water") : snoozeWater(id)), 180);
    } else {
      fg.style.transform = "";
      setTimeout(() => row.classList.remove("swipe-right", "swipe-left"), 200);
    }
  };
  fg.addEventListener("pointerup", end);
  fg.addEventListener("pointercancel", end);
  fg.addEventListener("click", (e) => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);
}

function render() {
  $("#today").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const list = $("#list");
  const all = [...state.plants].sort((a, b) => urgency(a) - urgency(b) || a.name.localeCompare(b.name));
  $("#emptyState").hidden = all.length > 0;
  $("#addBtn").hidden = all.length === 0;

  // tools: search + room chips when the collection gets big
  const tools = $("#tools");
  const rooms = [...new Set(all.map((p) => p.care?.room).filter(Boolean))];
  tools.hidden = all.length < 6;
  if (!tools.hidden) {
    $("#roomChips").innerHTML = rooms.length > 1 ? [["", "All"], ...rooms.map((r) => [r, ROOMS[r]])]
      .map(([k, label]) => `<button type="button" class="chipbtn sm" aria-pressed="${view.room === k}" data-room="${k}">${esc(label)}</button>`).join("") : "";
    $("#roomChips").querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => { view.room = b.dataset.room; render(); }));
  }
  const q = view.q.trim().toLowerCase();
  const shown = all.filter((p) => (!view.room || p.care?.room === view.room)
    && (!q || [p.name, p.species, p.sci, p.location].some((x) => String(x || "").toLowerCase().includes(q))));

  const groups = [
    ["now", "Needs care today", shown.filter((p) => urgency(p) <= 0)],
    ["soon", "Next 3 days", shown.filter((p) => urgency(p) >= 1 && urgency(p) <= 3)],
    ["later", "Later", shown.filter((p) => urgency(p) > 3)],
  ].filter((g) => g[2].length);
  const collapsible = all.length > 8;
  list.querySelectorAll(".group, .noresults").forEach((n) => n.remove());
  for (const [key, title, items] of groups) {
    const sec = document.createElement("section");
    sec.className = "group";
    const open = !collapsible || key !== "later" || view.open.later || q || view.room;
    sec.innerHTML = `<button class="ghead" ${collapsible && key === "later" ? `data-toggle aria-expanded="${!!open}"` : "disabled"}>
        <span>${title}</span><span class="gcount">${items.length}${collapsible && key === "later" ? `<span class="chev">${open ? "−" : "+"}</span>` : ""}</span></button>
      <div class="rows" ${open ? "" : "hidden"}>${items.map(rowHtml).join("")}</div>`;
    sec.querySelector("[data-toggle]")?.addEventListener("click", () => { view.open.later = !view.open.later; saveView(); render(); });
    sec.querySelectorAll(".row").forEach((el) => {
      const id = el.dataset.id;
      el.querySelector("[data-open]").onclick = () => openDetail(id);
      el.querySelector("[data-water]")?.addEventListener("click", () => logCare(id, "water"));
      el.querySelector("[data-feed]")?.addEventListener("click", () => logCare(id, "feed"));
      attachSwipe(el, id);
    });
    list.append(sec);
  }
  if (all.length && !shown.length) {
    const n = document.createElement("p"); n.className = "noresults muted"; n.textContent = "No plants match.";
    list.append(n);
  }
  hydratePhotos(list);

  let nWater = 0, nFeed = 0;
  for (const p of all) {
    const w = waterDue(p), f = feedDue(p);
    if (w !== null && w <= 0) nWater++;
    if (f !== null && f <= 0) nFeed++;
  }
  $("#swipeTip").hidden = !all.some((p) => p.waterEvery) || tipDismissed("swipe");
  const sum = [];
  if (all.length) {
    sum.push(`<span class="pill plain">${all.length} plant${all.length > 1 ? "s" : ""}</span>`);
    sum.push(nWater ? `<span class="pill water">💧 ${nWater} to water</span>` : `<span class="pill ok">Watering up to date</span>`);
    if (nFeed) sum.push(`<span class="pill food">${nFeed} to feed</span>`);
    if (winterActive()) sum.push(`<span class="pill plain">❄ Winter care</span>`);
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

const CARE_KEYS = ["lastWatered", "lastFed", "lastRepotted", "history", "waterEvery", "snoozeUntil", "snoozedThisCycle", "snoozeStreak"];
const snapshotCare = (p) => Object.fromEntries(CARE_KEYS.map((k) => [k, p[k]]));
const undoTo = (p, prev) => async () => { Object.assign(p, prev); await savePlant(p); if (isOpen("detail")) openDetail(p.id); };

async function logCare(id, type) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  const now = new Date().toISOString();
  const prev = snapshotCare(p);
  let msg = type === "water" ? `${p.name} watered` : type === "repot" ? `${p.name} repotted` : `${p.name} fed`;
  if (type === "water") {
    // Learning: snoozed in two watering rounds in a row → the soil dries slower here, so add a day.
    // Not in winter, when slow drying is expected.
    if (p.snoozedThisCycle && !inWinter()) p.snoozeStreak = (p.snoozeStreak || 0) + 1;
    else if (!p.snoozedThisCycle) p.snoozeStreak = 0;
    if (p.snoozeStreak >= 2 && p.waterEvery && p.waterEvery < 60) {
      p.waterEvery += 1; p.snoozeStreak = 0;
      msg = `${p.name} watered. The soil kept staying damp, so it's now every ${p.waterEvery} days`;
    }
    p.lastWatered = now; p.snoozeUntil = null; p.snoozedThisCycle = false;
  } else if (type === "feed") p.lastFed = now;
  else if (type === "repot") p.lastRepotted = now;
  p.history = [{ id: uid(), type, at: now }, ...(p.history || [])];
  await savePlant(p);
  toast(msg, "Undo", undoTo(p, prev));
  if (isOpen("detail")) openDetail(id);
}

async function snoozeWater(id, days = 2) {
  const p = state.plants.find((x) => x.id === id); if (!p || !p.waterEvery) return;
  const prev = snapshotCare(p);
  p.snoozeUntil = snoozeDate(p, days);
  p.snoozedThisCycle = true;
  p.history = [{ id: uid(), type: "snooze", at: new Date().toISOString() }, ...(p.history || [])];
  await savePlant(p);
  toast(`${p.name}: checking again in ${Math.max(1, waterDue(p))} days`, "Undo", undoTo(p, prev));
  if (isOpen("detail")) openDetail(id);
}

const tipDismissed = (k) => { try { return localStorage.getItem("leafkin.tip." + k) === "off"; } catch { return false; } };
const dismissTip = (k) => { try { localStorage.setItem("leafkin.tip." + k, "off"); } catch {} };

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
      <h3>Where it stands</h3>
      <div class="field"><label for="f-room">Room</label><select id="f-room">${options(ROOMS, c.room)}</select></div>
      <div class="row2">
        <div class="field"><label for="f-light">Light at its spot</label><select id="f-light">${options(LIGHT, c.light)}</select></div>
        <div class="field"><label for="f-sun">Direct sun per day</label><select id="f-sun">${options(SUN, c.sun)}</select></div>
      </div>
      <p class="hint" id="fitMsg" hidden></p>

      <h3>Care</h3>
      <div class="row2">
        <div class="field"><label for="f-wstyle">Watering</label><select id="f-wstyle">${options(WATER, c.water)}</select></div>
        <div class="field"><label for="f-hum">Humidity</label><select id="f-hum">${options(HUMIDITY, c.humidity)}</select></div>
      </div>
      <div class="row2">
        <div class="field"><label for="f-water">Water every (days)</label><input id="f-water" type="number" min="0" inputmode="numeric" value="${p.waterEvery ?? ""}"></div>
        <div class="field"><label for="f-feed">Feed every (days)</label><input id="f-feed" type="number" min="0" inputmode="numeric" value="${p.feedEvery ?? ""}"></div>
      </div>
      <p class="hint" id="schedMsg" hidden></p>
      <div class="field"><label for="f-pet">Pets</label><select id="f-pet">${options(PET, c.pet)}</select></div>
      <div class="field"><label for="f-repot">Last repotted (optional)</label><input id="f-repot" type="month" max="${new Date().toISOString().slice(0, 7)}" value="${p.lastRepotted ? p.lastRepotted.slice(0, 7) : ""}"></div>
      <div class="field"><label for="f-notes">Own note (optional)</label><input id="f-notes" maxlength="140" placeholder="e.g. repotted March 2026" value="${esc(c.notes)}"></div>
      <p class="hint">Set water or feed to 0 to switch that reminder off.</p>
      <p class="err" id="f-err" hidden></p>
      <button class="btn primary" type="submit">Save plant</button>
    </form>`);

  const species = s.querySelector("#f-species"), acList = s.querySelector("#acList");
  const autoBtn = s.querySelector("#autoFill"), fillMsg = s.querySelector("#fillMsg");
  let tip = c.tip || "";

  // ---- linked fields: light + direct sun + room → watering and feeding ----
  // A field keeps updating as long as it still holds the value LeafKin put there.
  // Type your own value and it stays yours.
  const $f = (id) => s.querySelector(id);
  let prof = matchAny(p.species) || null;
  const auto = { light: $f("#f-light").value, sun: $f("#f-sun").value, water: $f("#f-water").value, feed: $f("#f-feed").value };
  const setAuto = (key, sel, v) => {
    const el = $f(sel);
    if (v === undefined || v === null) return;
    if (el.value === "" || el.value === String(auto[key])) { el.value = v; auto[key] = String(v); }
  };
  function recalc() {
    const fitMsg = $f("#fitMsg"), schedMsg = $f("#schedMsg");
    if (!prof) { fitMsg.hidden = schedMsg.hidden = true; return; }
    const room = $f("#f-room").value;
    const r = adjustForConditions(prof, { light: $f("#f-light").value, sun: $f("#f-sun").value, room });
    setAuto("water", "#f-water", r.water);
    setAuto("feed", "#f-feed", r.feed);
    const t = fitText(r.fit, prof);
    fitMsg.hidden = !t; fitMsg.textContent = t;
    const changed = r.water !== prof.waterDays || r.feed !== prof.feedDays;
    schedMsg.hidden = false;
    const own = $f("#f-water").value !== "" && $f("#f-water").value !== String(r.water);
    schedMsg.textContent = own
      ? `You set your own interval. For this light LeafKin would suggest every ${r.water} d.`
      : changed
      ? `Adjusted for this light${room === "bathroom" || room === "outdoor" ? " and room" : ""}. ${(s => s[0].toUpperCase() + s.slice(1))(aOrAn(prof.en))} in its ideal light needs water every ${prof.waterDays} d${prof.feedDays ? ` and food every ${prof.feedDays} d` : ""}.`
      : `Typical for ${aOrAn(prof.en)}. Change it if your plant needs otherwise.`;
  }
  ["#f-room", "#f-light", "#f-sun"].forEach((id) => $f(id).addEventListener("change", recalc));
  ["#f-light", "#f-sun"].forEach((id) => $f(id).addEventListener("change", (e) => { auto[id === "#f-light" ? "light" : "sun"] = null; }));

  function applyProfile(newProf, { setSpecies = true } = {}) {
    prof = newProf;
    if (setSpecies) species.value = prof.en;
    const set = (sel, v) => { if (v !== undefined && v !== null) $f(sel).value = v; };
    // Start from the light this plant likes, unless you already picked the light at its spot.
    setAuto("light", "#f-light", prof.light);
    setAuto("sun", "#f-sun", prof.sun);
    set("#f-wstyle", prof.water); set("#f-hum", prof.humidity); set("#f-pet", prof.pet);
    // A new plant type resets the intervals to that type's numbers.
    auto.water = $f("#f-water").value; auto.feed = $f("#f-feed").value;
    if (!$f("#f-name").value.trim()) $f("#f-name").value = prof.en;
    tip = prof.tip; p.sci = prof.sci;
    fillMsg.hidden = false;
    fillMsg.textContent = `Care filled in for ${prof.en} (${prof.sci}). Adjust anything that's different in your home.`;
    autoBtn.hidden = true;
    recalc();
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
          const img = r.images[0];
          return `<li class="cand-row">
            ${img ? `<button type="button" class="cand-thumb" data-zoom="${i}" aria-label="Enlarge photos of ${esc(r.common[0] || r.sci)}"><img src="${esc(img.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></button>`
              : `<span class="cand-thumb none" aria-hidden="true">${leafSvg}</span>`}
            <button type="button" class="cand" data-i="${i}">
              <span class="cand-main"><b>${esc(r.common[0] || r.sci)}</b><i class="muted">${esc(r.sci)}</i></span>
              <span class="cand-side"><span class="mono">${Math.round(r.score * 100)}%</span>${prof ? `<span class="pill ok">Care known</span>` : ""}</span>
            </button></li>`;
        }).join("")}</ul>`;
        out.querySelectorAll("[data-zoom]").forEach((b) => (b.onclick = () => {
          const r = results[+b.dataset.zoom];
          openLightbox(r.images, r.common[0] || r.sci, r.sci);
        }));
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
    p.name = v("#f-name"); p.species = v("#f-species");
    p.location = ROOMS[v("#f-room")] || "";
    const oldWater = p.waterEvery;
    p.waterEvery = Math.max(0, parseInt(v("#f-water"), 10) || 0);
    if (p.waterEvery !== oldWater) p.snoozeStreak = 0;
    const rm = v("#f-repot");
    if (rm && rm !== (p.lastRepotted || "").slice(0, 7)) p.lastRepotted = new Date(rm + "-15T12:00:00").toISOString();
    if (!rm) p.lastRepotted = null;
    p.feedEvery = Math.max(0, parseInt(v("#f-feed"), 10) || 0);
    const m = matchAny(p.species);
    if (m && !tip) tip = m.tip;
    // Keep the exact type: a variety, the Latin name from a scan "(…)", or a typed Latin name.
    const bracket = /\(([^)]+)\)/.exec(p.species)?.[1]?.trim();
    const typedExact = m && [m.en, m.nl, m.sci].some((x) => x.toLowerCase() === p.species.toLowerCase());
    const looksLatin = /^[A-Z][a-z]+ [a-z×-]+/.test(p.species);
    p.sci = m?.cultivar ? m.sci : bracket ? bracket : typedExact ? m.sci : looksLatin ? p.species : (m?.sci || "");
    p.care = { room: v("#f-room"), light: v("#f-light"), sun: v("#f-sun"), water: v("#f-wstyle"), humidity: v("#f-hum"), pet: v("#f-pet"), notes: v("#f-notes"), tip };
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
  if (ROOMS[c.room] || p.location) rows.push(["Room", ROOMS[c.room] || p.location]);
  if (c.light || c.sun) rows.push(["Light", [LIGHT[c.light], SUN_SHORT[c.sun] || ""].filter(Boolean).join(" · ")]);
  const W = waterInterval(p);
  if (c.water || W) rows.push(["Water", [WATER[c.water], W ? `every ${W} d${W !== p.waterEvery ? ` in winter (normally ${p.waterEvery})` : ""}` : ""].filter(Boolean).join(" · ")]);
  if (p.feedEvery) rows.push(["Feed", feedInterval(p) ? `every ${p.feedEvery} d, spring–summer` : `paused until March (normally every ${p.feedEvery} d)`]);
  rows.push(["Repotted", p.lastRepotted ? fmtDate(p.lastRepotted) : "Not logged"]);
  if (c.humidity) rows.push(["Air", HUMIDITY[c.humidity]]);
  if (c.pet && c.pet !== "unknown") rows.push(["Pets", PET[c.pet]]);
  return rows;
}

function openDetail(id) {
  const p = state.plants.find((x) => x.id === id); if (!p) return closeSheet();
  detailId = id;
  const c = p.care || {};
  const rows = careRows(p);
  const hist = (p.history || []).slice(0, 8);
  const checks = (p.checks || []).slice(0, 3);
  const s = sheet("detail", `
    <div class="sheet-head"><div><h2>${esc(p.name)}</h2>${subtitle(p) ? `<div class="muted" style="font-style:italic">${esc(subtitle(p))}</div>` : ""}</div><button class="x" data-close aria-label="Close">×</button></div>
    <div class="summary">${chipsFor(p, false)}</div>
    ${p.waterEvery || p.feedEvery ? `<div class="btnrow">${p.waterEvery ? `<button class="btn water grow" id="dW">Watered now</button>` : ""}${feedInterval(p) ? `<button class="btn food grow" id="dF">Fed now</button>` : ""}</div>` : ""}
    ${p.waterEvery && (waterDue(p) ?? 99) <= 1 ? `<button class="btn" id="dDamp">Soil still damp · check again in 2 days</button>` : ""}
    ${repotDue(p) ? `<button class="btn" id="dRepot">Repotted</button>` : ""}

    <div class="card">
      <div class="card-head"><h3>Health</h3>${checks[0] ? statusPill(checks[0].status) : ""}</div>
      ${checks[0] ? `<p class="muted" style="font-size:.9rem">Last check ${fmtDate(checks[0].at)}${checks[0].causes?.length ? `: ${esc(checks[0].causes.map((x) => x.title).join(", "))}` : ""}</p>` : `<p class="muted">Take a photo and tick what you see to get a few quick fixes.</p>`}
      <button class="btn" id="dHealth">${camSvg} Check health</button>
    </div>

    <div class="card care"><h3>Care</h3>
      ${rows.length ? `<dl>${rows.map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("")}</dl>` : `<p class="muted">No care set yet. Edit the plant to fill it in.</p>`}
      ${c.tip ? `<p class="tip">${esc(c.tip)}</p>` : ""}
      ${c.notes ? `<p class="muted" style="font-size:.9rem">${esc(c.notes)}</p>` : ""}
      ${winterActive() && p.waterEvery ? `<p class="hint">Winter care is on: watering is stretched and feeding paused until March.</p>` : ""}
      <button class="btn" id="dRepotLog">${p.lastRepotted ? "Repotted again" : "Log repotting"}</button>
    </div>

    <div class="card" id="growthCard">${growthHtml(p)}</div>

    <details class="card"><summary><h3 style="display:inline">History</h3></summary>
      ${hist.length ? `<ul class="log" style="margin-top:8px">${hist.map((h) => `<li><span>${{ water: "💧 Watered", feed: "Fed", snooze: "Soil still damp", repot: "Repotted" }[h.type] || h.type}${db.members().length > 1 && db.memberName(h.by) ? ` <span class="muted">· ${esc(db.memberName(h.by))}</span>` : ""}</span><span class="mono muted">${fmtDateTime(h.at)}</span></li>`).join("")}</ul>` : `<p class="muted" style="margin-top:8px">Nothing logged yet.</p>`}
    </details>

    <div class="btnrow"><button class="btn grow" id="dEdit">Edit</button><button class="btn danger grow" id="dDel">Delete</button></div>
    <div class="confirm" id="delConfirm" hidden><span>Delete ${esc(p.name)} with its photos and history?</span><button class="btn danger" id="dDelYes">Delete</button><button class="btn" id="dDelNo">Keep</button></div>`);
  s.querySelector("#dW")?.addEventListener("click", () => logCare(id, "water"));
  s.querySelector("#dDamp")?.addEventListener("click", () => snoozeWater(id));
  s.querySelector("#dRepot")?.addEventListener("click", () => logCare(id, "repot"));
  s.querySelector("#dRepotLog").onclick = () => logCare(id, "repot");
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
  const blk = blockingPhoto(p, new Date().toISOString());
  const s = sheet("health", `
    <div class="sheet-head"><h2>Check ${esc(p.name)}</h2><button class="x" id="hBack" aria-label="Back">×</button></div>
    <input type="file" id="hIn" accept="image/*" hidden>
    <button class="btn" id="hCam">${camSvg} Take a photo</button>
    <img class="preview" id="hPrev" alt="Photo of ${esc(p.name)}" hidden>
    <label class="check" id="hKeepRow" hidden><input type="checkbox" id="hKeep" ${blk ? "" : "checked"}> ${blk ? `Replace the timeline photo from ${fmtDate(blk.at)} (one per ${periodWord()})` : "Add photo to the growth timeline"}</label>
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
    if (file) { try { photoId = await storePhoto(file); } catch { /* optional */ } }
    p.checks = [{ id: uid(), at: new Date().toISOString(), status: result.status, symptoms: [...picked], causes: result.causes.map((x) => ({ title: x.title })), photoId }, ...(p.checks || [])];
    if (photoId && s.querySelector("#hKeep").checked) {
      await addSnapshot(p, { id: uid(), at: new Date().toISOString(), photoId, note: STATUS_LABEL[result.status] }, blk);
    } else {
      await savePlant(p);
    }
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
    ${photoDue(p) ? `<p class="tip">${lastPhotoAt(p) ? `Last photo ${daysBetween(lastPhotoAt(p), new Date())} days ago.` : "No photo yet."} Time for a new snapshot.</p>` : ""}
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

// Add a timeline snapshot; when `replace` is given, its photo is swapped out first
// (the old snapshot is kept if it still has a height or note).
async function addSnapshot(p, snap, replace) {
  let growth = [...(p.growth || [])];
  if (replace) {
    const oldPhoto = replace.photoId;
    growth = growth.flatMap((g) => {
      if (g.id !== replace.id) return [g];
      const keep = typeof g.heightCm === "number" || (g.note && g.note.trim());
      return keep ? [{ ...g, photoId: null }] : [];
    });
    const stillUsed = (p.checks || []).some((c) => c.photoId === oldPhoto);
    if (oldPhoto && !stillUsed) { db.deletePhoto(oldPhoto).catch(() => {}); urlCache.delete(oldPhoto); }
  }
  p.growth = [...growth, snap];
  await savePlant(p);
}
const periodWord = () => PHOTO_PERIODS[photoPeriod()].label;

function openSnapshot(id) {
  const p = state.plants.find((x) => x.id === id); if (!p) return;
  let file = null;
  const today = new Date().toISOString().slice(0, 10);
  const lastH = [...sortedGrowth(p)].reverse().find((s) => typeof s.heightCm === "number")?.heightCm;
  const s = sheet("snapshot", `
    <div class="sheet-head"><h2>Snapshot of ${esc(p.name)}</h2><button class="x" id="sBack" aria-label="Back">×</button></div>
    <input type="file" id="sIn" accept="image/*" hidden>
    ${(() => { const nx = nextPhotoDate(p); return nx ? `<p class="tip">One photo per ${periodWord()}: the last one is from ${fmtDate(lastPhotoAt(p))}. A new photo is possible from ${fmtDate(nx.toISOString())}. You can still log the height, or replace that photo.</p>` : ""; })()}
    <button class="btn" id="sCam">${camSvg} Take or choose photo</button>
    <img class="preview" id="sPrev" alt="New photo of ${esc(p.name)}" hidden>
    <p class="hint">Shoot from the same spot and angle each time so the photos line up.</p>
    <div class="row2">
      <div class="field"><label for="sH">Height (cm)</label><input id="sH" type="number" step="0.5" min="0" inputmode="decimal" placeholder="${lastH ? `last: ${lastH}` : "e.g. 42"}"></div>
      <div class="field"><label for="sD">Date</label><input id="sD" type="date" value="${today}" max="${today}"></div>
    </div>
    <div class="field"><label for="sN">Note (optional)</label><input id="sN" autocomplete="off" maxlength="80" placeholder="e.g. new leaf, repotted"></div>
    <p class="err" id="sErr" hidden></p>
    <div class="confirm" id="sReplace" hidden><span id="sReplaceTxt"></span><button class="btn primary" id="sReplaceYes">Replace</button><button class="btn" id="sReplaceNo">Cancel</button></div>
    <button class="btn primary" id="sSave">Add to timeline</button>`);
  s.querySelector("#sBack").onclick = () => openDetail(id);
  const input = s.querySelector("#sIn"), prev = s.querySelector("#sPrev");
  s.querySelector("#sCam").onclick = () => input.click();
  input.onchange = () => {
    file = input.files?.[0]; if (!file) return;
    if (prev.src) URL.revokeObjectURL(prev.src);
    prev.src = URL.createObjectURL(file); prev.hidden = false;
  };
  let replaceOk = false;
  s.querySelector("#sReplaceNo").onclick = () => { s.querySelector("#sReplace").hidden = true; };
  s.querySelector("#sReplaceYes").onclick = () => { replaceOk = true; s.querySelector("#sReplace").hidden = true; s.querySelector("#sSave").click(); };
  s.querySelector("#sSave").onclick = async () => {
    const err = s.querySelector("#sErr"), btn = s.querySelector("#sSave");
    err.hidden = true;
    const hRaw = s.querySelector("#sH").value;
    const heightCm = hRaw === "" ? null : Math.round(parseFloat(hRaw) * 10) / 10;
    if (!file && heightCm === null) { err.textContent = "Add a photo or a height."; err.hidden = false; return; }
    if (heightCm !== null && !(heightCm >= 0)) { err.textContent = "Height must be a number in centimetres."; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = "Saving…";
    const d = s.querySelector("#sD").value || today;
    const at = d === today ? new Date().toISOString() : new Date(d + "T12:00:00").toISOString();
    const block = file ? blockingPhoto(p, at) : null;
    if (block && !replaceOk) {
      s.querySelector("#sReplaceTxt").textContent = `There's already a photo from ${fmtDate(block.at)} (one per ${periodWord()}). Replace it with this one?`;
      s.querySelector("#sReplace").hidden = false;
      btn.disabled = false; btn.textContent = "Add to timeline";
      return;
    }
    let photoId = null;
    if (file) {
      try { photoId = await storePhoto(file); }
      catch { err.textContent = "Couldn't save the photo. Try another one, or free up storage."; err.hidden = false; btn.disabled = false; btn.textContent = "Add to timeline"; return; }
    }
    const snap = { id: uid(), at, photoId, note: s.querySelector("#sN").value.trim() };
    if (heightCm !== null) snap.heightCm = heightCm;
    await addSnapshot(p, snap, block);
    toast(block ? "Photo replaced" : "Snapshot added"); openDetail(id);
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

/* ---------- photo viewer: reference photos from a scan, on top of the open sheet ---------- */
function openLightbox(images, title, subtitle) {
  if (!images?.length) return;
  let i = 0;
  const box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", `Photos of ${title}`);
  box.innerHTML = `
    <div class="lb-head"><div><b>${esc(title)}</b>${subtitle && subtitle !== title ? `<i>${esc(subtitle)}</i>` : ""}</div><button class="x lb-x" aria-label="Close">×</button></div>
    <div class="lb-stage"><img class="lb-img" alt=""><p class="lb-wait">Loading…</p></div>
    <div class="lb-foot"><p class="lb-credit"></p>
      ${images.length > 1 ? `<div class="lb-nav"><button class="btn sm" data-step="-1" aria-label="Previous photo">‹</button><span class="lb-count mono"></span><button class="btn sm" data-step="1" aria-label="Next photo">›</button></div>` : ""}</div>`;
  const img = box.querySelector(".lb-img"), wait = box.querySelector(".lb-wait");
  const show = () => {
    const it = images[i];
    wait.hidden = false; wait.textContent = "Loading…";
    img.style.opacity = "0";
    img.onload = () => { wait.hidden = true; img.style.opacity = "1"; };
    img.onerror = () => { wait.textContent = "This photo couldn't be loaded."; };
    img.referrerPolicy = "no-referrer";
    img.src = it.full;
    img.alt = `${title}${it.organ ? `, ${it.organ.toLowerCase()}` : ""}`;
    box.querySelector(".lb-credit").textContent = `${it.organ ? it.organ + " · " : ""}Photo: ${it.credit}`;
    const c = box.querySelector(".lb-count"); if (c) c.textContent = `${i + 1} / ${images.length}`;
  };
  const step = (d) => { i = (i + d + images.length) % images.length; show(); };
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey, true); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    else if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
  };
  box.querySelector(".lb-x").onclick = close;
  box.querySelectorAll("[data-step]").forEach((b) => (b.onclick = () => step(+b.dataset.step)));
  box.addEventListener("click", (e) => { if (e.target === box || e.target.classList.contains("lb-stage")) close(); });
  // swipe between photos
  let x0 = null;
  box.querySelector(".lb-stage").addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  box.querySelector(".lb-stage").addEventListener("pointerup", (e) => {
    if (x0 !== null && Math.abs(e.clientX - x0) > 50 && images.length > 1) step(e.clientX < x0 ? 1 : -1);
    x0 = null;
  });
  document.addEventListener("keydown", onKey, true);
  document.body.append(box);
  show();
  box.querySelector(".lb-x").focus();
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

const splashPref = () => { try { return localStorage.getItem("leafkin.splash") || "on"; } catch { return "on"; } };

async function openSettings() {
  const est = await db.usage();
  const mb = est?.usage ? (est.usage / 1048576).toFixed(1) : null;
  const canBadge = "setAppBadge" in navigator && "Notification" in window;
  const perm = "Notification" in window ? Notification.permission : "unsupported";
  const key = plantnet.deviceKey();
  const siteKey = plantnet.hasSiteKey();
  const hh = db.household(), me = db.user(), mem = db.members();
  const owner = hh?.role === "owner";
  const myName = mem.find((m) => m.id === me?.id)?.name || "";
  const legacy = await db.legacyPlants();
  const s = sheet("settings", `
    <div class="sheet-head"><h2>Settings</h2><button class="x" data-close aria-label="Close">×</button></div>
    ${hh ? `<div class="card">
      <h3>Household</h3>
      <div class="field"><label for="hhName">Name</label><input id="hhName" maxlength="60" value="${esc(hh.name)}" ${owner ? "" : "disabled"}></div>
      <ul class="members">${mem.map((m) => `<li><span>${esc(m.name || "No name yet")}${m.id === me?.id ? ` <span class="muted">(you)</span>` : ""}</span>
        <span class="mrole">${m.role === "owner" ? `<span class="pill plain">Owner</span>` : ""}${owner && m.id !== me?.id ? `<button class="btn sm danger" data-rm="${esc(m.id)}">Remove</button>` : ""}</span></li>`).join("")}</ul>
      <button class="btn" id="invBtn">Invite someone</button>
      <div class="invite" id="invOut" hidden></div>
      ${legacy.length ? `<button class="btn" id="legacyBtn">Move ${legacy.length} plant${legacy.length === 1 ? "" : "s"} saved on this phone into this household</button>` : ""}
      <button class="btn danger" id="leaveBtn">Leave household</button>
      <div class="confirm" id="leaveConfirm" hidden><span>${mem.length > 1 ? "You'll lose access to these plants. Leave?" : "You're the only member, so the household and all its plants and photos will be deleted. Leave?"}</span><button class="btn danger" id="leaveYes">Leave</button><button class="btn" id="leaveNo">Stay</button></div>
    </div>
    <div class="card">
      <h3>Your account</h3>
      <div class="field"><label for="myName">Your name</label><input id="myName" maxlength="40" value="${esc(myName)}" placeholder="Shown to your housemates"></div>
      <p class="hint">Signed in as ${esc(me?.email || "")}</p>
      <button class="btn" id="signOutBtn">Sign out</button>
      <div class="confirm" id="soConfirm" hidden><span id="soTxt"></span><button class="btn danger" id="soYes">Sign out</button><button class="btn" id="soNo">Cancel</button></div>
    </div>` : ""}
    ${db.isGuest() ? `<div class="card">
      <h3>Guest mode</h3>
      <p>Your plants are only saved on this phone and can be lost. Create an account to keep them safe and share them; your plants come along.</p>
      <button class="btn primary" id="guestAcct">Create account or sign in</button>
    </div>` : ""}
    <div class="card">
      <h3>Plant scanning</h3>
      ${siteKey && !key ? `<p>Scanning is ready on every device. It uses Pl@ntNet, free for up to 500 scans a day.</p>
      <details><summary class="hint" style="cursor:pointer">Use a different key on this device</summary>` : `<p>Scanning uses Pl@ntNet, free for up to 500 scans a day. Paste your API key from my.plantnet.org.</p>`}
      <div class="field"><label for="pnKey">Pl@ntNet API key</label><input id="pnKey" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="2b10…" value="${esc(key)}"></div>
      <div class="btnrow"><button class="btn grow" id="pnSave">Save key</button>${key ? `<button class="btn danger" id="pnClear">Remove</button>` : ""}</div>
      <p class="hint" id="pnMsg">${siteKey ? "A key saved here is only used on this device." : "The key is stored on this device only."}</p>
      ${siteKey && !key ? `</details>` : ""}
    </div>
    ${canBadge ? `<div class="card">
      <h3>App icon</h3>
      <p>Show how many plants need care on the LeafKin icon.</p>
      <button class="btn" id="badgeBtn" ${perm === "granted" ? "disabled" : ""}>${perm === "granted" ? "Icon badge is on" : perm === "denied" ? "Blocked in iOS Settings" : "Turn on icon badge"}</button>
    </div>` : ""}
    <div class="card">
      <h3>Growth photos</h3>
      <div class="field"><label for="photoPeriod">Timeline photos per plant</label>
        <select id="photoPeriod"><option value="week" ${photoPeriod() === "week" ? "selected" : ""}>One per week</option><option value="month" ${photoPeriod() === "month" ? "selected" : ""}>One per month</option></select></div>
      <p class="hint">Keeps the timeline even. You can always replace the latest photo or log a height.</p>
    </div>
    <div class="card">
      <h3>Winter care</h3>
      <label class="check"><input type="checkbox" id="winterOn" ${winterModeOn() ? "checked" : ""}> From November to February, water less often and pause feeding</label>
      <p class="hint">Watering intervals are stretched by half. Most houseplants rest in winter, and overwatering is the most common way they die.</p>
    </div>
    <div class="card">
      <h3>Startup animation</h3>
      <label class="check"><input type="checkbox" id="splashOn" ${splashPref() !== "off" ? "checked" : ""}> Play the growing plant when LeafKin opens</label>
      <p class="hint">Tap the animation to skip it.</p>
    </div>
    <div class="card">
      <h3>Backup</h3>
      <p>Save a copy of all plants and photos as a file. ${db.isGuest() ? "Do this now and then: in guest mode it's the only copy." : "Adding from a backup puts its plants into this household."}</p>
      <div class="btnrow"><button class="btn grow" id="expBtn">Save backup</button><button class="btn grow" id="impBtn">Add from backup</button></div>
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
  s.querySelector("#photoPeriod").onchange = (e) => setPhotoPeriod(e.target.value);
  if (hh) wireAccountSettings(s, owner);
  s.querySelector("#guestAcct")?.addEventListener("click", () => { closeSheet(); gateWelcome(); });
  s.querySelector("#winterOn").onchange = (e) => { setWinterMode(e.target.checked); render(); };
  s.querySelector("#splashOn").onchange = (e) => { try { localStorage.setItem("leafkin.splash", e.target.checked ? "on" : "off"); } catch {} };
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
      msg.textContent = `Added ${n} plant${n === 1 ? "" : "s"}.`;
    } catch (e) {
      msg.textContent = e?.message === "not_leafkin" ? "That file isn't a LeafKin backup." : "Couldn't read that backup file.";
    }
  };
}

function wireAccountSettings(s, owner) {
  const $s = (q) => s.querySelector(q);
  const fail = (e) => toast(e?.message && /fetch|network|offline/i.test(e.message) ? "You're offline. Try again when connected." : "That didn't work. Try again.");
  if (owner) $s("#hhName").onchange = async (e) => {
    const v = e.target.value.trim();
    if (!v) { e.target.value = db.household().name; return; }
    try { await db.renameHousehold(v); toast("Household renamed"); } catch (er) { fail(er); }
  };
  $s("#myName").onchange = async (e) => { try { await db.setMyName(e.target.value.trim()); toast("Name saved"); } catch (er) { fail(er); } };
  s.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Tap to confirm"; return; }
    try { await db.removeMember(b.dataset.rm); b.closest("li").remove(); toast("Removed from the household"); } catch (er) { fail(er); }
  }));
  $s("#invBtn").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const code = await db.createInvite();
      const link = `${location.origin}${location.pathname}?join=${code}`;
      const out = $s("#invOut");
      out.hidden = false;
      out.innerHTML = `<p>Give this code to the person you want to invite. They open LeafKin, sign in and enter it.</p>
        <p class="invite-code mono">${esc(code)}</p><p class="hint">Valid for 7 days, for as many people as you like.</p>
        <div class="btnrow"><button class="btn grow" id="invShare">Share</button><button class="btn grow" id="invCopy">Copy code</button></div>`;
      const text = `Join our plants on LeafKin: open ${link} , sign in and enter code ${code}.`;
      out.querySelector("#invShare").onclick = async () => {
        if (navigator.share) { try { await navigator.share({ title: "LeafKin", text }); return; } catch (x) { if (x?.name === "AbortError") return; } }
        try { await navigator.clipboard.writeText(text); toast("Invite copied"); } catch { toast("Copy the code shown above"); }
      };
      out.querySelector("#invCopy").onclick = async () => { try { await navigator.clipboard.writeText(code); toast("Code copied"); } catch { toast("Copy the code shown above"); } };
    } catch (er) { fail(er); }
    e.target.disabled = false;
  };
  $s("#legacyBtn")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    const n = await db.importPlants(await db.legacyPlants());
    await db.clearLegacy(); await load(); render();
    e.target.remove(); toast(`Moved ${n} plant${n === 1 ? "" : "s"} into the household`);
  });
  $s("#leaveBtn").onclick = () => { $s("#leaveConfirm").hidden = false; };
  $s("#leaveNo").onclick = () => { $s("#leaveConfirm").hidden = true; };
  $s("#leaveYes").onclick = async () => {
    try { const r = await db.leaveHousehold(); closeSheet(); state.plants = []; render(); afterGate(r); } catch (er) { fail(er); }
  };
  $s("#signOutBtn").onclick = async () => {
    const n = await db.pendingCount();
    $s("#soTxt").textContent = n ? `${n} change${n === 1 ? " hasn't" : "s haven't"} been sent yet and will be lost. Sign out anyway?` : "Sign out of LeafKin on this device?";
    $s("#soConfirm").hidden = false;
  };
  $s("#soNo").onclick = () => { $s("#soConfirm").hidden = true; };
  $s("#soYes").onclick = async () => { await db.signOut(); closeSheet(); state.plants = []; render(); gateWelcome(); };
}

/* ---------- account gate: sign in, then join or create a household ---------- */
function showGate(html) {
  const g = $("#gate");
  g.innerHTML = `<div class="gate-inner"><div class="gate-brand">${leafSvg}<span>LeafKin</span></div>${html}</div>`;
  g.hidden = false;
  document.body.classList.add("gated");
  return g;
}
function hideGate() { const g = $("#gate"); g.hidden = true; g.innerHTML = ""; document.body.classList.remove("gated"); }

function authError(e) {
  const m = String(e?.message || e || "");
  if (/signups? not allowed|otp_disabled|user not found/i.test(m)) return "There's no LeafKin account for this email yet. Go back and choose Create account.";
  if (/not authori[sz]ed/i.test(m)) return "Codes can't be sent to this address yet: LeafKin's email service still needs to be set up for other people.";
  if (/rate|too many|security purposes|seconds/i.test(m)) return "Please wait a minute before asking for another code.";
  if (/expired|invalid|token/i.test(m)) return "That code is wrong or has expired. Ask for a new one.";
  if (/fetch|network|load failed/i.test(m)) return "You're offline. Connect to the internet to sign in.";
  if (/invalid_code/.test(m)) return "That code doesn't work. Invite codes last 7 days; ask for a new one.";
  if (/already_in_household/.test(m)) return "You're already in a household.";
  return "Something went wrong. Try again.";
}

function gateUnconfigured() { gateWelcome(); }

// First screen: create an account, sign in, or try LeafKin as a guest.
function gateWelcome() {
  const guest = db.isGuest();
  const g = showGate(`
    <h2>${guest ? "Save your plants" : "Welcome"}</h2>
    <p class="muted">${guest ? "With an account your plants are kept safe online and you can share them with the people you live with. Your plants on this phone come along." : "Reminders for watering and feeding, care guides and a growth timeline. With an account you can share your plants with the people you live with."}</p>
    ${db.configured ? `<button class="btn primary" id="wCreate">Create account</button>
    <button class="btn" id="wSignIn">Sign in</button>` : `<p class="hint">Accounts aren't available in this copy of LeafKin yet.</p>`}
    ${guest ? `<button class="btn" id="wBack">Back to my plants</button>` : `<button class="btn" id="wGuest">Continue as guest</button>
    <div class="gate-warn" id="wWarn" hidden>
      <p><b>Your plants are only saved on this phone.</b> They're lost if you delete LeafKin, clear Safari's website data, or iOS clears storage to make space. They won't sync to other devices and you can't share them.</p>
      <p class="hint">You can create an account later and move your plants into it. Saving a backup in Settings also helps.</p>
      <button class="btn primary" id="wGuestYes">I understand, continue</button>
      <button class="btn" id="wGuestNo">Back</button>
    </div>`}`);
  const $g = (q) => g.querySelector(q);
  $g("#wCreate")?.addEventListener("click", () => gateEmail("create"));
  $g("#wSignIn")?.addEventListener("click", () => gateEmail("signin"));
  $g("#wBack")?.addEventListener("click", () => afterGate("guest"));
  if (!guest) {
    $g("#wGuest").onclick = () => { $g("#wWarn").hidden = false; $g("#wGuest").hidden = true; $g("#wWarn").scrollIntoView({ behavior: "smooth", block: "nearest" }); };
    $g("#wGuestNo").onclick = () => { $g("#wWarn").hidden = true; $g("#wGuest").hidden = false; };
    $g("#wGuestYes").onclick = async (e) => { e.target.disabled = true; await afterGate(await db.startGuest()); };
  }
}

// Email + 6-digit code. mode: "signin" (existing account) or "create" (new account, asks for a name).
function gateEmail(mode) {
  const create = mode === "create";
  const g = showGate(`
    <h2>${create ? "Create account" : "Sign in"}</h2>
    <p class="muted">We'll email you a 6-digit code. No password needed.</p>
    <form id="gEmailForm" class="gate-form" novalidate>
      ${create ? `<div class="field"><label for="gName">Your name</label><input id="gName" maxlength="40" autocomplete="given-name" placeholder="Shown to the people you share with"></div>` : ""}
      <div class="field"><label for="gEmail">Email</label><input id="gEmail" type="email" autocomplete="email" inputmode="email" autocapitalize="off" placeholder="you@example.com"></div>
      <button class="btn primary" type="submit">Send code</button>
      <button class="btn" type="button" id="gBack">Back</button>
    </form>
    <form id="gCodeForm" class="gate-form" hidden novalidate>
      <p id="gSent"></p>
      <div class="field"><label for="gCode">Code</label><input id="gCode" class="code-input mono" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••"></div>
      <button class="btn primary" type="submit" id="gVerify">${create ? "Create account" : "Sign in"}</button>
      <div class="btnrow"><button type="button" class="btn grow" id="gResend">Send a new code</button><button type="button" class="btn grow" id="gOther">Other email</button></div>
    </form>
    <p class="err" id="gErr" hidden></p>`);
  const $g = (q) => g.querySelector(q);
  let email = "", name = "", wait = null;
  const err = (m) => { $g("#gErr").textContent = m || ""; $g("#gErr").hidden = !m; };
  const cooldown = () => {
    let left = 60; const b = $g("#gResend"); b.disabled = true; clearInterval(wait);
    wait = setInterval(() => { left--; b.textContent = left > 0 ? `New code in ${left} s` : "Send a new code"; if (left <= 0) { clearInterval(wait); b.disabled = false; } }, 1000);
  };
  const send = async (btn) => {
    err(""); btn.disabled = true;
    try {
      await db.sendCode(email, create);
      $g("#gEmailForm").hidden = true; $g("#gCodeForm").hidden = false;
      $g("#gSent").textContent = `We sent a code to ${email}. It can take a minute; check your spam folder too.`;
      $g("#gCode").value = ""; $g("#gCode").focus(); cooldown();
    } catch (e) { err(authError(e)); }
    btn.disabled = false;
  };
  $g("#gBack").onclick = () => { clearInterval(wait); gateWelcome(); };
  $g("#gEmailForm").onsubmit = (e) => {
    e.preventDefault();
    name = create ? $g("#gName").value.trim() : "";
    email = $g("#gEmail").value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter a valid email address.");
    send($g("#gEmailForm button[type=submit]"));
  };
  const verify = async () => {
    const code = $g("#gCode").value.replace(/\D/g, "");
    if (code.length < 6) return err("Enter the 6-digit code from the email.");
    err(""); $g("#gVerify").disabled = true;
    try {
      const u = await db.verifyCode(email, code);
      clearInterval(wait);
      const next = await db.signedIn(u);
      if (name) await db.saveProfileName(name)?.catch(() => {});
      await afterGate(next);
    } catch (e) { err(authError(e)); $g("#gVerify").disabled = false; }
  };
  $g("#gCodeForm").onsubmit = (e) => { e.preventDefault(); verify(); };
  $g("#gCode").addEventListener("input", (e) => { if (e.target.value.replace(/\D/g, "").length === 6) verify(); });
  $g("#gResend").onclick = () => send($g("#gResend"));
  $g("#gOther").onclick = () => { clearInterval(wait); $g("#gCodeForm").hidden = true; $g("#gEmailForm").hidden = false; err(""); $g("#gEmail").focus(); };
}

function gateHousehold() {
  const joinCode = (new URLSearchParams(location.search).get("join") || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const g = showGate(`
    <h2>Your household</h2>
    <p class="muted">Everyone in a household sees the same plants and can log watering. Got an invite code? Join. Otherwise start your own and invite people later.</p>
    <form id="gJoin" class="gate-form card" novalidate>
      <h3>Join with a code</h3>
      <div class="field"><label for="gJoinCode">Invite code</label><input id="gJoinCode" class="code-input mono" autocapitalize="characters" autocomplete="off" maxlength="6" value="${esc(joinCode)}" placeholder="ABC234"></div>
      <button class="btn ${joinCode ? "primary" : ""}" type="submit">Join household</button>
    </form>
    <form id="gCreate" class="gate-form card" novalidate>
      <h3>Or start a new one</h3>
      <div class="field"><label for="gName">Name</label><input id="gName" maxlength="60" value="Our plants"></div>
      <button class="btn ${joinCode ? "" : "primary"}" type="submit">Create household</button>
    </form>
    <p class="err" id="gErr" hidden></p>
    <button class="btn" id="gSignOut">Sign out</button>`);
  const $g = (q) => g.querySelector(q);
  const err = (m) => { $g("#gErr").textContent = m || ""; $g("#gErr").hidden = !m; };
  const run = async (btn, fn) => { err(""); btn.disabled = true; try { await afterGate(await fn()); } catch (e) { err(authError(e)); btn.disabled = false; } };
  $g("#gJoin").onsubmit = (e) => {
    e.preventDefault();
    const code = $g("#gJoinCode").value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 6) return err("Invite codes have 6 characters.");
    run($g("#gJoin button"), () => db.joinHousehold(code));
  };
  $g("#gCreate").onsubmit = (e) => { e.preventDefault(); run($g("#gCreate button"), () => db.createHousehold($g("#gName").value.trim() || "Our plants")); };
  $g("#gSignOut").onclick = async () => { await db.signOut(); gateWelcome(); };
}

async function afterGate(result) {
  if (result === "unconfigured") return gateUnconfigured();
  if (result === "signed-out") return gateWelcome();
  if (result === "no-household") return gateHousehold();
  hideGate();
  if (result === "guest") { await load(); render(); db.persist(); updateSyncNote(); return; }
  if (location.search.includes("join=")) history.replaceState(null, "", location.pathname);
  await load(); render(); db.persist();
  updateSyncNote();
  const legacy = await db.legacyPlants();
  if (legacy.length && !tipDismissed("legacy")) offerLegacyImport(legacy);
}

function offerLegacyImport(legacy) {
  const n = legacy.length;
  const s = sheet("import", `
    <div class="sheet-head"><h2>Plants on this phone</h2><button class="x" data-close aria-label="Close">×</button></div>
    <p>This phone has ${n} plant${n === 1 ? "" : "s"} that ${n === 1 ? "isn't" : "aren't"} in a household yet. Move ${n === 1 ? "it" : "them"} into ${esc(db.household()?.name || "your household")}, with photos and history, so everyone in it can see ${n === 1 ? "it" : "them"}?</p>
    <button class="btn primary" id="liYes">Move ${n} plant${n === 1 ? "" : "s"}</button>
    <button class="btn" id="liLater">Not now</button>
    <p class="hint">"Not now" keeps them on this phone. You can still move them from Settings.</p>`);
  s.querySelector("#liLater").onclick = () => { dismissTip("legacy"); closeSheet(); };
  s.querySelector("#liYes").onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = "Moving…";
    const moved = await db.importPlants(legacy);
    await db.clearLegacy(); await load(); render(); closeSheet();
    toast(`Moved ${moved} plant${moved === 1 ? "" : "s"}. Photos upload in the background.`);
  };
}

// "Offline · 3 changes waiting" under the date, only when something is pending or wrong.
async function updateSyncNote() {
  const el = $("#syncNote"); if (!el) return;
  if (db.isGuest()) { el.textContent = "Guest · saved on this phone only"; el.hidden = false; el.classList.remove("warn"); return; }
  const n = await db.pendingCount().catch(() => 0);
  const { online } = db.status();
  const err = db.lastError();
  el.textContent = !online ? (n ? `Offline · ${n} change${n === 1 ? "" : "s"} waiting` : "Offline")
    : n ? "Saving…" : err ? "A change couldn't be saved. Reopen LeafKin to refresh." : "";
  el.hidden = !el.textContent;
  el.classList.toggle("warn", !!err && online && !n);
}

/* ---------- splash, install hint & updates ---------- */
function runSplash() {
  const el = $("#splash"); if (!el) return;
  const done = () => { el.classList.add("out"); setTimeout(() => el.remove(), 550); };
  el.addEventListener("click", done, { once: true });
  setTimeout(done, 3500);
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
$("#search").addEventListener("input", (e) => { view.q = e.target.value; render(); });
$("#swipeTipClose").onclick = () => { dismissTip("swipe"); $("#swipeTip").hidden = true; };
document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
setInterval(render, 60 * 60 * 1000);

runSplash();
setupInstallHint();
setupServiceWorker();
db.onChange(async (what) => {
  if (what === "plants") {
    await load(); render();
    if (isOpen("detail") && detailId) openDetail(detailId);
  } else if (what === "household") {
    closeSheet(); state.plants = []; render(); afterGate("no-household");
  } else if (what === "members" && isOpen("detail") && detailId) {
    openDetail(detailId);
  }
  updateSyncNote();
});
db.start().then(afterGate).catch((e) => {
  console.error(e);
  $("#emptyState").hidden = false;
  toast("Couldn't open storage. Private browsing can block it.");
});
