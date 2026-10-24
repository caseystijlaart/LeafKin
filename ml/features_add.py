"""Add features for images that are in index.csv but not yet in $DATA/feat_<backbone>.npz (e.g. after add_inat.py).
Usage: python3 features_add.py [backbone=mobilenetv2]"""
import sys
import numpy as np, onnxruntime as ort
from PIL import Image
from common import load_index, DATA
from features import feature_model, preprocess, BACKBONES

name = sys.argv[1] if len(sys.argv) > 1 else "mobilenetv2"
z = np.load(f"{DATA}/feat_{name}.npz"); ids, X = list(z["ids"]), [z["X"]]
have = set(ids)
new = [r["id"] for r in load_index() if r["id"] not in have]
sess = ort.InferenceSession(feature_model(name).SerializeToString(), providers=["CPUExecutionProvider"])
inp, feat = sess.get_inputs()[0].name, BACKBONES[name][2]
for i in range(0, len(new), 32):
    b = new[i:i + 32]
    x = np.stack([preprocess(Image.open(f"{DATA}/img/{k}.jpg").convert("RGB"), name) for k in b])
    X.append(sess.run([feat], {inp: x})[0].reshape(len(b), -1)); ids += b
np.savez_compressed(f"{DATA}/feat_{name}.npz", ids=np.array(ids), X=np.concatenate(X).astype(np.float32))
print(name, "added", len(new), "total", len(ids))
