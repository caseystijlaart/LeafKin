# Photo health check: how the options are compared, and why

Goal: from one close-up photo of a leaf, suggest which **symptoms** LeafKin's health check should tick, so its existing
causes-and-fixes logic does the rest. Everything must be free and should run on the phone, so the photo never leaves it.

## Data (three Kaggle downloads, four independent sources)

| Source | Originals used | Species | Notes from the documentation and our own audit |
|---|---|---|---|
| **Aloe** (Mendeley 7w6t4zx33n, inside `indoor`) | ~2,400 | Aloe vera | 2,500 originals; the combined set adds ~16,000 "Augmented_" copies, including in its test folder |
| **Cactus** (Mendeley jgt7ghdmg5, inside `indoor`) | 628 | Opuntia | Healthy and infested plants photographed with **different cameras, days and fields** (Tunisia): risk the model learns the camera, not the insects |
| **Nursery** (`indoor-plant-disease` raw, 787) | 787 | Money plant, snake plant, spider plant | Same photos as the money/snake/spider part of `indoor`, which holds each one ~3× (Roboflow export copies) |
| **Binary** (`indoor-plant-dataset`) | 914 | not stated | healthy/unhealthy only, 256×256, CC BY-SA (so only used for testing, never shipped in the model) |

Rules: only original photos are used for testing; dataset-provided augmented copies (aloe "Augmented_", nursery
"traditional" and "diffusion" sets) may only ever appear in training (experiment E4). Near-duplicate photos are
grouped (perceptual hash) so a photo and its copy never land on both sides of a split.

## Labels: diseases → symptoms LeafKin already knows

| Model output | Dataset classes | Health check symptom |
|---|---|---|
| healthy | all *Healthy* classes | nothing ticked |
| spots | aloe anthracnose, leaf spot, rust; snake plant anthracnose; spider plant fungal leaf spot; money plant manganese toxicity | `spots` |
| brown_tips | spider plant leaf tip necrosis | `brown_tips` |
| wilting | money plant bacterial wilt; snake plant leaf withering | `droop` |
| scorch | aloe sunburn | new symptom: bleached or scorched patches |
| pests | cactus cochineal (white, cottony insects) | `pests` |

Why symptoms: a model that learns "snake plant anthracnose" has nothing to say about a monstera; "dark spots on a leaf"
looks alike on most plants. It also keeps the person in charge: the app pre-ticks symptoms, the person confirms.

## Candidates

All candidates use a network pretrained on ImageNet (millions of everyday photos) as a frozen feature extractor, with a
small classifier trained on top. That's the right fit for a few thousand images on a CPU, and it exports to a single
file the browser can run (ONNX Runtime Web).

| Backbone | File size | Why it's in the race |
|---|---|---|
| MobileNetV2 | 14 MB | built for phones; smallest and fastest |
| EfficientNet-Lite4 | 52 MB | made for mobile too, usually more accurate |
| ResNet50 | 102 MB | big classic; shows how much accuracy the small ones leave on the table |

Not tested now: Pl@ntNet's disease API and zero-shot image–text models are blocked from the machines used here; Pl@ntNet
can be compared later in the beta with the same test photos.

## Experiments

- **E1 Backbones**: the three above, same data and classifier. Why: phone download size and speed vs accuracy.
- **E2 Label detail**: 16 species-disease classes vs 6 symptoms. Why: check symptoms aren't much worse where both apply.
- **E3 Generalisation**: the important one, because LeafKin users have other plants than these five.
  - E3a held-out photos of the same five species (the usual, optimistic score)
  - E3b **leave one species out**: train without e.g. snake plant, test on snake plant. This is the closest estimate of
    how it does on a plant it has never seen.
  - E3c **external set**: the binary set (other source, unknown species): does it tell healthy from unhealthy?
  - E3d **shortcut check**: can image size/format alone predict the cactus label? If yes, cactus scores aren't trustworthy.
- **E4 Provided augmented copies**: train with vs without them (test always on originals). Why: the datasets ship them
  as a feature; they might help or just add more of the same.

## Metrics

Macro-F1 (every class counts equally, so the 2,400 aloe photos can't drown the rest), top-1 and top-2 accuracy,
**false alarms** (healthy leaf called sick) and **misses** (sick leaf called healthy), model size and time per photo.

## Decision rule

Pick the smallest backbone within 2 macro-F1 points of the best on E3b. Ship it in the beta only as a *suggestion*
(pre-ticked symptoms the person confirms), and only if E3c tells healthy from unhealthy clearly better than chance.
Symptoms that only come from one species (pests, scorch) are shown with extra caution.
