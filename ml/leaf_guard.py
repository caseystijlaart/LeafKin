"""Leaf check (runs before the photo health check): is this a usable close-up of a leaf?
Three signals, all from the MobileNetV2 the app already downloads:
  1. ImageNet guess: the network's original 1,000-class head. A confident guess like "tabby cat" or "car" → not a leaf.
  2. Familiarity: cosine similarity of the photo's features to 128 prototypes (k-means) of the training leaves.
     Far from every prototype → doesn't look like any leaf photo the model knows.
  3. Sharpness: variance of the Laplacian on the 224×224 grey image. Very low → too blurry.
Thresholds are set so that only ~2% of held-out leaf photos (never trained on) are turned away.
Usage: python3 leaf_guard.py  →  $DATA/leaf_guard.json (thresholds, allowed ImageNet classes, scores), prototypes .bin"""
import json, os
import numpy as np, onnx, onnxruntime as ort
from onnx import numpy_helper
from PIL import Image, ImageFilter
from sklearn.cluster import KMeans
from common import load_index, DATA, PLANTDOC_SKIP
from features import preprocess, MODELS
from experiments import build_groups, feats

rows = [r for r in load_index() if r["cls"] not in PLANTDOC_SKIP]
R = {r["id"]: r for r in rows}
z = np.load(f"{DATA}/feat_mobilenetv2.npz"); RAW = dict(zip(z["ids"], z["X"]))
F = feats("mobilenetv2")

# ImageNet head of the original network (Gemm on the pooled features)
m = onnx.load(os.path.join(MODELS, "mobilenetv2-12.onnx")); init = {t.name: numpy_helper.to_array(t) for t in m.graph.initializer}
gemm = [n for n in m.graph.node if n.op_type == "Gemm"][-1]
W, b = init[gemm.input[1]], init[gemm.input[2]]
transB = next((a.i for a in gemm.attribute if a.name == "transB"), 0)
def imagenet(raw):
    z = raw @ (W.T if transB else W) + b
    z = z - z.max(1, keepdims=True); e = np.exp(z); return e / e.sum(1, keepdims=True)
LEMMA = [l.strip().split("\t")[1] if "\t" in l else l.strip() for l in open("/tmp/claude-0/timm_pkg/timm/data/_info/imagenet_synset_to_lemma.txt")]
SYN = [l.strip() for l in open("/tmp/claude-0/timm_pkg/timm/data/_info/imagenet_synsets.txt")]
lemma_of = dict(l.split("\t", 1) for l in open("/tmp/claude-0/timm_pkg/timm/data/_info/imagenet_synset_to_lemma.txt").read().splitlines())
NAMES = [lemma_of[s].split(",")[0] for s in SYN]

# Plant-like ImageNet classes never count against a photo: insects/butterflies (pests on leaves), vegetables, fruit,
# flowers, fungi, pots, vases, greenhouse.
PLANTISH = set(range(300, 327)) | set(range(936, 958)) | set(range(984, 999)) | {738, 883, 580}

# Training leaves (for prototypes) vs held-out leaves (for thresholds): the Lab photos, PlantDoc test, other-plants set
G = build_groups(F, sources=["aloe", "cactus", "nursery", "plantdoc"])
pack = json.load(open(f"{DATA}/testpack.json"))
pack_groups = {G[x["id"]] for x in pack if x["id"] in G}
train = [r["id"] for r in rows if r["kind"] == "orig" and r["source"] in ("aloe", "cactus", "nursery", "plantdoc")
         and r["split"] != "test" and G.get(r["id"]) not in pack_groups]
held = [x["id"] for x in pack] + [r["id"] for r in rows if r["source"] == "plantdoc" and r["split"] == "test"] + \
       [r["id"] for r in rows if r["source"] == "binary"]
held = list(dict.fromkeys(held))

# Classes the network often (wrongly) gives our training leaves also count as plant-like: e.g. an aloe on black → "cucumber".
P_train = imagenet(np.stack([RAW[i] for i in train]))
top = P_train.argmax(1)
common = {int(c) for c, n in zip(*np.unique(top, return_counts=True)) if n >= 5}
ALLOWED = PLANTISH | common

km = KMeans(128, n_init=3, random_state=0).fit(np.stack([F[i] for i in train]))
PROTO = km.cluster_centers_ / np.linalg.norm(km.cluster_centers_, axis=1, keepdims=True)

def gray_sharpness(img):
    x = np.asarray(img.convert("L"), np.float32)
    lap = x[1:-1, :-2] + x[1:-1, 2:] + x[:-2, 1:-1] + x[2:, 1:-1] - 4 * x[1:-1, 1:-1]
    return float(lap.var())

def box224(img):
    w, h = img.size; s = min(w, h); l, t = (w - s) // 2, (h - s) // 2
    return img.crop((l, t, l + s, t + s)).resize((224, 224), Image.BOX)

def signals(ids=None, images=None, sess=None):
    """Return (imagenet top prob, top class, familiarity, sharpness) for dataset ids or PIL images."""
    if ids is not None:
        raw = np.stack([RAW[i] for i in ids]); unit = np.stack([F[i] for i in ids])
        sharp = [gray_sharpness(box224(Image.open(f"{DATA}/img/{i}.jpg").convert("RGB"))) for i in ids]
    else:
        x = np.stack([preprocess(im, "mobilenetv2") for im in images])
        raw = sess.run(["472"], {"input": x})[0].reshape(len(images), -1)
        unit = raw / np.linalg.norm(raw, axis=1, keepdims=True)
        sharp = [gray_sharpness(box224(im)) for im in images]
    P = imagenet(raw)
    return P.max(1), P.argmax(1), (unit @ PROTO.T).max(1), np.array(sharp)

hp, hc, hf, hs = signals(held)
lab_mask = np.isin(held, [x["id"] for x in pack])

# Non-leaf test images (scikit-image's sample pictures + 200 faces) and blurred / plain versions of held-out leaves
import skimage.data as sd
from features import feature_model
sess = ort.InferenceSession(feature_model("mobilenetv2").SerializeToString(), providers=["CPUExecutionProvider"])
neg = {}
for n in ["astronaut", "camera", "cat", "chelsea", "coffee", "coins", "horse", "moon", "page", "rocket", "text", "clock",
          "brick", "gravel", "colorwheel", "logo", "checkerboard", "hubble_deep_field", "stereo_motorcycle", "eagle"]:
    try:
        a = getattr(sd, n)()
        if isinstance(a, tuple): a = a[0]
        a = np.asarray(a)
        if a.dtype != np.uint8: a = (255 * (a - a.min()) / max(np.ptp(a), 1e-9)).astype(np.uint8)
        if a.ndim == 2: a = np.stack([a] * 3, -1)
        neg[n] = Image.fromarray(a[..., :3])
    except Exception as e:
        print("skip", n, e)
faces = sd.lfw_subset()
for k, f_ in enumerate(faces[:200]):
    neg[f"face{k}"] = Image.fromarray((np.stack([f_] * 3, -1) * 255).astype(np.uint8)).resize((100, 100))
rng = np.random.default_rng(0)
for k in range(10): neg[f"noise{k}"] = Image.fromarray(rng.integers(0, 255, (224, 224, 3), dtype=np.uint8))
for k, col in enumerate([(240, 240, 240), (20, 20, 20), (120, 80, 60), (200, 30, 30)]): neg[f"plain{k}"] = Image.new("RGB", (224, 224), col)
names = list(neg)
np_, nc, nf, ns = signals(images=[neg[n] for n in names], sess=sess)

blur_ids = held[:120]
blurred = [box224(Image.open(f"{DATA}/img/{i}.jpg").convert("RGB")).filter(ImageFilter.GaussianBlur(6)) for i in blur_ids]
bp, bc, bf, bs = signals(images=blurred, sess=sess)


# Rule: "blurry" and "not a leaf" only count when the photo also looks unlike the training leaves (familiarity below
# LEAF_LIKE); a photo far from every training leaf is "unfamiliar". Grid search: catch as many non-leaf and blurred
# photos as possible while letting through >= 98% of held-out leaves and >= 98% of the Lab photos.
def rule(p, c, f, s, T):
    net_t, fam_t, sharp_t, leaf_like = T
    if s < sharp_t and f < leaf_like: return "blurry"
    if p >= net_t and c not in ALLOWED and f < leaf_like: return "not_leaf"
    if f < fam_t: return "unfamiliar"
    return "ok"
best = None
for fam_q in [0.005, 0.01, 0.015]:
    fam_t = float(np.quantile(hf, fam_q))
    for sharp_t in [float(np.quantile(hs, q)) for q in (0.005, 0.01, 0.02, 0.04)]:
        for net_t in [0.4, 0.5, 0.6, 0.7]:
            for leaf_like in [0.75, 0.8, 0.85, 0.9, 1.01]:
                T = (net_t, fam_t, sharp_t, leaf_like)
                hv = np.array([rule(*a, T) == "ok" for a in zip(hp, hc, hf, hs)])
                if hv.mean() < 0.98 or hv[lab_mask].mean() < 0.98: continue
                nv = np.mean([rule(*a, T) != "ok" for a in zip(np_, nc, nf, ns)])
                bv = np.mean([rule(*a, T) != "ok" for a in zip(bp, bc, bf, bs)])
                score = (nv + bv) / 2 + 0.1 * hv.mean()
                if best is None or score > best[0]: best = (score, T)
NET_T, FAM_T, SHARP_T, LEAF_LIKE = best[1]
def verdict(p, c, f, s): return rule(p, c, f, s, best[1])
held_v = [verdict(*a) for a in zip(hp, hc, hf, hs)]
neg_v = {n: verdict(*a) for n, a in zip(names, zip(np_, nc, nf, ns))}
blur_v = [verdict(*a) for a in zip(bp, bc, bf, bs)]

def share(vs, ok=False): return round(float(np.mean([(v == "ok") == ok for v in vs])), 3)
result = dict(
    thresholds=dict(imagenet_prob=NET_T, familiarity=FAM_T, sharpness=SHARP_T, leaf_like=LEAF_LIKE), allowed_imagenet=sorted(ALLOWED),
    lab_photos=dict(n=int(lab_mask.sum()), accepted=share([v for v, m in zip(held_v, lab_mask) if m], True)),
    held_out_leaves=dict(n=len(held), accepted=share(held_v, True), by_reason={k: held_v.count(k) for k in set(held_v)}),
    non_leaf_images=dict(n=len(names), rejected=share(neg_v.values()), by_reason={k: list(neg_v.values()).count(k) for k in set(neg_v.values())},
                         accepted=[n for n, v in neg_v.items() if v == "ok"],
                         examples={n: dict(verdict=neg_v[n], imagenet=NAMES[c], p=round(float(p), 2), familiarity=round(float(f), 3))
                                   for n, p, c, f in zip(names, np_, nc, nf) if not n.startswith(("face", "noise"))}),
    blurred_leaves=dict(n=len(blur_v), rejected=share(blur_v), by_reason={k: blur_v.count(k) for k in set(blur_v)}),
)
json.dump(result, open(f"{DATA}/leaf_guard.json", "w"), indent=1)
PROTO.astype(np.float32).tofile(f"{DATA}/leafkin-prototypes.bin")
json.dump(dict(names=NAMES, allowed=sorted(ALLOWED)), open(f"{DATA}/imagenet.json", "w"))
print(json.dumps({k: v for k, v in result.items() if k != "allowed_imagenet"}, indent=1))
