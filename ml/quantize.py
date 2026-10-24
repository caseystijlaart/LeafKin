"""Shrink the exported model to 8-bit weights (static quantisation, calibrated on training photos) and check it
scores the same on the Lab test photos. Usage: python3 quantize.py → $DATA/leafkin-symptoms-int8.onnx"""
import json, random, numpy as np, onnxruntime as ort
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat
from onnxruntime.quantization.shape_inference import quant_pre_process
from PIL import Image
from sklearn.metrics import roc_auc_score
from common import load_index, DATA
from features import preprocess

rows = [r for r in load_index() if r["kind"] == "orig" and r["source"] in ("aloe", "cactus", "nursery")]
held = {x["id"] for x in json.load(open(f"{DATA}/testpack.json"))}
calib = random.Random(5).sample([r for r in rows if r["id"] not in held], 200)

class Reader(CalibrationDataReader):
    def __init__(self): self.it = iter(calib)
    def get_next(self):
        r = next(self.it, None)
        return None if r is None else {"input": preprocess(Image.open(f"{DATA}/img/{r['id']}.jpg").convert("RGB"), "mobilenetv2")[None]}

import onnx
from onnx import version_converter
onnx.save(version_converter.convert_version(onnx.load(f"{DATA}/leafkin-symptoms.onnx"), 13), f"{DATA}/op13.onnx")  # per-channel needs opset 13
quant_pre_process(f"{DATA}/op13.onnx", f"{DATA}/pre.onnx", skip_symbolic_shape=True)
quantize_static(f"{DATA}/pre.onnx", f"{DATA}/leafkin-symptoms-int8.onnx", Reader(), quant_format=QuantFormat.QDQ,
                per_channel=True, weight_type=QuantType.QInt8, activation_type=QuantType.QUInt8,
                nodes_to_exclude=[n for n in ["lk_norm", "lk_unit", "lk_logits0", "lk_logits", "probs"]])

pack = json.load(open(f"{DATA}/testpack.json")); classes = json.load(open(f"{DATA}/leafkin-symptoms.json"))["classes"]
X = np.stack([preprocess(Image.open(f"{DATA}/img/{x['id']}.jpg").convert("RGB"), "mobilenetv2") for x in pack])
y = np.array([x["label"] != "healthy" for x in pack]); known = [i for i, x in enumerate(pack) if x["species"] != "other"]
for f in ["leafkin-symptoms.onnx", "leafkin-symptoms-int8.onnx"]:
    s = ort.InferenceSession(f"{DATA}/{f}", providers=["CPUExecutionProvider"])
    P = np.concatenate([s.run(["probs"], {"input": X[i:i + 1]})[0] for i in range(len(X))])
    sick = 1 - P[:, classes.index("healthy")]; pred = sick >= 0.5
    print(f, round(__import__("os").path.getsize(f"{DATA}/{f}") / 1e6, 1), "MB | sick AUC", round(roc_auc_score(y, sick), 3),
          "| bal acc", round((pred[y].mean() + (~pred[~y]).mean()) / 2, 3),
          "| top-1 known", round(np.mean([classes[P[i].argmax()] == pack[i]["label"] for i in known]), 3))
