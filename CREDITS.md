# Credits and licences

LeafKin uses the following work by others. The same list is shown in the app under Settings → Credits & licences
(`js/credits.js`); keep both in step. Everything below allows commercial use, as long as it's credited.

## Photo health check: training data

The model in `models/` is trained on these collections. The photos themselves are not part of the app.
Changes made: photos resized (longest side 320 px), disease labels grouped into symptoms (see `ml/REPORT.md`).

| Dataset | Authors | Source | Licence |
|---|---|---|---|
| Aloe Vera Leaf Disease Detection Dataset | Khan, Reza, Mojumdar et al. | [Mendeley Data, doi 10.17632/7w6t4zx33n.1](https://doi.org/10.17632/7w6t4zx33n.1) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Cactus dataset | Benali & Jdey | [Mendeley Data, doi 10.17632/jgt7ghdmg5.1](https://doi.org/10.17632/jgt7ghdmg5.1) | CC BY 4.0 |
| Indoor Plant Disease Image Dataset | Mahmud Opu, Islam, Abdullah & Akter (ICCIT 2025) | [Kaggle, combined by Abdul Ahad](https://www.kaggle.com/datasets/abdulahad46/indoor-plant-disease-detection-dataset) | CC BY 4.0 |
| PlantDoc | Singh, Jain, Jain, Kayal, Kumawat & Batra (CoDS-COMAD 2020) | [GitHub](https://github.com/pratikkayal/PlantDoc-Dataset) | CC BY 4.0 |

Lab test photos (`lab/`, beta only, not used for training): see [lab/LICENSE.md](lab/LICENSE.md). That folder also
contains photos from the Indoor Plant Leaf Health Dataset (Gaurav Saklani, CC BY-SA 4.0), shared under the same licence.

Not used: iNaturalist (its terms don't allow training AI for commercial purposes) and houseplant photo sets scraped
from search engines (no licence).

## Photo health check: model and software

| | By | Licence |
|---|---|---|
| [MobileNetV2](https://github.com/onnx/models) (ImageNet weights, ONNX Model Zoo) | ONNX community | Apache 2.0 |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) 1.20.1, `js/vendor/ort/` | Microsoft | MIT |

## Plant identification

The image-based plant species identification service used is based on the [Pl@ntNet recognition API](https://my.plantnet.org/),
regularly updated and accessible through the site https://my.plantnet.org/. Free up to 500 identifications a day,
including commercial use; more needs a paid plan.

## App

| | By | Licence |
|---|---|---|
| [supabase-js](https://github.com/supabase/supabase-js) 2.118.0, `js/vendor/supabase.js` | Supabase | MIT |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) | The Bricolage Grotesque Project Authors | SIL OFL 1.1 |
| [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) | Braille Institute of America | SIL OFL 1.1 |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | The JetBrains Mono Project Authors | SIL OFL 1.1 |

Font licence text: [fonts/LICENSE.txt](fonts/LICENSE.txt).
