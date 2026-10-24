// Photo health check that runs on the phone: a small image model (MobileNetV2 + a classifier trained on leaf
// photos, see ml/REPORT.md) looks at a close-up of one leaf. The photo never leaves the device.
// The model (14 MB) and the runtime (11 MB) load the first time it's used, then stay cached for offline use.

const VENDOR = new URL("./vendor/ort/", import.meta.url);
const MODELS = new URL("../models/", import.meta.url);
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

// Model output → the health check's symptom ids (js/health.js). "pests" is left out on purpose: in the training
// data it only exists for cactus, and those photos can be told apart by camera alone (ml/REPORT.md).
export const TO_SYMPTOM = { spots: "spots", brown_tips: "brown_tips", wilting: "droop", scorch: "scorch", mildew: "powder", yellowing: "yellow_all" };

let loading = null;
function load() {
  loading ??= (async () => {
    const ort = await import("./vendor/ort/ort.wasm.min.mjs");
    ort.env.wasm.wasmPaths = VENDOR.href;
    ort.env.wasm.numThreads = 1;   // GitHub Pages can't enable the cross-origin isolation threads need
    const get = (f, as) => fetch(new URL(f, MODELS)).then((r) => { if (!r.ok) throw new Error(f); return r[as](); });
    const [info, model, check, protoBuf] = await Promise.all([
      get("leafkin-symptoms.json", "json"), get("leafkin-symptoms.onnx", "arrayBuffer"),
      get("leaf-check.json", "json"), get("leafkin-prototypes.bin", "arrayBuffer"),
    ]);
    const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
    return { ort, session, info, check: { ...check, allowedSet: new Set(check.allowed), proto: new Float32Array(protoBuf) } };
  })();
  loading.catch(() => { loading = null; });   // allow a retry after a failed download
  return loading;
}
export const preload = () => load().then(() => true, () => false);

// Same steps as ml/features.py: centre square crop, area-average down to 224×224 (PIL's BOX filter, reproduced
// exactly: horizontal pass, round to 8 bit, vertical pass, round), ImageNet normalisation, NCHW.
async function toTensor(ort, source) {
  const bmp = source instanceof Blob ? await createImageBitmap(source, { imageOrientation: "from-image" }) : source;
  let side = Math.min(bmp.width, bmp.height);
  let src = bmp, sx = Math.floor((bmp.width - side) / 2), sy = Math.floor((bmp.height - side) / 2);
  // Phone photos are huge: halve them first (to at most 896 px) so reading the pixels stays light.
  while (side > 896) {
    const half = Math.floor(side / 2);
    const c = canvas(half, half);
    c.ctx.imageSmoothingQuality = "high";
    c.ctx.drawImage(src, sx, sy, side, side, 0, 0, half, half);
    src = c.canvas; sx = 0; sy = 0; side = half;
  }
  const c = canvas(side, side);
  c.ctx.drawImage(src, sx, sy, side, side, 0, 0, side, side);
  const rgba = c.ctx.getImageData(0, 0, side, side).data;
  bmp.close?.();
  const px = boxResize(rgba, side, 224);
  const data = new Float32Array(3 * 224 * 224);
  for (let i = 0; i < 224 * 224; i++) {
    for (let ch = 0; ch < 3; ch++) data[ch * 224 * 224 + i] = (px[i * 3 + ch] / 255 - MEAN[ch]) / STD[ch];
  }
  return { tensor: new ort.Tensor("float32", data, [1, 3, 224, 224]), px };
}

// Sharpness = variance of the Laplacian on the grey 224×224 image (as ml/leaf_guard.py, PIL's grey conversion).
function sharpness(px) {
  const n = 224, g = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) g[i] = (px[i * 3] * 19595 + px[i * 3 + 1] * 38470 + px[i * 3 + 2] * 7471 + 0x8000) >> 16;
  let sum = 0, sum2 = 0, cnt = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const v = g[y * n + x - 1] + g[y * n + x + 1] + g[(y - 1) * n + x] + g[(y + 1) * n + x] - 4 * g[y * n + x];
    sum += v; sum2 += v * v; cnt++;
  }
  const mean = sum / cnt;
  return sum2 / cnt - mean * mean;
}

// Leaf check (ml/leaf_guard.py): blurry? confidently something else (ImageNet)? unlike every training leaf?
function leafCheck(check, logits, embedding, sharp) {
  let max = -Infinity, arg = 0;
  for (let i = 0; i < logits.length; i++) if (logits[i] > max) { max = logits[i]; arg = i; }
  let sum = 0;
  for (let i = 0; i < logits.length; i++) sum += Math.exp(logits[i] - max);
  const p = 1 / sum;
  const { proto, prototypes: { count, dim }, thresholds: t } = check;
  let fam = -1;
  for (let k = 0; k < count; k++) {
    let d = 0;
    for (let j = 0; j < dim; j++) d += proto[k * dim + j] * embedding[j];
    if (d > fam) fam = d;
  }
  // "Blurry" and "not a leaf" only count when the photo also looks unlike the training leaves (leaf_like).
  const leafLike = fam >= t.leaf_like, otherThing = !check.allowedSet.has(arg);
  const verdict = sharp < t.sharpness && !leafLike ? "blurry"
    : p >= t.imagenet_prob && otherThing && !leafLike ? "not_leaf"
    : fam < t.familiarity ? "unfamiliar" : "ok";
  // A confident guess of something that isn't a plant is worth naming in the message.
  return { verdict, looksLike: check.names[arg], guess: p >= 0.5 && otherThing ? check.names[arg] : null, p, familiarity: fam, sharpness: sharp };
}

function boxCoeffs(nIn, nOut) {
  const scale = nIn / nOut, fs = Math.max(scale, 1), support = 0.5 * fs, out = [];   // as PIL: enlarging keeps a 1-pixel window
  for (let xx = 0; xx < nOut; xx++) {
    const c = (xx + 0.5) * scale;
    const x0 = Math.max(Math.trunc(c - support + 0.5), 0), x1 = Math.min(Math.trunc(c + support + 0.5), nIn);
    const ws = [];
    for (let x = x0; x < x1; x++) { const v = (x - c + 0.5) / fs; ws.push(v >= -0.5 && v < 0.5 ? 1 : 0); }
    const t = ws.reduce((a, b) => a + b, 0);
    out.push([x0, ws.map((w) => w / t)]);
  }
  return out;
}
// Square RGBA image (n×n) → RGB Uint8 m×m, area average.
function boxResize(rgba, n, m) {
  const cf = boxCoeffs(n, m);
  const tmp = new Uint8Array(n * m * 3);
  for (let y = 0; y < n; y++) {
    for (let i = 0; i < m; i++) {
      const [x0, ws] = cf[i];
      for (let ch = 0; ch < 3; ch++) {
        let v = 0;
        for (let k = 0; k < ws.length; k++) v += ws[k] * rgba[(y * n + x0 + k) * 4 + ch];
        tmp[(y * m + i) * 3 + ch] = Math.min(255, Math.max(0, Math.floor(v + 0.5)));
      }
    }
  }
  const out = new Uint8Array(m * m * 3);
  for (let j = 0; j < m; j++) {
    const [y0, ws] = cf[j];
    for (let i = 0; i < m; i++) {
      for (let ch = 0; ch < 3; ch++) {
        let v = 0;
        for (let k = 0; k < ws.length; k++) v += ws[k] * tmp[((y0 + k) * m + i) * 3 + ch];
        out[(j * m + i) * 3 + ch] = Math.min(255, Math.max(0, Math.floor(v + 0.5)));
      }
    }
  }
  return out;
}
function canvas(w, h) {
  const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  return { canvas: cv, ctx: cv.getContext("2d", { willReadFrequently: true }) };
}

// The model file has three outputs: model A (houseplant photos), model B (+ PlantDoc's real-world photos) and their
// average, which the app uses (see ml/REPORT.md). The Lab shows all three.
// Returns { probs: {class: p}, sick, verdict, suggestions: [{ symptom, p }], variants: { A, B },
//           guard: { verdict: "ok" | "blurry" | "not_leaf" | "unfamiliar", looksLike, ... }, ms }
export async function diagnose(photo) {
  const { ort, session, info, check } = await load();
  const t0 = performance.now();
  const { tensor, px } = await toTensor(ort, photo);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const read = (name, classes) => (out[name] ? Object.fromEntries(classes.map((c, i) => [c, out[name].data[i]])) : null);
  const summary = (probs) => {
    const sick = 1 - probs.healthy;
    const suggestions = Object.entries(probs)
      .filter(([c, v]) => TO_SYMPTOM[c] && v >= 0.15)
      .sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([c, v]) => ({ symptom: TO_SYMPTOM[c], p: v }));
    return { probs, sick, verdict: sick >= 0.5 ? "off" : "healthy", suggestions };
  };
  const ms = Math.round(performance.now() - t0);
  const main = summary(read("probs", info.classes));
  const A = info.classes_a && out.probs_a ? { ...summary(read("probs_a", info.classes_a)), ms } : null;
  const B = out.probs_b ? { ...summary(read("probs_b", info.classes)), ms } : null;
  const guard = out.imagenet && out.embedding ? leafCheck(check, out.imagenet.data, out.embedding.data, sharpness(px)) : { verdict: "ok" };
  return { ...main, variants: { A, B }, guard, ms };
}

export const CREDITS = "Trained on the Aloe Vera Leaf Disease Detection Dataset (Khan et al.), the Cactus dataset (Benali & Jdey), " +
  "the Indoor Plant Disease Image Dataset (Mahmud Opu et al.) and PlantDoc (Singh et al.), all CC BY 4.0. Runs with ONNX Runtime Web (MIT).";
