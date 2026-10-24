"""Shared helpers for the LeafKin photo health check experiments."""
import csv, os
import numpy as np

DATA = os.environ.get("LEAFKIN_DATA", "/tmp/claude-0/ml/data")

# Dataset class → symptom that LeafKin's health check knows (see PLAN.md).
SYMPTOM = {
    "Healthy": "healthy",
    "Aloe_Anthracnose": "spots", "Aloe_LeafSpot": "spots", "Aloe_Rust": "spots",
    "Snake_Plant_Anthracnose": "spots", "Spider_Plant_Fungal_leaf_spot": "spots",
    "Money_Plant_Manganese_Toxicity": "spots",
    "Spider_Plant_Leaf_Tip_Necrosis": "brown_tips",
    "Money_Plant_Bacterial_wilt_disease": "wilting", "Snake_Plant_Leaf_Withering": "wilting",
    "Aloe_Sunburn": "scorch",
    "Cactus_Dactylopius_Opuntia": "pests",
}
SYMPTOMS = ["healthy", "spots", "brown_tips", "wilting", "scorch", "pests"]

def symptom(cls):
    return "healthy" if cls.endswith("Healthy") else SYMPTOM[cls]

def load_index():
    rows = []
    with open(os.path.join(DATA, "index.csv")) as fh:
        for r in csv.reader(fh):
            iid, source, species, cls, split, kind, w, h, fmt, dh, path = r
            rows.append(dict(id=iid, source=source, species=species, cls=cls, split=split, kind=kind,
                             w=int(w), h=int(h), fmt=fmt, dhash=int(dh, 16) if dh else 0, path=path))
    return rows

def hamming(a, b):
    return bin(a ^ b).count("1")
