# LeafKin

**Version 2.2.0** · see the [changelog](#changelog)

A plant care app that installs on your iPhone home screen as a Progressive Web App (PWA). No App Store, no developer certificates.
From 2.0, plants live in a shared **household** on Supabase: everyone in it sees the same plants, on every device.

## What it does

- **Households**: sign in with a 6-digit email code, create a household or join one with an invite code; everyone sees the same plants, photos and care log, with who did what ("Watered · Bob")
- **Start screen**: create an account, sign in, or continue as a guest (plants stay on the phone only; guests get a monthly backup reminder and can move their plants into an account later)
- **Daily reminders**: a push notification at a time you pick, on days when plants need water or food (iPhone: LeafKin on the Home Screen, iOS 16.4+)
- **Household activity**: what housemates did recently on the main screen, the full log in Settings
- **Privacy**: a privacy policy in the app (`js/privacy.js`), accepted with a checkbox when creating an account (the accepted version and time are saved on the account); guests are told nothing leaves their phone. Fonts are served with the app, so it loads nothing from Google or other third parties
- **Delete account** in Settings
- **Sync**: live updates between phones; works offline and sends changes when back online; plants from LeafKin 1.x on a phone can be moved into the household

- Add plants by **scanning** them (Pl@ntNet suggests up to 5 species, each with reference photos you can enlarge) or by typing, with **autocomplete** in English, Dutch or Latin
- **Varieties** (cultivars such as Peace lily 'Diamond Sensation'): pick one after a scan or type it; each plant is saved as its exact type. Pl@ntNet itself only identifies species.
- **Fills care in automatically** from a built-in library of 245 plants and 89 varieties (houseplants, succulents, orchids, herbs, balcony plants): light, direct sun hours, watering style, humidity, pet safety, watering and feeding intervals
- Watering and feeding reminders in the app, sorted by what needs attention first, with one-tap logging and undo
- **Health check**: take a close-up of a leaf and a small model on the phone says whether it looks healthy and pre-ticks likely symptoms; confirm what you see and get the likely causes and a few short fixes
- **Growth timeline**: dated photos and heights, a height chart, and a then-and-now comparison; one photo per plant per week or month (replace the latest any time)
- Light-aware care: the light and direct sun at the plant's spot (and a bathroom or outdoor room) adjust the watering and feeding interval
- Compact list grouped by what's due, with search and room filters for big collections
- Winter care (Nov–Feb): watering stretched by half, feeding paused (can be switched off)
- Swipe a plant right when watered, left when the soil is still damp (checks again in 2 days); after two damp rounds in a row the interval grows by a day
- Repotting reminder in spring when it's been about 2 years; a small camera mark when a plant's last photo is a month old
- Optional icon badge, backup and restore
- Works offline once installed: a local copy (IndexedDB) opens instantly and queues changes.

## Project layout

```
index.html              app page + startup animation
manifest.webmanifest    PWA manifest (name, icons, standalone display)
sw.js                   service worker (offline cache) — bump VERSION on every release
css/app.css             styles, light and dark
js/app.js               UI
js/db.js                local copy: plants, photos, queued changes (IndexedDB)
js/sync.js              turns each saved plant into queued changes, sends and receives them
js/cloud.js             Supabase: sign-in, households, data, photos, live updates
js/vendor/supabase.js   supabase-js, bundled into one file (no build step for the app)
js/care-library.js      care labels, autocomplete, scan matching
js/plant-data.js        the plant care profiles (add new plants here)
js/plantnet.js          Pl@ntNet species identification
js/config.js            site settings filled in at deploy time (keep empty in git)
js/health.js            symptom-based health check
js/conditions.js        light → watering adjustment
js/schedule.js          due dates: winter care, snooze, repotting, photo nudge
js/util.js              dates, image resizing
icons/                  app icons
supabase/migrations/    database schema and security rules
tests/                  schema and sync tests (see Tests)
.github/workflows/      GitHub Pages deploy
```

No build step: plain HTML, CSS and JavaScript modules.

## Run locally

```sh
python3 -m http.server 8080
# open http://localhost:8080
```

Service workers only run on `https://` or `localhost`.

## Deploy (GitHub Pages)

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. The workflow publishes two versions on every push to `live` or `beta`:
   - `https://caseystijlaart.github.io/LeafKin/`: the live app, from `LIVE_BRANCH` (set at the top of `.github/workflows/pages.yml`)
   - `https://caseystijlaart.github.io/LeafKin/beta/`: the test version, from the `beta` branch. It's called "LeafKin β" on the Home Screen, has an amber icon with a β badge (`icons/beta/`, made by `tools/make-beta-icons.py`), shows a Beta label, and keeps its own storage and sign-in on the phone, so testing never touches the live app. It uses the same Supabase project, so it sees the same household.
3. Allow the branches once under **Settings → Environments → github-pages → Deployment branches and tags**: `live` and `beta`.

Branches: `live` is the live app, `beta` the test version. New work goes to `beta` (bigger features on their own branch first), gets tested on the phone in LeafKin β, then is merged into `live`.

## Plant scanning (Pl@ntNet, free)

1. Create an account at [my.plantnet.org](https://my.plantnet.org) and generate an API key (free plan: 500 identifications per day).
2. In the key settings, tick **expose my API key** and add `https://caseystijlaart.github.io` under **Authorized domains** (add `http://localhost:8080` too for local testing).
3. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, name `PLANTNET_API_KEY`, paste the key.
4. Re-run the deploy (push to `live`, or **Actions → Deploy to GitHub Pages → Run workflow**).

The workflow writes the key into `js/config.js` on the published site only; the file in the repo stays empty. Every device then scans without setup. A key typed in the app's Settings overrides it on that device.

Note: anyone who opens the site can see the key in its source. The authorized-domain setting stops other websites from using it; to also block use from scripts and servers, list an IP range in the key's authorized IPs.

## Install on iPhone / iPad

Open the site in Safari → Share → **Add to Home Screen**. Data saved in the installed app is kept separately from Safari, so install first, then add your plants.

## Versioning

- Patch (1.4.0 → 1.4.1): fixes and small tweaks
- Minor (1.4.x → 1.5.0): a new feature
- Major (→ 3.0.0): a big change, like 2.0.0's move to shared households on Supabase

Keep `APP_VERSION` in `js/app.js` and `VERSION` in `sw.js` in step.

## Setting up 2.0 (Supabase)

Do this once before deploying the `v2` branch.

1. **Project**: create a new project at [supabase.com](https://supabase.com) (free plan, region Frankfurt).
2. **Database**: in **SQL Editor**, paste and run `supabase/migrations/20261020120000_init.sql`.
3. **Sign-in by code** (needs step 5's email service first; Supabase locks templates until custom SMTP is on): **Authentication → Emails → Templates**.
   - **Confirm sign up**: subject `{{ .Token }} is your LeafKin code`, body = `supabase/templates/confirm-signup.html`
   - **Magic link**: same subject, body = `supabase/templates/magic-link.html`
   (New accounts get the Confirm sign up email, returning ones the Magic link email.)
4. **Site address**: **Authentication → URL Configuration → Site URL**: `https://caseystijlaart.github.io/LeafKin/`.
5. **Email service**: Supabase's built-in email only reaches members of your Supabase team, 2 emails an hour. For anyone else, connect a free SMTP service under **Authentication → Emails → SMTP Settings**, e.g. Brevo (300 emails/day, works with a verified sender address) or Resend (needs your own domain).
6. **Keys for the site**: **Project Settings → API**, copy the Project URL and the `anon` public key into repository secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` (**Settings → Secrets and variables → Actions**). The anon key is meant to be public; the security rules protect the data.
7. **Second migration**: in **SQL Editor**, run `supabase/migrations/20261023120000_account_reminders.sql` (delete account, reminder settings). Then `supabase/migrations/20261023130000_server_access.sql` (lets the reminder function read devices and plants).
8. **Deploy**: push to `live`. On first open, LeafKin asks you to sign in; plants saved by 1.x on that phone are offered for import into your household.

Free plan limits: 500 MB database, 1 GB photos, 5 GB transfer a month. A project with no activity for a week is paused; restore it from the dashboard.

## Photo health check and the Lab

The health check runs a small image model on the phone (`js/diagnose.js`, model in `models/`, runtime in
`js/vendor/ort/`); it loads the first time it's used (about 25 MB) and is then cached for offline use. How it was
built and tested: `ml/PLAN.md` and `ml/REPORT.md`. When `models/` changes, bump `ML_VERSION` in `sw.js`.

The beta has a **Lab** (Settings → Lab) that runs the same 160 labelled test photos (`lab/`, never used for training)
through the own model, Pl@ntNet's disease API and Kindwise's plant.health API, and shows a score table plus a CSV.
Kindwise needs a key from admin.kindwise.com (100 free credits), entered in the Lab and stored on that device only.

## Daily reminders (push notifications)

The app subscribes each phone that turns reminders on (Settings → Reminders) and stores it with the chosen hour. The Edge Function `supabase/functions/send-reminders` runs every hour, finds the devices whose hour it is, works out which plants are due (same rules as the app, including winter care and "still damp") and sends one notification. Nothing due, nothing sent.

One-time setup:

1. **Keys**: on your computer run `npx web-push generate-vapid-keys`. It prints a public and a private key.
2. **Site**: add the public key as repository secret `VAPID_PUBLIC_KEY`.
3. **Function**: Supabase → **Edge Functions → Deploy a new function → Via editor**, name it `send-reminders`, paste `supabase/functions/send-reminders/index.ts` (replacing the example code), deploy. Then in the function's **Details**/settings, turn **Verify JWT** off (the new API keys aren't JWTs).
4. **Function secrets**: Edge Functions → **Secrets**: `VAPID_PUBLIC_KEY` (public key), `VAPID_PRIVATE_KEY` (private key), `VAPID_SUBJECT` = `mailto:leafkinapp@outlook.com`. The private key goes only here.
5. **Schedule**: **Integrations → Cron → Create job**: name `send-reminders`, schedule `0 * * * *` (every hour), type **Supabase Edge Function**, function `send-reminders`, method POST. (Enable the Cron integration first if asked.)
6. In LeafKin (on the Home Screen): Settings → Reminders → **Turn on reminders**, then **Send a test**.

## Tests

```sh
npm i --no-save @electric-sql/pglite fake-indexeddb
node tests/sql/test-migration.mjs        # schema + security rules, several users, delete account
node tests/sync/test-sync.mjs            # two phones sharing a household, offline queue, import, guest mode
node tests/functions/test-reminders.mjs  # which plants a reminder lists (Node 22.18+)
node tests/check-version.mjs             # README, app and service worker show the same version
```

## Changelog

On `beta` the top entry can be ahead of `live` until it's merged. Each version merged into `live` gets a GitHub release with the same tag (e.g. `v2.1.0`).

- **2.2.0**: photo health check on the phone (own model, suggests symptoms to confirm), sunburn symptom; beta-only Lab to compare it with Pl@ntNet and Kindwise
- **2.1.0**: privacy policy in the app, consent when creating an account, guest privacy note; fonts served with the app (nothing loaded from Google)
- **2.0.0**: accounts with email codes, shared households, sync and offline queue, guest mode, daily push reminders, household activity, delete account, beta site
- **1.5.1**: last version without accounts (plants stored on the phone only)

## Roadmap

Planned and possible features, starting with AI health diagnosis from a photo: see [ROADMAP.md](ROADMAP.md).
