"""Experiments E1–E4 from PLAN.md. Usage: python3 experiments.py  →  prints a summary, writes $DATA/results.json"""
import collections, json, os, re, sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from common import load_index, symptom, SYMPTOMS, DATA

BACKBONES = ["mobilenetv2", "efficientnet", "resnet50"]
TRAIN_SOURCES = ["aloe", "cactus", "nursery"]
SPECIES = ["Aloe", "Cactus", "Money", "Snake", "Spider"]
rows = load_index()
R = {r["id"]: r for r in rows}

def feats(name):
    z = np.load(f"{DATA}/feat_{name}.npz")
    X = z["X"] / np.linalg.norm(z["X"], axis=1, keepdims=True)   # unit length: helps a linear classifier
    return dict(zip(z["ids"], X))

# ---------- duplicate groups: same photo (or a copy of it) must stay on one side of every split ----------
def build_groups(F, thr=0.93):
    orig = [r for r in rows if r["kind"] == "orig" and r["source"] in TRAIN_SOURCES]
    ids = [r["id"] for r in orig]; X = np.stack([F[i] for i in ids])
    parent = list(range(len(ids)))
    def find(i):
        while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
        return i
    S = X @ X.T
    for i in range(len(ids)):
        for j in np.nonzero(S[i, i + 1:] >= thr)[0]:
            a, b = find(i), find(i + 1 + j)
            if a != b: parent[a] = b
    group = {ids[i]: ids[find(i)] for i in range(len(ids))}
    # Provided augmented copies join their original's group: nursery by file name, aloe by most similar original.
    by_name = {re.sub(r"\.\w+$", "", os.path.basename(R[i]["path"])): i for i in ids if R[i]["source"] == "nursery"}
    aloe_ids = [i for i in ids if R[i]["source"] == "aloe"]; A = np.stack([F[i] for i in aloe_ids])
    for r in rows:
        if r["kind"] != "aug": continue
        if r["source"] == "nursery":
            base = re.sub(r"_aug\d+$", "", re.sub(r"\.\w+$", "", os.path.basename(r["path"])))
            if base in by_name: group[r["id"]] = group[by_name[base]]
        elif r["source"] == "aloe":
            group[r["id"]] = group[aloe_ids[int(np.argmax(A @ F[r["id"]]))]]
    return group

def clf(C=1.0):
    return LogisticRegression(C=C, max_iter=3000, class_weight="balanced")

def scores(y_true, P, classes):
    """y_true: symptom names; P: probabilities over `classes` (symptom names)."""
    classes = list(classes); order = np.argsort(-P, axis=1)
    pred = np.array([classes[o[0]] for o in order])
    top2 = np.mean([t in (classes[o[0]], classes[o[1]] if len(o) > 1 else None) for t, o in zip(y_true, order)])
    present = sorted(set(y_true))
    sick_true = np.array([t != "healthy" for t in y_true]); sick_pred = pred != "healthy"
    hi = classes.index("healthy")
    out = dict(n=len(y_true), macro_f1=f1_score(y_true, pred, labels=present, average="macro", zero_division=0),
               top1=float(np.mean(pred == np.array(y_true))), top2=float(top2),
               false_alarm=float(np.mean(sick_pred[~sick_true])) if (~sick_true).any() else None,
               miss=float(np.mean(~sick_pred[sick_true])) if sick_true.any() else None)
    if sick_true.any() and (~sick_true).any():
        out["sick_auc"] = float(roc_auc_score(sick_true, 1 - P[:, hi]))
        out["sick_balanced_acc"] = float((np.mean(sick_pred[sick_true]) + np.mean(~sick_pred[~sick_true])) / 2)
    out["per_class_f1"] = dict(zip(present, map(float, f1_score(y_true, pred, labels=present, average=None, zero_division=0))))
    return out

def fine_label(r):  # E2: the 16 species-disease classes
    return r["cls"]

def train_predict(F, train_ids, test_ids, label="symptom", C=1.0):
    ytr = [symptom(R[i]["cls"]) if label == "symptom" else fine_label(R[i]) for i in train_ids]
    m = clf(C).fit(np.stack([F[i] for i in train_ids]), ytr)
    P = m.predict_proba(np.stack([F[i] for i in test_ids]))
    if label == "symptom":
        return P, list(m.classes_)
    # collapse fine classes to symptoms by summing their probabilities
    P2 = np.zeros((len(test_ids), len(SYMPTOMS)))
    for k, c in enumerate(m.classes_): P2[:, SYMPTOMS.index(symptom(c))] += P[:, k]
    return P2, SYMPTOMS

def with_all_classes(P, classes):
    """Probabilities over the full SYMPTOMS list (0 for symptoms the model never saw)."""
    out = np.zeros((len(P), len(SYMPTOMS)))
    for k, c in enumerate(classes): out[:, SYMPTOMS.index(c)] = P[:, k]
    return out

def mean_scores(parts):
    keys = [k for k in parts[0] if isinstance(parts[0][k], float)]
    out = {k: float(np.mean([p[k] for p in parts if p.get(k) is not None])) for k in keys}
    out["n"] = sum(p["n"] for p in parts)
    return out

def run(name, group, use_aug=False, label="symptom", C=1.0):
    F = feats(name)
    base = [r["id"] for r in rows if r["kind"] == "orig" and r["source"] in TRAIN_SOURCES]
    augs = [r["id"] for r in rows if r["kind"] == "aug" and r["id"] in group]
    res = {}
    # E3a: held-out photos of the same five species, 5 folds, duplicates kept together
    y = [symptom(R[i]["cls"]) + "|" + R[i]["species"] for i in base]
    folds = []
    for tr, te in StratifiedGroupKFold(5, shuffle=True, random_state=0).split(base, y, [group[i] for i in base]):
        tr_ids = [base[k] for k in tr]; te_ids = [base[k] for k in te]
        if use_aug:
            test_groups = {group[i] for i in te_ids}
            tr_ids += [a for a in augs if group[a] not in test_groups]
        P, cl = train_predict(F, tr_ids, te_ids, label, C)
        folds.append(scores([symptom(R[i]["cls"]) for i in te_ids], with_all_classes(P, cl) if label == "symptom" else P, SYMPTOMS))
    res["E3a_same_species"] = mean_scores(folds)
    # E3b: leave one species out
    res["E3b_unseen_species"] = {}
    for sp in SPECIES:
        tr_ids = [i for i in base if R[i]["species"] != sp] + ([a for a in augs if R[a]["species"] != sp] if use_aug else [])
        te_ids = [i for i in base if R[i]["species"] == sp]
        P, cl = train_predict(F, tr_ids, te_ids, label, C)
        res["E3b_unseen_species"][sp] = scores([symptom(R[i]["cls"]) for i in te_ids], with_all_classes(P, cl) if label == "symptom" else P, SYMPTOMS)
        res["E3b_unseen_species"][sp]["symptoms_unknown_to_model"] = sorted({symptom(R[i]["cls"]) for i in te_ids} - set(symptom(R[i]["cls"]) for i in tr_ids))
    res["E3b_mean"] = mean_scores(list(res["E3b_unseen_species"].values()))
    # E3c: other source, other plants (tomato, grape, potato… in the 'indoor plant leaf health' set): healthy vs sick
    tr_ids = base + (augs if use_aug else [])
    te = [r for r in rows if r["source"] == "binary"]
    P, cl = train_predict(F, tr_ids, [r["id"] for r in te], label, C)
    P = with_all_classes(P, cl) if label == "symptom" else P
    yb = ["healthy" if r["cls"] == "healthy" else "sick" for r in te]
    sick_p = 1 - P[:, SYMPTOMS.index("healthy")]
    sick_true = np.array([v == "sick" for v in yb]); sick_pred = sick_p >= 0.5
    res["E3c_other_plants"] = dict(n=len(te), sick_auc=float(roc_auc_score(sick_true, sick_p)),
        sick_balanced_acc=float((np.mean(sick_pred[sick_true]) + np.mean(~sick_pred[~sick_true])) / 2),
        false_alarm=float(np.mean(sick_pred[~sick_true])), miss=float(np.mean(~sick_pred[sick_true])),
        predicted_symptoms_for_sick=dict(collections.Counter(SYMPTOMS[k] for k in P[sick_true].argmax(1)).most_common()))
    return res

def shortcut_colour():
    """E3d: can simple colour statistics (camera/lighting, not the disease) tell the classes apart within a source?"""
    from PIL import Image
    from sklearn.model_selection import cross_val_score
    out = {}
    for src in ["aloe", "cactus", "nursery"]:
        rs = [r for r in rows if r["source"] == src and r["kind"] == "orig"]
        X = []
        for r in rs:
            a = np.asarray(Image.open(f"{DATA}/img/{r['id']}.jpg").convert("RGB"), np.float32) / 255
            X.append(np.concatenate([a.mean((0, 1)), a.std((0, 1))]))
        y = [symptom(r["cls"]) for r in rs]
        acc = cross_val_score(LogisticRegression(max_iter=2000, class_weight="balanced"), np.array(X), y, cv=5, scoring="balanced_accuracy").mean()
        out[src] = dict(balanced_acc_from_colour_only=float(acc), chance=1 / len(set(y)))
    return out

if __name__ == "__main__":
    results = {}
    G = build_groups(feats("mobilenetv2"))
    base = [r for r in rows if r["kind"] == "orig" and r["source"] in TRAIN_SOURCES]
    sizes = collections.Counter(collections.Counter(G[r["id"]] for r in base).values())
    results["duplicate_groups"] = {"photos": len(base), "groups": len({G[r['id']] for r in base}),
                                   "photos_in_groups_of_2plus": sum(k * v for k, v in sizes.items() if k > 1)}
    print("groups", results["duplicate_groups"], flush=True)
    results["E3d_shortcut_colour"] = shortcut_colour(); print("E3d", results["E3d_shortcut_colour"], flush=True)
    for b in [x for x in BACKBONES if os.path.exists(f"{DATA}/feat_{x}.npz")]:
        for C in [0.3, 1, 3]:   # small choice of regularisation, picked on E3a only
            results[f"{b}|C={C}"] = run(b, G, C=C)
            print(b, C, {k: round(v["macro_f1"], 3) for k, v in results[f"{b}|C={C}"].items() if k in ("E3a_same_species", "E3b_mean")}, flush=True)
    best_C = {b: max([0.3, 1, 3], key=lambda C: results[f"{b}|C={C}"]["E3a_same_species"]["macro_f1"]) for b in BACKBONES if f"{b}|C=1" in results}
    results["best_C"] = best_C
    for b, C in best_C.items():
        results[f"E1|{b}"] = results[f"{b}|C={C}"]
        results[f"E2_fine_labels|{b}"] = run(b, G, label="fine", C=C)
        results[f"E4_with_provided_aug|{b}"] = run(b, G, use_aug=True, C=C)
        print("done", b, flush=True)
    json.dump(results, open(f"{DATA}/results.json", "w"), indent=1)
    print("saved")
