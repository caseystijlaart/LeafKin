// Lab (beta only): compare photo health checks on the same labelled test photos (lab/testset.json, never used to
// train LeafKin's model). Own models run on the phone; Pl@ntNet is called with the site's key.
import { diagnose } from "./diagnose.js";
import { identifyDisease, deviceKey, hasSiteKey, errorText } from "./plantnet.js";
import { esc } from "./util.js";

const LAB = new URL("../lab/", import.meta.url);

// One model run gives all three own variants; keep it for the photo being checked.
let lastBlob = null, lastRun = null;
async function ownRun(blob, variant) {
  if (blob !== lastBlob) { lastBlob = blob; lastRun = diagnose(blob); }
  const r = await lastRun;
  const v = variant ? r.variants[variant] : r;
  const top = Object.entries(v.probs).sort((a, b) => b[1] - a[1])[0][0];
  return { sick: v.sick, top, probs: v.probs, ms: r.ms };
}

// Each option returns { sick: 0..1 or null (no answer), top: "text", ms }
const OPTIONS = {
  own: { name: "Own model A+B (in the app)", run: (blob) => ownRun(blob, null) },
  ownA: { name: "Own model A (no PlantDoc)", run: (blob) => ownRun(blob, "A") },
  ownB: { name: "Own model B (with PlantDoc)", run: (blob) => ownRun(blob, "B") },
  plantnet: {
    name: "Pl@ntNet diseases",
    async run(blob) {
      const t = performance.now();
      let res;
      try { res = await identifyDisease(blob); } catch (e) { throw new Error(e?.code ? `Pl@ntNet: ${errorText(e.code)}` : String(e)); }
      // No "healthy" answer exists: the confidence of the best disease is used as "sick".
      return { sick: res.length ? res[0].score : 0, top: res.length ? `${res[0].name} (${Math.round(res[0].score * 100)}%)` : "nothing found", answered: res.length > 0, ms: Math.round(performance.now() - t) };
    },
  },
};

// ---- scoring ----
function auc(scores, labels) {   // probability a random sick photo scores higher than a random healthy one
  const pos = scores.filter((_, i) => labels[i]), neg = scores.filter((_, i) => !labels[i]);
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
}
function summarise(rows, key) {
  const done = rows.filter((r) => r[key] && !r[key].error);
  const ans = done.filter((r) => r[key].sick !== null && r[key].answered !== false);
  const y = done.map((r) => r.label !== "healthy");
  const sc = done.map((r) => r[key].sick ?? 0);
  const pred = sc.map((v) => v >= 0.5);
  const sickN = y.filter(Boolean).length, healthyN = y.length - sickN;
  const fa = healthyN ? pred.filter((p, i) => p && !y[i]).length / healthyN : null;
  const miss = sickN ? pred.filter((p, i) => !p && y[i]).length / sickN : null;
  const known = done.filter((r) => r.species !== "other");
  return {
    n: done.length, errors: rows.filter((r) => r[key]?.error).length, answered: ans.length,
    auc: auc(sc, y), bal: fa === null || miss === null ? null : 1 - (fa + miss) / 2, fa, miss,
    top1: key.startsWith("own") && known.length ? known.filter((r) => r[key].top === r.label).length / known.length : null,
    ms: done.length ? Math.round(done.reduce((a, r) => a + r[key].ms, 0) / done.length) : null,
  };
}
const pct = (v) => (v === null || v === undefined ? "–" : `${Math.round(v * 100)}%`);
const num = (v) => (v === null || v === undefined ? "–" : v.toFixed(2));

export function renderLab(root, { closeBack }) {
  root.innerHTML = `
    <div class="sheet-head"><h2>Lab</h2><button class="x" data-close aria-label="Close">×</button></div>
    <p class="muted">Compare photo health checks on the same ${"labelled"} test photos. None of them were used to train LeafKin's model. Beta only.</p>
    <div class="card">
      <h3>Options</h3>
      <label class="check"><input type="checkbox" id="lOwn" checked disabled> Own model, on the phone and free: A+B as used in the app, plus A (without PlantDoc) and B (with PlantDoc) separately</label>
      <label class="check"><input type="checkbox" id="lPn" ${hasSiteKey() || deviceKey() ? "checked" : "disabled"}> Pl@ntNet diseases (1 scan credit per photo, 500 free a day)</label>
      <p class="hint">Photos sent to Pl@ntNet are the test photos, not your own.</p>
      <div class="field"><label for="lN">Number of test photos</label>
        <select id="lN"><option value="20">20</option><option value="50" selected>50</option><option value="100">100</option><option value="160">All 160</option></select></div>
      <p class="hint">Each first group is balanced across plants and problems.</p>
      <div class="btnrow"><button class="btn primary grow" id="lRun">Run comparison</button><button class="btn" id="lStop" hidden>Stop</button></div>
      <p class="hint" id="lStatus"></p>
    </div>
    <div id="lOut"></div>
    <div class="card">
      <h3>Try one photo</h3>
      <p class="hint">See what each option says about a photo of your own. Pl@ntNet receives this photo.</p>
      <input type="file" id="lOneIn" accept="image/*" hidden>
      <button class="btn" id="lOne">Choose a photo</button>
      <div id="lOneOut"></div>
    </div>
    <button class="btn" id="lBack">Back to Settings</button>`;
  const $ = (q) => root.querySelector(q);
  $("#lBack").onclick = closeBack;
  const chosen = () => ["own", "ownA", "ownB", ...($("#lPn").checked ? ["plantnet"] : []), ];

  let stop = false, rows = [];
  $("#lStop").onclick = () => { stop = true; };
  $("#lRun").onclick = async () => {
    const keys = chosen(); stop = false;
    $("#lRun").disabled = true; $("#lStop").hidden = false;
    const status = (t) => { $("#lStatus").textContent = t; };
    try {
      status("Loading test photos…");
      const set = await (await fetch(new URL("testset.json", LAB))).json();
      const photos = set.photos.slice(0, Number($("#lN").value));
      rows = photos.map((p) => ({ ...p }));
      const dead = {};
      for (let i = 0; i < rows.length && !stop; i++) {
        status(`Photo ${i + 1} of ${rows.length}…`);
        const blob = await (await fetch(new URL(rows[i].file, LAB))).blob();
        for (const k of keys) {
          if (dead[k]) { rows[i][k] = { error: dead[k] }; continue; }
          try { rows[i][k] = await OPTIONS[k].run(blob); }
          catch (e) {
            const msg = e?.message || String(e);
            rows[i][k] = { error: msg };
            if (/blocked|refused|key|credits|quota|used up|reached|offline/i.test(msg)) dead[k] = msg;   // don't keep failing
          }
        }
        if (i % 5 === 4 || i === rows.length - 1) show(keys);
      }
      status(stop ? "Stopped." : `Done: ${rows.length} photos.`);
      show(keys);
    } catch (e) { status("The test photos couldn't be loaded. Are you online?"); }
    $("#lRun").disabled = false; $("#lStop").hidden = true;
  };

  function show(keys) {
    const S = Object.fromEntries(keys.map((k) => [k, summarise(rows, k)]));
    const errs = keys.map((k) => rows.find((r) => r[k]?.error)?.[k]?.error && `${OPTIONS[k].name}: ${rows.find((r) => r[k]?.error)[k].error}`).filter(Boolean);
    $("#lOut").innerHTML = `
      <div class="card">
        <h3>Results</h3>
        <div class="tablewrap"><table class="labtable">
          <tr><th></th>${keys.map((k) => `<th>${esc(OPTIONS[k].name)}</th>`).join("")}</tr>
          <tr><td>Photos checked</td>${keys.map((k) => `<td>${S[k].n}${S[k].errors ? ` <span class="muted">(${S[k].errors} failed)</span>` : ""}</td>`).join("")}</tr>
          <tr><td>Gave an answer</td>${keys.map((k) => `<td>${S[k].n ? pct(S[k].answered / S[k].n) : "–"}</td>`).join("")}</tr>
          <tr><td>Healthy vs sick (AUC, 1 = perfect)</td>${keys.map((k) => `<td><b>${num(S[k].auc)}</b></td>`).join("")}</tr>
          <tr><td>Balanced accuracy</td>${keys.map((k) => `<td>${pct(S[k].bal)}</td>`).join("")}</tr>
          <tr><td>Healthy called sick</td>${keys.map((k) => `<td>${pct(S[k].fa)}</td>`).join("")}</tr>
          <tr><td>Sick called healthy</td>${keys.map((k) => `<td>${pct(S[k].miss)}</td>`).join("")}</tr>
          <tr><td>Right symptom (labelled sick and healthy photos, not "other plants")</td>${keys.map((k) => `<td>${pct(S[k].top1)}</td>`).join("")}</tr>
          <tr><td>Time per photo</td>${keys.map((k) => `<td>${S[k].ms === null ? "–" : S[k].ms + " ms"}</td>`).join("")}</tr>
        </table></div>
        <p class="hint">Pl@ntNet has no "healthy" answer, so its best disease confidence counts as "sick". The symptom row only applies to LeafKin's own models. "Real-world" photos are PlantDoc photos of garden and crop plants.</p>
        ${errs.length ? `<p class="err">${errs.map(esc).join("<br>")}</p>` : ""}
        <button class="btn" id="lCsv">Download results (CSV)</button>
        <details><summary class="hint">Every photo</summary>
          <div class="tablewrap"><table class="labtable small">
            <tr><th>Photo</th><th>Label</th>${keys.map((k) => `<th>${esc(OPTIONS[k].name)}</th>`).join("")}</tr>
            ${rows.filter((r) => keys.some((k) => r[k])).map((r) => `<tr><td><img src="${new URL(r.file, LAB).href}" alt="" width="48" height="48" loading="lazy"></td>
              <td>${esc(r.label)}<br><span class="muted">${esc(r.species)}</span></td>
              ${keys.map((k) => `<td>${!r[k] ? "" : r[k].error ? `<span class="err">${esc(r[k].error)}</span>` : `${esc(r[k].top)}<br><span class="muted">sick ${r[k].sick === null ? "–" : Math.round(r[k].sick * 100) + "%"}</span>`}</td>`).join("")}</tr>`).join("")}
          </table></div>
        </details>
      </div>`;
    $("#lCsv").onclick = () => {
      const head = ["file", "label", "species", ...keys.flatMap((k) => [`${k}_sick`, `${k}_top`, `${k}_error`])];
      const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [head.join(","), ...rows.map((r) => [r.file, r.label, r.species, ...keys.flatMap((k) => [r[k]?.sick ?? "", r[k]?.top ?? "", r[k]?.error ?? ""])].map(q).join(","))];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
      a.download = `leafkin-lab-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    };
  }

  const oneIn = $("#lOneIn");
  $("#lOne").onclick = () => oneIn.click();
  oneIn.onchange = async () => {
    const f = oneIn.files?.[0]; if (!f) return;
    const out = $("#lOneOut"); const keys = chosen();
    out.innerHTML = `<img class="preview" src="${URL.createObjectURL(f)}" alt=""><p class="hint">Checking…</p>`;
    const res = {};
    for (const k of keys) { try { res[k] = await OPTIONS[k].run(f); } catch (e) { res[k] = { error: e?.message || String(e) }; } }
    out.querySelector(".hint").outerHTML = `<ul class="plain-list">${keys.map((k) => `<li><b>${esc(OPTIONS[k].name)}:</b> ${res[k].error ? `<span class="err">${esc(res[k].error)}</span>`
      : `${esc(res[k].top)}, sick ${res[k].sick === null ? "–" : Math.round(res[k].sick * 100) + "%"}${res[k].probs ? ` <span class="muted">(${Object.entries(res[k].probs).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${Math.round(v * 100)}%`).join(", ")})</span>` : ""}`}</li>`).join("")}</ul>`;
  };
}
