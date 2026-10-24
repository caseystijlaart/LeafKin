"""Model B variants: (1) weight each source equally, (2) pick the 'sick' cut-off on validation data (never on the tests).
Prints the same tests as compare_plantdoc.py for each variant."""
import json, numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from compare_plantdoc import F, R, G, house, pd_train, pd_test, pack, pack_groups, rows, symptom, SYMPTOMS, with_all_classes, C

def fit(ids, source_weights):
    y = [symptom(R[i]["cls"]) for i in ids]
    w = np.ones(len(ids))
    if source_weights:   # each source (houseplant sets vs PlantDoc) counts the same in total, classes balanced within
        src = np.array(["pd" if R[i]["source"] == "plantdoc" else "house" for i in ids])
        for s in set(src):
            m = src == s; ys = np.array(y)[m]
            for c in set(ys): w[np.nonzero(m)[0][ys == c]] = 1.0 / (len(set(ys)) * (ys == c).sum())
        w *= len(ids) / w.sum()
        return LogisticRegression(C=C, max_iter=3000).fit(np.stack([F[i] for i in ids]), y, sample_weight=w)
    return LogisticRegression(C=C, max_iter=3000, class_weight="balanced").fit(np.stack([F[i] for i in ids]), y)

def sick_p(m, ids):
    P = with_all_classes(m.predict_proba(np.stack([F[i] for i in ids])), list(m.classes_))
    return 1 - P[:, SYMPTOMS.index("healthy")], P

def choose_threshold(ids, sw):
    """Out-of-fold sick scores on the training data → cut-off with the best balanced accuracy, averaged over sources."""
    orig = [i for i in ids if R[i]["kind"] == "orig"]
    y = np.array([symptom(R[i]["cls"]) != "healthy" for i in orig]); s = np.zeros(len(orig))
    for tr, te in StratifiedGroupKFold(5, shuffle=True, random_state=1).split(orig, y, [G[i] for i in orig]):
        te_groups = {G[orig[k]] for k in te}
        m = fit([i for i in ids if G[i] not in te_groups], sw)
        s[te] = sick_p(m, [orig[k] for k in te])[0]
    src = np.array([R[i]["source"] == "plantdoc" for i in orig])
    best = None
    for t in np.arange(0.3, 0.96, 0.025):
        b = np.mean([1 - (np.mean(s[(~y) & g] >= t) + np.mean(s[y & g] < t)) / 2 for g in [src, ~src]])
        if best is None or b > best[1]: best = (float(t), float(b))
    return best[0]

def report(tag, m, t):
    out = {}
    def one(name, ids, labels):
        s, P = sick_p(m, ids); y = np.array([l != "healthy" for l in labels]); pred = s >= t
        fa, mi = float(pred[~y].mean()), float((~pred[y]).mean())
        out[name] = dict(auc=float(roc_auc_score(y, s)), balanced=1 - (fa + mi) / 2, false_alarm=fa, miss=mi)
        return P
    P = one("T1_lab", [x["id"] for x in pack], [x["label"] for x in pack])
    known = [k for k, x in enumerate(pack) if x["species"] != "other"]
    out["T1_lab"]["known_symptom_top1"] = float(np.mean([SYMPTOMS[P[k].argmax()] == pack[k]["label"] for k in known]))
    P = one("T2_plantdoc_test", pd_test, [symptom(R[i]["cls"]) for i in pd_test])
    sk = [k for k, i in enumerate(pd_test) if symptom(R[i]["cls"]) != "healthy"]
    out["T2_plantdoc_test"]["symptom_top1_sick"] = float(np.mean([SYMPTOMS[P[k].argmax()] == symptom(R[pd_test[k]]["cls"]) for k in sk]))
    other = [r["id"] for r in rows if r["source"] == "binary"]
    one("T3_other_plants", other, ["healthy" if R[i]["cls"] == "healthy" else "sick" for i in other])
    print(f"--- {tag} (cut-off {t:.3f})")
    for k, v in out.items(): print(f"  {k:18}", {a: round(b, 2) for a, b in v.items()})
    return dict(threshold=t, **out)

not_pack = lambda ids: [i for i in ids if G.get(i) not in pack_groups]
results = {}
for tag, extra, sw in [("A (no PlantDoc)", [], False), ("B", pd_train, False), ("B + equal source weights", pd_train, True)]:
    ids = not_pack(house) + not_pack(extra)
    m = fit(ids, sw)
    results[tag + " @0.5"] = report(tag + ", cut-off 0.5", m, 0.5)
    t = choose_threshold(ids, sw)
    results[tag + " @tuned"] = report(tag + ", cut-off tuned on training folds", m, t)
json.dump(results, open("/tmp/claude-0/ml/data/tune_plantdoc.json", "w"), indent=1)
