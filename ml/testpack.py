"""Pick the Lab's labelled test photos (never used for training) → $DATA/testpack.json.
8 leaves per species × symptom from the training sources (one photo per distinct leaf; the whole leaf group is
excluded from training) + 24 healthy and 24 sick leaves from the other-plants set. Ordered so any first N is balanced."""
import json, random, collections
from common import load_index, symptom, DATA
from experiments import build_groups, feats, TRAIN_SOURCES

rows = load_index(); G = build_groups(feats("mobilenetv2")); rnd = random.Random(11)
base = [r for r in rows if r["kind"] == "orig" and r["source"] in TRAIN_SOURCES]
groups = collections.defaultdict(list)
for r in base: groups[G[r["id"]]].append(r)
pure = {g: rs for g, rs in groups.items() if len({x["cls"] for x in rs}) == 1}   # skip leaves with conflicting labels
cells = collections.defaultdict(list)
for g, rs in pure.items(): cells[(rs[0]["species"], symptom(rs[0]["cls"]))].append(g)
buckets = []
for cell in sorted(cells):
    gs = sorted(cells[cell]); rnd.shuffle(gs)
    if cell[0] == "Aloe" and cell[1] == "spots":   # mix anthracnose, leaf spot and rust
        by = collections.defaultdict(list)
        for g in gs: by[groups[g][0]["cls"]].append(g)
        gs = [g for trio in zip(*by.values()) for g in trio]
    buckets.append([dict(id=groups[g][0]["id"], group=g, species=cell[0], label=cell[1], cls=groups[g][0]["cls"], source=groups[g][0]["source"]) for g in gs[:8]])
other = [r for r in rows if r["source"] == "binary"]
for lab in ["healthy", "unhealthy"]:
    xs = sorted([r for r in other if r["cls"] == lab], key=lambda r: r["id"]); rnd.shuffle(xs)
    buckets.append([dict(id=r["id"], group=None, species="other", label="healthy" if lab == "healthy" else "sick", cls=lab, source="binary") for r in xs[:24]])
order = []
while any(buckets):   # round-robin over cells → every prefix is balanced
    for b in buckets:
        if b: order.append(b.pop(0))
json.dump(order, open(f"{DATA}/testpack.json", "w"), indent=1)
print(len(order), collections.Counter((x["species"], x["label"]) for x in order))
