"""Train the final classifier and export one ONNX file for the browser: pretrained network + unit-length
normalisation + linear layer + softmax. Input: 1×3×224×224 (or NHWC for EfficientNet), preprocessed as in features.py.
Usage: python3 export.py <backbone> <C> [aug]  →  $DATA/leafkin-symptoms.onnx, leafkin-symptoms.json"""
import json, sys, time
import numpy as np, onnx, onnxruntime as ort
from onnx import helper, numpy_helper, TensorProto
from sklearn.linear_model import LogisticRegression
from PIL import Image
from common import load_index, symptom, DATA
from features import feature_model, preprocess, BACKBONES
from experiments import build_groups, feats, TRAIN_SOURCES

name, C, use_aug = sys.argv[1], float(sys.argv[2]), "aug" in sys.argv[3:]
rows = load_index(); F = feats(name)
G = build_groups(feats("mobilenetv2"))
ids = [r["id"] for r in rows if r["source"] in TRAIN_SOURCES and (r["kind"] == "orig" or (use_aug and r["kind"] == "aug" and r["id"] in G))]
R = {r["id"]: r for r in rows}
y = [symptom(R[i]["cls"]) for i in ids]
m = LogisticRegression(C=C, max_iter=3000, class_weight="balanced").fit(np.stack([F[i] for i in ids]), y)
classes = list(m.classes_)

g = feature_model(name)
feat = BACKBONES[name][2]
graph = g.graph
del graph.output[:]
W = numpy_helper.from_array(m.coef_.T.astype(np.float32), "lk_W")
b = numpy_helper.from_array(m.intercept_.astype(np.float32), "lk_b")
eps = numpy_helper.from_array(np.array([1e-12], np.float32), "lk_eps")
graph.initializer.extend([W, b, eps])
shape = numpy_helper.from_array(np.array([0, -1], np.int64), "lk_shape")
graph.initializer.append(shape)
graph.node.extend([
    helper.make_node("Reshape", [feat, "lk_shape"], ["lk_flat"]),
    helper.make_node("ReduceL2", ["lk_flat"], ["lk_norm"], axes=[1], keepdims=1),
    helper.make_node("Add", ["lk_norm", "lk_eps"], ["lk_norm2"]),
    helper.make_node("Div", ["lk_flat", "lk_norm2"], ["lk_unit"]),
    helper.make_node("MatMul", ["lk_unit", "lk_W"], ["lk_logits0"]),
    helper.make_node("Add", ["lk_logits0", "lk_b"], ["lk_logits"]),
    helper.make_node("Softmax", ["lk_logits"], ["probs"], axis=1),
])
graph.output.extend([helper.make_tensor_value_info("probs", TensorProto.FLOAT, ["N", len(classes)])])
onnx.checker.check_model(g)
path = f"{DATA}/leafkin-symptoms.onnx"
onnx.save(g, path)

# Check: the exported file gives the same answers as the Python classifier
sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
test = [r for r in rows if r["source"] == "nursery" and r["kind"] == "orig"][:16]
x = np.stack([preprocess(Image.open(f"{DATA}/img/{r['id']}.jpg").convert("RGB"), name) for r in test])
p_onnx = sess.run(["probs"], {sess.get_inputs()[0].name: x})[0]
p_py = m.predict_proba(np.stack([F[r["id"]] for r in test]))
t = time.time(); [sess.run(["probs"], {sess.get_inputs()[0].name: x[:1]}) for _ in range(20)]
info = dict(backbone=name, C=C, trained_on=len(ids), with_provided_aug=use_aug, classes=classes,
            input=dict(size=224, layout=BACKBONES[name][1], normalise=BACKBONES[name][3]),
            max_abs_diff_vs_python=float(np.abs(p_onnx - p_py).max()),
            ms_per_photo_cpu=round((time.time() - t) / 20 * 1000, 1),
            mb=round(__import__("os").path.getsize(path) / 1e6, 1))
json.dump(info, open(f"{DATA}/leafkin-symptoms.json", "w"), indent=1)
print(json.dumps(info, indent=1))
