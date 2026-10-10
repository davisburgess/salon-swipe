# Picture Plane (alpha)

Working name for the next version of Salon Swipe. Lives at `/alpha/`, with its own saved data, so `/` and `/beta/` are untouched.

## What's in it
- **Wall and label design.** Works hang at true proportions with a museum-style label; the wall takes a tint of each work's color.
- **Three museums.** Art Institute of Chicago, The Met, Cleveland Museum of Art. Public-domain works only. A museum that fails three times in a row rests for ten minutes.
- **Opening hang.** 34 traditions, one work each, with a one-line wall text (`alpha/js/curation.js`).
- **Taste model.** Online logistic regression over hashed features, including color, brightness and detail measured from the image. Picks mix "likely match", "least sure" and "discovery" (`alpha/js/model.js`, `alpha/js/deck.js`).
- **Decisions.** Keep, pass, love (with optional reasons), later (three deferrals, then undecided), multi-step undo, new style.
- **Progress.** Levels that need range and prediction accuracy, badges, Curator's Notes in four tones.
- **Installable and offline.** Web app manifest and service worker.
- **Sync and AI notes** through the API in `worker/`. Without it, everything works on one device and notes are written offline.
- **Imports** Salon Swipe history on the same site, or any Salon Swipe / Picture Plane backup.

## Backend setup
1. Free Cloudflare account. Open Workers & Pages once to pick a workers.dev subdomain.
2. API token from the "Edit Cloudflare Workers" template, plus D1 edit permission. Note the Account ID.
3. Claude API key from console.anthropic.com.
4. GitHub repo, Settings, Secrets and variables, Actions: add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY`.
5. Actions tab, "Deploy API", Run workflow. It creates the database, deploys, sets the key, checks health, and writes `alpha/api.json`.

## Tests
- `node --test tests/*.test.mjs` runs unit tests and the Worker against real SQLite.
- `IMGDIR=<dir of p0..p5.jpg> node tests/e2e.mjs <out dir>` runs the app in Chromium with mocked museums and the real Worker in-process.

## To professionalize
Ideas evaluated but not yet built live in [ENHANCEMENTS.md](ENHANCEMENTS.md).
What separates this personal alpha from a product others could use. Each item says who acts and what it costs.

| Item | Why | Who / cost |
|---|---|---|
| **Chromecast receiver page** | The slideshow casts today only by mirroring a tab or screen, which keeps the phone or computer busy. A registered Cast receiver lets the TV play the show on its own, with the label, while the phone sleeps. Build a small receiver page in the repo and add a Cast button to the slideshow. | You: register as a Google Cast developer ($5 one time) and add the receiver URL. Me: build the receiver and sender. |
| **Backend keys** | Sync across devices, backup to the cloud, and fuller curator notes need the Worker deployed. | You: add `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ANTHROPIC_API_KEY` as GitHub secrets (see Backend setup). |
| **Real sign-in** | Sync identity is a random key with no email or password. Fine for one person; anyone else needs accounts and recovery. | Me, after the backend is live. |
| **Lock the level ladder** | Levels may still be recalibrated and can demote you. Before anyone else uses the app, levels must only ever go up. | Me, on your go. |
| **Name clearance** | "Picture Plane" is a working name. | An attorney: trademark search. |

## Known gaps
- Museum data quality varies: an anonymous work with a wrong place label can still land in the wrong country (see 0.7.2).
