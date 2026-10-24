"""Add PlantDoc (github.com/pratikkayal/PlantDoc-Dataset, CC BY 4.0) to the prepared data: shrink to 320 px,
fingerprint, and append to $DATA/index.csv as source "plantdoc" (its own train/test split is kept in `split`).
Usage: python3 add_plantdoc.py /path/to/PlantDoc-Dataset"""
import csv, hashlib, os, sys
from PIL import Image, ImageOps
from common import DATA

root = sys.argv[1]
have = {r[0] for r in csv.reader(open(f"{DATA}/index.csv"))}
def dhash(im):
    g = im.convert("L").resize((9, 8), Image.BILINEAR); px = list(g.getdata())
    return "%016x" % sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])
n = bad = 0
with open(f"{DATA}/index.csv", "a", newline="") as fh:
    w = csv.writer(fh)
    for split in ["train", "test"]:
        for cls in sorted(os.listdir(f"{root}/{split}")):
            species = cls.replace("_", " ").split()[0].capitalize()
            for f in sorted(os.listdir(f"{root}/{split}/{cls}")):
                path = f"{root}/{split}/{cls}/{f}"
                iid = "pd" + hashlib.md5(f"plantdoc/{split}/{cls}/{f}".encode()).hexdigest()[:14]
                if iid in have: continue
                try:
                    im = Image.open(path); fmt = im.format; ow, oh = im.size
                    im = ImageOps.exif_transpose(im).convert("RGB"); im.thumbnail((320, 320), Image.BICUBIC)
                    im.save(f"{DATA}/img/{iid}.jpg", quality=90)
                    w.writerow([iid, "plantdoc", species, cls, split, "orig", ow, oh, fmt, dhash(im), f"plantdoc/{split}/{cls}/{f}"]); n += 1
                except Exception as e:
                    bad += 1; print("skip", path, e, file=sys.stderr)
print("added", n, "unreadable", bad)
