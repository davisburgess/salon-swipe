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

## Known gaps
- Museum adapters for the Met and Cleveland are built from their documented formats and tested with stand-in data; first contact with the live APIs may need small fixes.
- Sync identity is a random key (no email or password). Fine for personal use; a public launch needs real sign-in.
- Name is a working name pending trademark clearance by an attorney.
