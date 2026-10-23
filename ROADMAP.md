# LeafKin roadmap

Ideas for future versions, roughly in order of priority. Nothing here is promised; items move to the
[changelog](README.md#changelog) once they ship. Each one is built on `beta` first.

## Next

### AI health diagnosis from a photo
Take a photo of a struggling plant and get likely problems (pests, disease, over- or underwatering, sunburn,
nutrient shortage) with what to do, instead of only ticking symptoms by hand.

- The current health check (`js/health.js`) stays as the free, offline fallback; AI adds a "Diagnose from photo" step on top.
- Runs through a Supabase Edge Function, so no AI key is ever in the app.
- Options to compare before building (cost, quality, privacy):
  - a plant-health API such as Kindwise plant.id health assessment (made for this, limited free credits)
  - a general vision model API (Claude, Gemini, OpenAI), which also gives care advice in plain language
  - limits per household per day, so costs stay predictable
- Privacy policy update: photos sent for diagnosis go to that provider.
- Version: 2.2.0 (new feature).

## Later

- **Holiday mode**: pause reminders for a period, or invite a plant sitter temporarily.
- **Own email domain**: sign-in codes from e.g. `codes@leafkin.app` instead of an Outlook address, so they land in junk less often.
- **Growth suggestions**: tips based on the timeline (e.g. "hasn't grown since spring, try a brighter spot").
- **Privacy policy changes**: ask existing accounts to accept a new version of the policy when it changes.

## Not planned

- A native App Store app: LeafKin stays a home-screen web app (no developer certificate needed).
