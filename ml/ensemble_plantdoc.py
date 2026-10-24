"""Combine A (no PlantDoc) and B (with PlantDoc): same MobileNetV2 features, two small classifiers, probabilities
averaged. Compared with A and B alone on the same tests (T1–T4 as in compare_plantdoc.py)."""
import json, numpy as np
from sklearn.metrics import roc_auc_score
from compare_plantdoc import F, R, G, house, pd_train, pd_test, pack, pack_groups, rows, symptom, SYMPTOMS, with_all_classes, fit

def P(m, ids): return with_all_classes(m.predict_proba(np.stack([F[i] for i in ids])), list(m.classes_))
def combos(mA, mB, ids):
    pa, pb = P(mA, ids), P(mB, ids)
    return {"A": pa, "B": pb, "A+B": (pa + pb) / 2}
def evaluate(Ps, labels, true_sym=None):
    out = {}
    y = np.array([l != "healthy" for l in labels])
    for k, p in Ps.items():
        s = 1 - p[:, SYMPTOMS.index("healthy")]; pred = s >= 0.5
        fa, mi = float(pred[~y].mean()), float((~pred[y]).mean())
        r = dict(auc=float(roc_auc_score(y, s)), balanced=1 - (fa + mi) / 2, false_alarm=fa, miss=mi)
        if true_sym is not None:
            sk = [i for i, t in enumerate(true_sym) if t != "healthy"]
            r["symptom_top1"] = float(np.mean([SYMPTOMS[p[i].argmax()] == true_sym[i] for i in sk]))
        out[k] = r
    return out

not_pack = lambda ids: [i for i in ids if G.get(i) not in pack_groups]
res = {}
mA, mB = fit(not_pack(house)), fit(not_pack(house) + not_pack(pd_train))
pid = [x["id"] for x in pack]; known = [k for k, x in enumerate(pack) if x["species"] != "other"]
res["T1_lab"] = evaluate(combos(mA, mB, pid), [x["label"] for x in pack], [x["label"] if x["species"] != "other" else "healthy" for x in pack])
mA, mB = fit(house), fit(house + pd_train)
res["T2_plantdoc_test"] = evaluate(combos(mA, mB, pd_test), [symptom(R[i]["cls"]) for i in pd_test], [symptom(R[i]["cls"]) for i in pd_test])
other = [r["id"] for r in rows if r["source"] == "binary"]
res["T3_other_plants"] = evaluate(combos(mA, mB, other), ["healthy" if R[i]["cls"] == "healthy" else "sick" for i in other])
t4 = {k: [] for k in ["A", "B", "A+B"]}
for sp in ["Aloe", "Cactus", "Money", "Snake", "Spider"]:
    tr = [i for i in house if R[i]["species"] != sp]; te = [i for i in house if R[i]["species"] == sp and R[i]["kind"] == "orig"]
    e = evaluate(combos(fit(tr), fit(tr + pd_train), te), [symptom(R[i]["cls"]) for i in te], [symptom(R[i]["cls"]) for i in te])
    for k in t4: t4[k].append(e[k])
res["T4_unseen_houseplant"] = {k: {m: float(np.mean([x[m] for x in v])) for m in v[0]} for k, v in t4.items()}
json.dump(res, open("/tmp/claude-0/ml/data/ensemble_plantdoc.json", "w"), indent=1)
for t, v in res.items():
    for k, r in v.items(): print(f"{t:22} {k:4}", {a: round(b, 2) for a, b in r.items()})
