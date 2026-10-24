"""Extract image features with a frozen, ImageNet-pretrained network (ONNX), for every prepared image.
Usage: python3 features.py <backbone> [kind,kind]   →  $DATA/feat_<backbone>.npz (ids, X)"""
import os, sys, time
import numpy as np, onnx, onnxruntime as ort
from PIL import Image
from common import load_index, DATA

MODELS = os.environ.get("LEAFKIN_MODELS", "/tmp/claude-0/ml/models")
# name: (file, input layout, feature tensor, preprocessing)
BACKBONES = {
    "mobilenetv2": ("mobilenetv2-12.onnx", "NCHW", "472", "imagenet"),
    "efficientnet": ("efficientnet-lite4-11.onnx", "NHWC", "efficientnet-lite4/model/head/Squeeze:0", "pm1"),
    "resnet50": ("resnet50-v2-7.onnx", "NCHW", "resnetv24_flatten0_reshape0", "imagenet"),
}
MEAN, STD = np.array([0.485, 0.456, 0.406], np.float32), np.array([0.229, 0.224, 0.225], np.float32)

def feature_model(name):
    """The pretrained network with its last layer removed: the output is the pooled feature vector."""
    f, layout, feat, _ = BACKBONES[name]
    m = onnx.load(os.path.join(MODELS, f))
    for t in list(m.graph.input) + list(m.graph.output):   # allow any batch size
        d = t.type.tensor_type.shape.dim
        if d: d[0].dim_param = "N"
    m.graph.output.extend([onnx.helper.make_tensor_value_info(feat, onnx.TensorProto.FLOAT, None)])
    return m

def preprocess(img, name):
    """Shorter side to 224, centre crop 224×224 — the same steps the app will do on the phone."""
    w, h = img.size; s = 224 / min(w, h)
    img = img.resize((max(224, round(w * s)), max(224, round(h * s))), Image.BICUBIC)
    w, h = img.size; l, t = (w - 224) // 2, (h - 224) // 2
    x = np.asarray(img.crop((l, t, l + 224, t + 224)), np.float32)
    x = (x / 255 - MEAN) / STD if BACKBONES[name][3] == "imagenet" else (x - 127) / 128
    return x.transpose(2, 0, 1) if BACKBONES[name][1] == "NCHW" else x

if __name__ == "__main__":
    name = sys.argv[1]
    kinds = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
    rows = [r for r in load_index() if not kinds or r["kind"] in kinds]
    so = ort.SessionOptions(); so.intra_op_num_threads = 2
    sess = ort.InferenceSession(feature_model(name).SerializeToString(), so, providers=["CPUExecutionProvider"])
    inp, feat = sess.get_inputs()[0].name, BACKBONES[name][2]
    ids, X, t0 = [], [], time.time()
    for i in range(0, len(rows), 32):
        batch = rows[i:i + 32]
        x = np.stack([preprocess(Image.open(f"{DATA}/img/{r['id']}.jpg").convert("RGB"), name) for r in batch])
        X.append(sess.run([feat], {inp: x})[0].reshape(len(batch), -1)); ids += [r["id"] for r in batch]
        if i == 0: print(name, "first batch", round(time.time() - t0, 2), "s", flush=True)
    X = np.concatenate(X).astype(np.float32)
    np.savez_compressed(f"{DATA}/feat_{name}.npz", ids=np.array(ids), X=X)
    print(name, X.shape, round(time.time() - t0), "s total", round((time.time() - t0) / len(ids) * 1000, 1), "ms/img")
