"""Export one ONNX file with MobileNetV2 + two classifiers:
  probs_a: model A (houseplant sets only)           classes_a
  probs_b: model B (houseplant sets + PlantDoc)     classes
  probs:   (A + B) / 2 over B's classes — what the app uses
Lab test photos (testpack.json) and their duplicates are left out of both. Usage: python3 export_combined.py"""
import json, os, sys, time
import numpy as np, onnx, onnxruntime as ort
from onnx import helper, numpy_helper, TensorProto
from PIL import Image
from common import DATA
from features import feature_model, preprocess, BACKBONES
from compare_plantdoc import F, R, G, house, pd_train, pack, pack_groups, fit

not_pack = lambda ids: [i for i in ids if G.get(i) not in pack_groups]
mA = fit(not_pack(house)); mB = fit(not_pack(house) + not_pack(pd_train))
ca, cb = list(mA.classes_), list(mB.classes_)
assert set(ca) <= set(cb)
M = np.zeros((len(ca), len(cb)), np.float32)      # A's classes → positions in B's class list
for i, c in enumerate(ca): M[i, cb.index(c)] = 1

g = feature_model("mobilenetv2"); graph = g.graph; feat = BACKBONES["mobilenetv2"][2]
del graph.output[:]
init = lambda arr, name: graph.initializer.append(numpy_helper.from_array(arr, name))
init(np.array([0, -1], np.int64), "lk_shape"); init(np.array([1e-12], np.float32), "lk_eps")
init(mA.coef_.T.astype(np.float32), "lk_Wa"); init(mA.intercept_.astype(np.float32), "lk_ba")
init(mB.coef_.T.astype(np.float32), "lk_Wb"); init(mB.intercept_.astype(np.float32), "lk_bb")
init(M, "lk_map"); init(np.array([0.5], np.float32), "lk_half")
graph.node.extend([
    helper.make_node("Reshape", [feat, "lk_shape"], ["lk_flat"]),
    helper.make_node("ReduceL2", ["lk_flat"], ["lk_norm"], axes=[1], keepdims=1),
    helper.make_node("Add", ["lk_norm", "lk_eps"], ["lk_norm2"]),
    helper.make_node("Div", ["lk_flat", "lk_norm2"], ["lk_unit"]),
    helper.make_node("MatMul", ["lk_unit", "lk_Wa"], ["lk_la0"]), helper.make_node("Add", ["lk_la0", "lk_ba"], ["lk_la"]),
    helper.make_node("Softmax", ["lk_la"], ["probs_a"], axis=1),
    helper.make_node("MatMul", ["lk_unit", "lk_Wb"], ["lk_lb0"]), helper.make_node("Add", ["lk_lb0", "lk_bb"], ["lk_lb"]),
    helper.make_node("Softmax", ["lk_lb"], ["probs_b"], axis=1),
    helper.make_node("MatMul", ["probs_a", "lk_map"], ["lk_a_in_b"]),
    helper.make_node("Add", ["lk_a_in_b", "probs_b"], ["lk_sum"]),
    helper.make_node("Mul", ["lk_sum", "lk_half"], ["probs"]),
])
graph.output.extend([helper.make_tensor_value_info(n, TensorProto.FLOAT, ["N", k]) for n, k in [("probs", len(cb)), ("probs_a", len(ca)), ("probs_b", len(cb))]])
onnx.checker.check_model(g)
path = f"{DATA}/leafkin-symptoms.onnx"; onnx.save(g, path)

# Check against Python on the Lab photos, and keep reference answers for the browser test.
sess = ort.InferenceSession(path, providers=["CPUExecutionProvider"])
ids = [x["id"] for x in pack]
X = np.stack([preprocess(Image.open(f"{DATA}/img/{i}.jpg").convert("RGB"), "mobilenetv2") for i in ids])
p, pa, pb = sess.run(["probs", "probs_a", "probs_b"], {"input": X})
fa = mA.predict_proba(np.stack([F[i] for i in ids])); fb = mB.predict_proba(np.stack([F[i] for i in ids]))
diff = max(np.abs(pa - fa).max(), np.abs(pb - fb).max(), np.abs(p - (fa @ M + fb) / 2).max())
info = dict(backbone="mobilenetv2", classes=cb, classes_a=ca, outputs={"probs": "A+B", "probs_a": "A", "probs_b": "B"},
            trained_on_a=len(not_pack(house)), trained_on_b=len(not_pack(house)) + len(not_pack(pd_train)),
            input=dict(size=224, layout="NCHW", normalise="imagenet", resize="centre square crop, BOX filter"),
            max_abs_diff_vs_python=float(diff), mb=round(os.path.getsize(path) / 1e6, 1))
json.dump(info, open(f"{DATA}/leafkin-symptoms.json", "w"), indent=1)
json.dump({i: dict(probs=[float(v) for v in p[k]], probs_a=[float(v) for v in pa[k]], probs_b=[float(v) for v in pb[k]])
           for k, i in enumerate(ids[:30])}, open(f"{DATA}/reference_probs.json", "w"))
print(json.dumps(info, indent=1))
