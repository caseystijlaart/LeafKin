# LeafKin roadmap

Ideas for future versions, roughly in order of priority. Nothing here is promised; items move to the
[changelog](README.md#changelog) once they ship. Each one is built on `beta` first.

## Next

### AI health diagnosis from a photo
Take a photo of a struggling plant and get likely problems (pests, disease, over- or underwatering, sunburn,
nutrient shortage) with what to do, instead of only ticking symptoms by hand.
The current health check (`js/health.js`) stays as the offline fallback. Version: 2.2.0.

Options compared (October 2026):

| Option | Cost | Fit for houseplants | Privacy |
|---|---|---|---|
| Pl@ntNet disease API | free, same 500/day quota and key as scanning | limited list of species and diseases | EU (France), already in the policy |
| Kindwise plant.health | 100 free credits, then about €0.01–0.05 each | made for this | extra provider |
| Gemini API | free tier not allowed for apps used in the EEA; paid only | good, plain-language advice | paid tier: not used for training |
| Groq / Cloudflare Workers AI (Llama vision) | free daily limits | general model, decent | Meta's licence excludes EU-based users for the multimodal Llama models; US servers |
| Own model in the browser | free | as good as the training data | photo never leaves the phone |

**Shipped in 2.2.0 (beta):** the own model runs in the health check; the beta's Lab compares it with Pl@ntNet and Kindwise.

First results (own model, MobileNetV2, 14 MB): tells healthy from sick well, also on unseen plants; the exact
symptom only on the five species it was trained on. Details: [ml/REPORT.md](ml/REPORT.md).

Plan:
1. Try Pl@ntNet diseases first: no cost, no new provider, a few lines of code. Check how many houseplant problems it knows.
2. Build an own on-device model that recognises *symptoms* (yellowing, brown tips, spots, wilting, webbing/pests, mildew,
   sunburn) rather than exact diseases, and feeds them into the existing health check for causes and fixes.
   - Start with a zero-shot image–text model (no training) as a baseline, then fine-tune a small model (MobileNet/EfficientNet class).
   - Data: PlantWild (18.5k in-the-wild images, 89 classes), PlantDoc, the Indoor Plant Disease set (money/snake/spider plant),
     relabelled to symptoms, plus own photos. PlantVillage alone won't do: lab photos of crop leaves; models trained like that drop
     sharply on real-world photos.
   - Runs in the browser (ONNX Runtime Web), cached for offline use. Supabase functions are too small for this (256 MB, 2 s CPU).

## Later

- **Holiday mode**: pause reminders for a period, or invite a plant sitter temporarily.
- **Own email domain**: sign-in codes from e.g. `codes@leafkin.app` instead of an Outlook address, so they land in junk less often.
- **Growth suggestions**: tips based on the timeline (e.g. "hasn't grown since spring, try a brighter spot").
- **Privacy policy changes**: ask existing accounts to accept a new version of the policy when it changes.

## Not planned

- A native App Store app: LeafKin stays a home-screen web app (no developer certificate needed).
