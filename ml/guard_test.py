"""Guard idea: a separate healthy-vs-sick classifier (same MobileNetV2 features, so no extra download) deciding
whether a leaf is sick, with the symptom models only used to name the symptom. Compared with A+B's own 'healthy'
probability on the same tests as compare_plantdoc.py."""
import json, numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from compare_plantdoc import F, R, G, house, pd_train, pd_test, pack, pack_groups, rows, symptom, SYMPTOMS, with_all_classes, fit

def guard(ids, equal_sources):
    y = np.array([symptom(R[i]["cls"]) != "healthy" for i in ids]); w = np.ones(len(ids))
    src = np.array([R[i]["source"] == "plantdoc" for i in ids])
    groups = [src, ~src] if equal_sources else [np.ones(len(ids), bool)]
    for g in groups:
        for v in (True, False):
            m = g & (y == v)
            if m.any(): w[m] = 1.0 / (len(groups) * 2 * m.sum())
    w *= len(ids) / w.sum()
    return LogisticRegression(C=30, max_iter=3000).fit(np.stack([F[i] for i in ids]), y, sample_weight=w)

def ab_sick(mA, mB, ids):
    X = np.stack([F[i] for i in ids])
    pa = with_all_classes(mA.predict_proba(X), list(mA.classes_)); pb = with_all_classes(mB.predict_proba(X), list(mB.classes_))
    return 1 - ((pa + pb) / 2)[:, SYMPTOMS.index("healthy")]

def score(s, y):
    p = s >= 0.5; fa, mi = float(p[~y].mean()), float((~p[y]).mean())
    return dict(auc=round(float(roc_auc_score(y, s)), 3), balanced=round(1 - (fa + mi) / 2, 3), false_alarm=round(fa, 3), miss=round(mi, 3))

out = {}
not_pack = lambda ids: [i for i in ids if G.get(i) not in pack_groups]
tests = {}
# T1 Lab photos (models trained without them)
trA, trB = not_pack(house), not_pack(house) + not_pack(pd_train)
mA, mB = fit(trA), fit(trB); g1, g2 = guard(trB, False), guard(trB, True)
ids = [x["id"] for x in pack]; y = np.array([x["label"] != "healthy" for x in pack])
X = np.stack([F[i] for i in ids])
out["T1_lab"] = {"A+B": score(ab_sick(mA, mB, ids), y), "guard": score(g1.predict_proba(X)[:, 1], y), "guard_equal_sources": score(g2.predict_proba(X)[:, 1], y)}
# T2, T3
mA, mB = fit(house), fit(house + pd_train); g1, g2 = guard(house + pd_train, False), guard(house + pd_train, True)
for t, ids in [("T2_plantdoc_test", pd_test), ("T3_other_plants", [r["id"] for r in rows if r["source"] == "binary"])]:
    y = np.array([(symptom(R[i]["cls"]) if R[i]["source"] != "binary" else R[i]["cls"]) not in ("healthy",) for i in ids])
    X = np.stack([F[i] for i in ids])
    out[t] = {"A+B": score(ab_sick(mA, mB, ids), y), "guard": score(g1.predict_proba(X)[:, 1], y), "guard_equal_sources": score(g2.predict_proba(X)[:, 1], y)}
# T4 unseen houseplant
acc = {k: [] for k in ["A+B", "guard", "guard_equal_sources"]}
for sp in ["Aloe", "Cactus", "Money", "Snake", "Spider"]:
    tr = [i for i in house if R[i]["species"] != sp]; te = [i for i in house if R[i]["species"] == sp and R[i]["kind"] == "orig"]
    y = np.array([symptom(R[i]["cls"]) != "healthy" for i in te]); X = np.stack([F[i] for i in te])
    acc["A+B"].append(score(ab_sick(fit(tr), fit(tr + pd_train), te), y))
    acc["guard"].append(score(guard(tr + pd_train, False).predict_proba(X)[:, 1], y))
    acc["guard_equal_sources"].append(score(guard(tr + pd_train, True).predict_proba(X)[:, 1], y))
out["T4_unseen_houseplant"] = {k: {m: round(float(np.mean([x[m] for x in v])), 3) for m in v[0]} for k, v in acc.items()}
json.dump(out, open("/tmp/claude-0/ml/data/guard_test.json", "w"), indent=1)
for t, v in out.items():
    for k, r in v.items(): print(f"{t:22} {k:20}", r)
