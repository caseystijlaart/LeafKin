# Step 1 (run on the PC where the Kaggle downloads are): index + shrink the three datasets.
# Expects ~/mnt/datasets/{indoor, indoor-plant-disease, indoor-plant-dataset}; writes _leafkin_prepared/{img, index.part*.csv}.
# Resumable: `python3 prepare.py 0 2 & python3 prepare.py 1 2` repeatedly until both print DONE, then
# `cat index.part*.csv > index.csv` and copy img/ + index.csv to $LEAFKIN_DATA. `python3 prepare.py count` shows counts.
import os, sys, csv, random, time, hashlib
from PIL import Image, ImageOps
D = os.path.expanduser("~/mnt/datasets"); OUT = os.path.join(D, "_leafkin_prepared"); IMG = os.path.join(OUT, "img")
os.makedirs(IMG, exist_ok=True)
items = []  # (source, species, cls, split, kind, path)
for split in ["train", "valid", "test"]:
    for cls in sorted(os.listdir(f"{D}/indoor/{split}")):
        sp = cls.split("_")[0]
        for f in sorted(os.listdir(f"{D}/indoor/{split}/{cls}")):
            p = f"{D}/indoor/{split}/{cls}/{f}"
            if sp in ("Aloe", "Cactus"):
                kind = "aug" if f.startswith("Augmented_") else "orig"
                items.append((sp.lower(), sp, cls, split, kind, p))
            else:
                items.append(("roboflow", sp, cls, split, "copy", p))
raw = f"{D}/indoor-plant-disease/01_raw_dataset/raw_dataset"
for cls in sorted(os.listdir(raw)):
    for f in sorted(os.listdir(f"{raw}/{cls}")): items.append(("nursery", cls.split("_")[0], cls, "", "orig", f"{raw}/{cls}/{f}"))
aug = f"{D}/indoor-plant-disease/02_augmented_dataset/augmented_dataset"
for cls in sorted(os.listdir(aug)):
    for f in sorted(os.listdir(f"{aug}/{cls}")): items.append(("nursery", cls.split("_")[0], cls, "", "aug", f"{aug}/{cls}/{f}"))
for cls in ["healthy", "unhealthy"]:
    for f in sorted(os.listdir(f"{D}/indoor-plant-dataset/{cls}")): items.append(("binary", "", cls, "", "orig", f"{D}/indoor-plant-dataset/{cls}/{f}"))
# Aloe augmented copies: a fixed random sample of 600 per class is enough for experiment E4.
rnd = random.Random(7)
aloe_aug = [i for i in items if i[0] == "aloe" and i[4] == "aug"]
keep = set()
for cls in sorted({i[2] for i in aloe_aug}):
    xs = [i for i in aloe_aug if i[2] == cls]; rnd.shuffle(xs); keep.update(x[5] for x in xs[:600])
items = [i for i in items if not (i[0] == "aloe" and i[4] == "aug" and i[5] not in keep)]
if sys.argv[1:] == ["count"]:
    import collections; print(collections.Counter((i[0], i[4]) for i in items), len(items)); sys.exit()
part, nparts = int(sys.argv[1]), int(sys.argv[2])
def dhash(im):
    g = im.convert("L").resize((9, 8), Image.BILINEAR); px = list(g.getdata())
    return "%016x" % sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])
rows_path = os.path.join(OUT, f"index.part{part}.csv")
done = set()
if os.path.exists(rows_path):
    with open(rows_path) as fh: done = {r[0] for r in csv.reader(fh)}
t0 = time.time(); n = 0
with open(rows_path, "a", newline="") as fh:
    w = csv.writer(fh)
    for k, it in enumerate(items):
        if k % nparts != part: continue
        iid = hashlib.md5(it[5].encode()).hexdigest()[:16]
        if iid in done: continue
        if time.time() - t0 > 150: print("MORE", part); sys.exit()
        try:
            im = Image.open(it[5]); fmt = im.format; ow, oh = im.size
            im = ImageOps.exif_transpose(im).convert("RGB"); im.thumbnail((320, 320), Image.BICUBIC)
            im.save(os.path.join(IMG, iid + ".jpg"), quality=90)
            w.writerow([iid, *it[:5], ow, oh, fmt, dhash(im), os.path.relpath(it[5], D)]); n += 1
        except Exception as e:
            w.writerow([iid, *it[:5], 0, 0, "ERR", "", os.path.relpath(it[5], D)])
print("DONE", part, n)
