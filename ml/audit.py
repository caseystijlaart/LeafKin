"""Data audit: duplicates, overlap between datasets, and shortcuts (labels given away by image size/format)."""
import collections, json, sys
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import cross_val_score
from common import load_index, hamming, DATA

rows = load_index()
by = collections.defaultdict(list)
for r in rows: by[(r["source"], r["kind"])].append(r)
out = {}

def near(a_rows, b_rows, tol):
    """For each row in a_rows, the closest dhash distance in b_rows."""
    B = np.array([r["dhash"] for r in b_rows], dtype=np.uint64)
    res = []
    for r in a_rows:
        x = np.bitwise_xor(B, np.uint64(r["dhash"]))
        d = np.unpackbits(x.view(np.uint8).reshape(-1, 8), axis=1).sum(1)
        res.append(int(d.min()))
    return np.array(res)

# 1. Duplicate originals within each source (same photo twice) — union-find on dhash distance <= 4
groups = {}
def find(i):
    while groups[i] != i: groups[i] = groups[groups[i]]; i = groups[i]
    return i
orig = [r for r in rows if r["kind"] == "orig"]
for r in orig: groups[r["id"]] = r["id"]
H = np.array([r["dhash"] for r in orig], dtype=np.uint64)
for i, r in enumerate(orig):
    x = np.bitwise_xor(H[i + 1:], np.uint64(r["dhash"]))
    d = np.unpackbits(x.view(np.uint8).reshape(-1, 8), axis=1).sum(1)
    for j in np.nonzero(d <= 4)[0]:
        a, b = find(r["id"]), find(orig[i + 1 + j]["id"])
        if a != b: groups[a] = b
dup = collections.Counter()
cross_label = 0
members = collections.defaultdict(list)
for r in orig: members[find(r["id"])].append(r)
for g, ms in members.items():
    if len(ms) > 1:
        for m in ms[1:]: dup[m["source"]] += 1
        if len({m["cls"] for m in ms}) > 1 or len({m["source"] for m in ms}) > 1: cross_label += 1
out["duplicate_originals_per_source"] = dict(dup)
out["duplicate_groups_spanning_classes_or_sources"] = cross_label
with open(f"{DATA}/groups.json", "w") as fh: json.dump({r["id"]: find(r["id"]) for r in orig}, fh)

# 2. Are the Roboflow money/snake/spider photos the same as the nursery originals?
d = near(by[("roboflow", "copy")], by[("nursery", "orig")], 0)
out["roboflow_vs_nursery_distance"] = {"<=6 (same photo)": int((d <= 6).sum()), "total": len(d), "median": float(np.median(d))}
# 3. Is the binary set made from any of the others?
others = by[("aloe", "orig")] + by[("cactus", "orig")] + by[("nursery", "orig")]
d = near(by[("binary", "orig")], others, 0)
out["binary_vs_others_distance"] = {"<=6": int((d <= 6).sum()), "total": len(d), "median": float(np.median(d))}

# 4. Shortcuts: can width/height/format alone predict the class within a source?
for src in ["aloe", "cactus", "nursery", "binary"]:
    rs = by[(src, "orig")]
    X = np.array([[r["w"], r["h"], r["w"] / max(r["h"], 1), hash(r["fmt"]) % 97] for r in rs], float)
    y = np.array([r["cls"] for r in rs])
    acc = cross_val_score(DecisionTreeClassifier(max_depth=4, random_state=0), X, y, cv=5).mean()
    chance = collections.Counter(y).most_common(1)[0][1] / len(y)
    out[f"shortcut_{src}"] = {"accuracy_from_size_format_only": round(float(acc), 3), "chance": round(chance, 3),
                              "sizes": collections.Counter(f'{r["cls"]}:{r["w"]}x{r["h"]}:{r["fmt"]}' for r in rs).most_common(6)}
print(json.dumps(out, indent=1))
