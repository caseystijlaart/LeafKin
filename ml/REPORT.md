# Photo health check: results (24 October 2026)

How the options were compared and why: see [PLAN.md](PLAN.md). Everything here can be rerun with the scripts in this
folder (`prepare` step on the PC → `audit.py` → `features.py` → `experiments.py` → `export.py`).

## Verdict

**MobileNetV2, the smallest network, wins**, trained on symptoms with the datasets' own augmented copies added.
It's 14 MB, takes about 5 ms per photo on a computer's processor (a phone will be slower but well under a second), and runs in the browser.

What it can and can't do:

- **"Is something wrong with this leaf?"** works well, also on plants it never saw: 0.99 AUC, 92% balanced accuracy
  on tomato, grape, potato and pepper leaves from a different source. That test leans easy (a plain colour rule
  already scores 0.86), but the model is clearly better than that.
- **"Which symptom?"** works on the five species it knows (top-2 correct 96% of the time), but **not** reliably on new
  plants: on an unseen species it picks the right symptom about 4 times in 10.
- So in LeafKin it should say *"Looks healthy"* or *"Something seems off"*, and **suggest** the most likely symptoms
  for the person to confirm. Not more.

## The data, after cleaning

| | |
|---|---|
| Photos used | 3,838 originals (aloe 2,423, cactus 628, money/snake/spider 787) + 6,935 provided augmented copies (training only) |
| Distinct leaves | 3,213: 1,022 photos are the same leaf photographed again; these always stay on the same side of a split |
| Dropped | 1,814 Roboflow copies of the money/snake/spider photos (same photos as the nursery set) |
| Test only | 914 "indoor plant leaf health" photos: these are **not houseplants** but crop leaves (tomato, grape, potato, pepper…) |

Problems found that the dataset pages don't mention:

- **Studio photos.** Aloe leaves are cut out on a black background; money/snake/spider leaves lie on plain grey. Real
  phone photos have busy backgrounds, so the app should ask for a close-up that fills the frame.
- **Label errors.** 34 groups of photos of the same leaf carry different labels (33 of them aloe, mostly rust vs
  sunburn); in 11 cases the photos are practically identical.
- **Cactus shortcut confirmed.** Simple colour statistics alone tell healthy from infested cactus 73% of the time
  (chance 50%): different camera, day and field per class. Cactus "pests" can't be trusted.

## Results

Scores are averages over 5 folds (E3a) or 5 held-out species (E3b). F1 = macro-F1 over symptoms.
False alarm = healthy leaf called sick; miss = sick leaf called healthy.

### E1: which network (symptom labels, same classifier)

| Network | Size | E3a F1 | E3a top-2 | E3b F1 (unseen species) | E3b sick/healthy AUC | E3c AUC | E3c false alarms |
|---|---|---|---|---|---|---|---|
| **MobileNetV2** | 14 MB | **0.84** | 0.96 | **0.37** | **0.82** | **0.99** | **1%** |
| EfficientNet-Lite4 | 52 MB | 0.79 | 0.95 | 0.34 | 0.79 | 0.96 | 40% |
| ResNet50 | 102 MB | 0.82 | 0.96 | 0.34 | 0.77 | 0.97 | 13% |

The smallest is also the best here. With a frozen network and a few thousand photos, the bigger ones don't get to use
their extra capacity.

### E2: symptoms vs exact diseases (MobileNetV2)

| Labels | E3a F1 | E3b F1 | E3c false alarms |
|---|---|---|---|
| 6 symptoms | 0.84 | 0.37 | 1% |
| 16 species-diseases (mapped back to symptoms) | 0.85 | 0.36 | 28% |

Same on known plants, worse on new ones: symptoms it is.

### E3: how well it generalises (MobileNetV2, final settings)

| Test | Result |
|---|---|
| E3a known species, unseen leaves | F1 0.85, top-1 81%, top-2 96%, false alarms 16%, misses 7% |
| E3b leave one species out | F1 0.40, top-1 41%, sick-or-healthy AUC 0.84 |
| E3c other plants, other source | AUC 0.99, balanced accuracy 92%, false alarms 2%, misses 14% |

Per held-out species (E3b, without the augmented copies): spider plant 0.97 AUC, money plant 0.92, snake plant 0.88, aloe 0.83, cactus 0.52.
The cactus is the odd one out: field photos of whole plants instead of leaf close-ups, so the model has nothing like
it to learn from. Symptoms seen in only one species (scorch: aloe; brown tips: spider plant; pests: cactus) can't be
recognised when that species is held out, by construction.

On the other-plants set, sick leaves were mostly labelled "wilting" or "pests" although most of those diseases
show spots, which confirms that the *kind* of symptom doesn't carry over to new plants yet.

### E4: the datasets' own augmented copies

| | E3a F1 | E3b F1 | E3c AUC |
|---|---|---|---|
| Without | 0.84 | 0.37 | 0.99 |
| With (training only) | 0.85 | 0.40 | 0.99 |

A small gain on unseen species, so the final model uses them.

## Settings and checks

- Classifier: logistic regression on unit-length features, class-balanced, C = 30 (best of 1, 3, 10, 30 on E3a for all
  three networks; 30 is the edge of that range, so a little optimism in E3a is possible).
- Exported model `leafkin-symptoms.onnx`: network + normalisation + classifier + softmax in one file. Its outputs match
  the Python classifier to 0.0000002.
- Input: RGB photo, shorter side to 224 px, centre crop 224×224, ImageNet normalisation, NCHW.
- Licences: trained only on CC BY 4.0 data (Aloe, Cactus, Nursery sets). The CC BY-SA "indoor plant leaf health" set
  was used for testing only. Credit in the app: Aloe Vera Leaf Disease Detection Dataset (Khan et al.), Cactus dataset
  (Benali & Jdey), Indoor Plant Disease Image Dataset (Mahmud Opu et al.), combined by Abdul Ahad on Kaggle.

## Recommended next steps

1. **2.2.0 in the beta**: "Check with a photo" in the health check: close-up of one leaf → *looks healthy* / *something
   seems off* plus up to two suggested symptoms, pre-ticked for the person to confirm. Hide "pests" from the model's
   suggestions (cactus shortcut). The photo stays on the phone.
2. **Better data beats a bigger network**: PlantWild/PlantDoc (real-world photos, more species) and, later, photos from
   LeafKin users who opt in, labelled by the symptoms they confirm.
3. Shrink the model to about 4 MB (8-bit quantisation) and check the scores stay the same.
