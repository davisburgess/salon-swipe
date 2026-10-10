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

## Backend choice (researched Oct 10, 2026)

**Decision: keep Cloudflare Workers + D1.** It's already built and tested, it's free at one user, and it costs $5 a month once others join. No alternative beats it on all three goals: ease, reliability, price.

**What the backend does:** syncs decisions between devices, proxies the Claude API for Curator's Notes, and will hold keys for Smithsonian, Harvard, eBay and Etsy. That's a small API plus a small database, not an app platform.

**Our usage against the free plan** ([Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)):

| Free limit | Picture Plane, one user |
|---|---|
| 100,000 requests a day | Dozens |
| 10 ms CPU per request | Fine. Waiting on Claude doesn't count as CPU, and sync is capped per request. |
| D1: 5M rows read, 100K written a day, 5 GB | A few hundred writes on a heavy day; well under 1 MB stored |

**One change to know:** since Sep 1, 2026, D1's free limits are enforced. Past a limit, queries fail until midnight UTC; data is safe ([changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)). For one user that's a feature: no surprise bills. When anyone else uses the app, move to Workers Paid ($5/month).

**The real cost is the Claude API, not hosting.** The Worker's daily note cap (`NOTES_PER_DAY`) is the spending control. Also set a monthly limit in the Anthropic console.

**Alternatives considered**

| Option | Verdict |
|---|---|
| **Supabase** | Ruled out. Free projects pause after 7 days without activity and must be woken by hand ([guide](https://www.jetadmin.io/blog/supabase-pricing-2026-guide-to-plans-limits-and-real-world-costs/)). Pro is $25/month. Revisit only if we need its built-in auth and Postgres. |
| **Firebase** | Ruled out. Server code (Cloud Functions), needed to hide API keys, requires the pay-as-you-go Blaze plan with a card on file. Spark shuts Firestore off for the rest of the month if a quota is exceeded ([plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)). |
| **Convex** | Good developer experience, free tier exists, $25 per developer per month for Pro ([pricing](https://www.convex.dev/pricing)). Would mean a rewrite for no gain. |
| **Turso** | Generous free database (5 GB, 500M reads a month), but it's only a database; we'd still need Workers for the API ([summary](https://costbench.com/software/database-as-service/turso/free-plan)). D1 does the same job in one account. |
| **GitHub as storage** (gists, repo files) | Ruled out. Would put a GitHub token in the browser. |

**When to revisit:** real sign-in for other people (see To professionalize). Options then: Cloudflare Access or a passkey library on the Worker, versus Supabase Auth. Decide in a planning chat.

**Build follow-ups (for a build chat)**
- `deploy-api.yml` installs `wrangler@3`; Wrangler 4 is current. D1 commands behave the same; Node 20 is fine ([upgrade guide](https://developers.cloudflare.com/workers/wrangler/migration/update-v3-to-v4)). Bump before the first deploy.
- Map D1's new "exceeded daily row limit" errors to a plain message ("Sync is paused until tomorrow") rather than a generic failure.

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
