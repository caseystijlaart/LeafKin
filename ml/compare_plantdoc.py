"""Model A (aloe, cactus, nursery: the current model) vs model B (A's data + PlantDoc's training photos).
Same network (MobileNetV2), classifier (logistic regression, C=30) and the provided augmented copies for both.
Tests, identical for A and B:
  T1 the Lab's 160 test photos (houseplants + other plants), never trained on
  T2 PlantDoc's own test split: real-world photos (crops, garden plants)
  T3 the other-plants set (tomato, grape, potato… on plain backgrounds; overlaps PlantDoc's species, so B has seen those plants)
  T4 leave one houseplant species out: how well each model handles a houseplant it has never seen
Usage: python3 compare_plantdoc.py → prints a table, writes $DATA/compare_plantdoc.json"""
import json, collections
import numpy as np
from sklearn.metrics import roc_auc_score, f1_score
from common import load_index, symptom, SYMPTOMS, DATA, PLANTDOC_SKIP
from experiments import feats, build_groups, clf, with_all_classes

C = 30
rows = [r for r in load_index() if r["cls"] not in PLANTDOC_SKIP]
R = {r["id"]: r for r in rows}
F = feats("mobilenetv2")
HOUSE = ["aloe", "cactus", "nursery"]
G = build_groups(F, sources=HOUSE + ["plantdoc"])
pack = json.load(open(f"{DATA}/testpack.json"))
pack_groups = {G[x["id"]] for x in pack if x["id"] in G}

house = [r["id"] for r in rows if r["source"] in HOUSE and (r["kind"] == "orig" or (r["kind"] == "aug" and r["id"] in G))]
pd_test = [r["id"] for r in rows if r["source"] == "plantdoc" and r["split"] == "test"]
pd_test_groups = {G[i] for i in pd_test}
# PlantDoc has near-duplicates across its own train/test split: those stay out of training.
pd_train = [r["id"] for r in rows if r["source"] == "plantdoc" and r["split"] == "train" and G[r["id"]] not in pd_test_groups]
print("PlantDoc train", len(pd_train), "(dropped as duplicates of test photos:",
      sum(1 for r in rows if r["source"] == "plantdoc" and r["split"] == "train") - len(pd_train), ") test", len(pd_test))

def fit(ids):
    return clf(C).fit(np.stack([F[i] for i in ids]), [symptom(R[i]["cls"]) for i in ids])

def probs(m, ids):
    return with_all_classes(m.predict_proba(np.stack([F[i] for i in ids])), list(m.classes_))

def score(P, labels, symptoms=None):
    """labels: 'healthy'/'sick' or symptom names; symptoms: true symptom per photo (for the symptom score)."""
    y = np.array([l != "healthy" for l in labels]); sick = 1 - P[:, SYMPTOMS.index("healthy")]; pred = sick >= 0.5
    out = dict(n=len(labels), auc=float(roc_auc_score(y, sick)) if y.any() and (~y).any() else None,
               false_alarm=float(pred[~y].mean()) if (~y).any() else None, miss=float((~pred[y]).mean()) if y.any() else None)
    if out["false_alarm"] is not None and out["miss"] is not None: out["balanced"] = 1 - (out["false_alarm"] + out["miss"]) / 2
    if symptoms is not None:
        top = np.array([SYMPTOMS[k] for k in P.argmax(1)])
        sk = [i for i, s in enumerate(symptoms) if s != "healthy"]
        out["symptom_top1_sick"] = float(np.mean([top[i] == symptoms[i] for i in sk])) if sk else None
        out["symptom_f1"] = float(f1_score(symptoms, top, labels=sorted(set(symptoms)), average="macro", zero_division=0))
    return out

res = {}
# T1: the Lab photos; both models retrained without those leaves
not_pack = lambda ids: [i for i in ids if G.get(i) not in pack_groups]
A1, B1 = fit(not_pack(house)), fit(not_pack(house) + not_pack(pd_train))
pid = [x["id"] for x in pack]
lab_labels = [x["label"] if x["label"] in SYMPTOMS else "sick" for x in pack]
known = [i for i, x in enumerate(pack) if x["species"] != "other"]
for name, m in [("A", A1), ("B", B1)]:
    P = probs(m, pid)
    r = score(P, [x["label"] if x["label"] != "sick" else "sick" for x in pack])
    r["known_symptom_top1"] = float(np.mean([SYMPTOMS[P[i].argmax()] == pack[i]["label"] for i in known]))
    res[f"T1_lab|{name}"] = r
# T2 + T3: trained on everything that isn't a test photo
A, B = fit(house), fit(house + pd_train)
for name, m in [("A", A), ("B", B)]:
    res[f"T2_plantdoc_test|{name}"] = score(probs(m, pd_test), [symptom(R[i]["cls"]) for i in pd_test], [symptom(R[i]["cls"]) for i in pd_test])
    other = [r["id"] for r in rows if r["source"] == "binary"]
    res[f"T3_other_plants|{name}"] = score(probs(m, other), ["healthy" if R[i]["cls"] == "healthy" else "sick" for i in other])
# T4: leave one houseplant species out
for name, extra in [("A", []), ("B", pd_train)]:
    per = {}
    for sp in ["Aloe", "Cactus", "Money", "Snake", "Spider"]:
        tr = [i for i in house if R[i]["species"] != sp] + extra
        te = [i for i in house if R[i]["species"] == sp and R[i]["kind"] == "orig"]
        per[sp] = score(probs(fit(tr), te), [symptom(R[i]["cls"]) for i in te], [symptom(R[i]["cls"]) for i in te])
    res[f"T4_unseen_houseplant|{name}"] = dict(per_species=per, **{k: float(np.mean([p[k] for p in per.values() if p.get(k) is not None]))
                                                for k in ["auc", "balanced", "false_alarm", "miss", "symptom_f1", "symptom_top1_sick"]})
json.dump(res, open(f"{DATA}/compare_plantdoc.json", "w"), indent=1)
f = lambda v: "–" if v is None else f"{v:.2f}"
for t in ["T1_lab", "T2_plantdoc_test", "T3_other_plants", "T4_unseen_houseplant"]:
    for n in "AB":
        r = res[f"{t}|{n}"]
        print(f"{t:22} {n}  AUC {f(r.get('auc'))}  balanced {f(r.get('balanced'))}  false alarms {f(r.get('false_alarm'))}  misses {f(r.get('miss'))}"
              f"  symptom top1 {f(r.get('symptom_top1_sick', r.get('known_symptom_top1')))}  symptom F1 {f(r.get('symptom_f1'))}")
for n in "AB":
    print("T4", n, {sp: f(v["auc"]) for sp, v in res[f"T4_unseen_houseplant|{n}"]["per_species"].items()})
