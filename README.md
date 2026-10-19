# LeafKin

A plant care app that installs on your iPhone home screen as a Progressive Web App (PWA). No App Store, no developer certificates.

## What it does

- Add plants by **scanning** them (Pl@ntNet suggests up to 5 species) or by typing, with **autocomplete** in English, Dutch or Latin
- **Varieties** (cultivars such as Peace lily 'Diamond Sensation'): pick one after a scan or type it; each plant is saved as its exact type. Pl@ntNet itself only identifies species.
- **Fills care in automatically** from a built-in library of 245 plants and 89 varieties (houseplants, succulents, orchids, herbs, balcony plants): light, direct sun hours, watering style, humidity, pet safety, watering and feeding intervals
- Watering and feeding reminders in the app, sorted by what needs attention first, with one-tap logging and undo
- **Health check**: take a photo, tick what you see, and get the likely causes and a few short fixes
- **Growth timeline**: dated photos and heights, a height chart, and a then-and-now comparison
- Spot-aware care: room and window position set the light, and the light adjusts the watering and feeding interval
- Compact list grouped by what's due, with search and room filters for big collections
- Optional icon badge, backup and restore
- Works offline once installed. All data stays on the device (IndexedDB).

## Project layout

```
index.html              app page + startup animation
manifest.webmanifest    PWA manifest (name, icons, standalone display)
sw.js                   service worker (offline cache) — bump VERSION on every release
css/app.css             styles, light and dark
js/app.js               UI
js/db.js                on-device storage (the only file to swap for Supabase later)
js/care-library.js      care labels, autocomplete, scan matching
js/plant-data.js        the plant care profiles (add new plants here)
js/plantnet.js          Pl@ntNet species identification
js/config.js            site settings filled in at deploy time (keep empty in git)
js/health.js            symptom-based health check
js/conditions.js        spot → light → watering adjustment
js/util.js              dates, image resizing
icons/                  app icons
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
2. Merge into `main`. The workflow publishes the site to `https://caseystijlaart.github.io/LeafKin/`.

### Testing a branch on your phone

Pushes to `pwa-*` branches deploy too. Allow them once under **Settings → Environments → github-pages → Deployment branches and tags → Add rule** with the pattern `pwa-*`. There is only one site, so a branch deploy replaces what `main` published; push to `main` again to go back.

## Plant scanning (Pl@ntNet, free)

1. Create an account at [my.plantnet.org](https://my.plantnet.org) and generate an API key (free plan: 500 identifications per day).
2. In the key settings, tick **expose my API key** and add `https://caseystijlaart.github.io` under **Authorized domains** (add `http://localhost:8080` too for local testing).
3. In this repo: **Settings → Secrets and variables → Actions → New repository secret**, name `PLANTNET_API_KEY`, paste the key.
4. Re-run the deploy (push to `main`, or **Actions → Deploy to GitHub Pages → Run workflow**).

The workflow writes the key into `js/config.js` on the published site only; the file in the repo stays empty. Every device then scans without setup. A key typed in the app's Settings overrides it on that device.

Note: anyone who opens the site can see the key in its source. The authorized-domain setting stops other websites from using it; to also block use from scripts and servers, list an IP range in the key's authorized IPs.

## Install on iPhone / iPad

Open the site in Safari → Share → **Add to Home Screen**. Data saved in the installed app is kept separately from Safari, so install first, then add your plants.

## Not in this version

- Push notifications (planned with Supabase: Web Push + a daily scheduled function)
- Sync between devices (use Backup → Restore for now)
- AI photo diagnosis: the health check works from the symptoms you tick
