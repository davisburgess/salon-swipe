# Picture Plane — working rules for every session

Davis's personal art-taste swipe app. Live alpha: https://davisburgess.github.io/salon-swipe/alpha/ (each release replaces it in place). Bar: personal, built to pro standard.

## Read first
- `ALPHA.md`: what's built, backend setup, the **To professionalize** list.
- `RELEASES.md`: the release process, and the newest entries show where things stand.
- `ENHANCEMENTS.md`: evaluated ideas not yet built.
- `RECOMMENDER.md`, `INTEGRATIONS.md`: the engine and the art sources.

## Stack
- Buildless ES-module PWA in `alpha/`, served by GitHub Pages from `main`. No bundler.
- Every module must be in the service worker's `SHELL` list in `alpha/sw.js`; a unit test checks this.
- State lives in localStorage under `pp-alpha-v1`.
- NGA and Cleveland collections are static shards in `alpha/data/`, rebuilt monthly by `build-data.yml`, together with `digest.json`.
- The backend is a Cloudflare Worker in `worker/`. It isn't deployed yet; the user adds the secrets.

## Release process (every release)
1. **Version:** bump it in `alpha/sw.js` (`VERSION`) and `alpha/js/config.js`, and add an entry at the top of `RELEASES.md` in plain language.
2. **Impact:** `node tests/impact.mjs <last release commit>`.
3. **Full review:** run every check, not just the impacted ones.
   - `node --test tests/*.test.mjs`
   - Serve the repo root (`python3 -m http.server 8123 --bind 127.0.0.1`), then run `node tests/e2e.mjs test-results`. The argument is the screenshot folder; never point it at `alpha/`.
   - Every feature in `tests/features.mjs` needs a named browser check. Add one for each new feature.
4. **Usability:** at most one small unrequested usability improvement per release, listed in `RELEASES.md` so Davis can veto it. Never change gestures or saved data without asking.
5. **Commit:** commit messages for releases include `[live]`, which triggers the live museum probe in CI. Commit as `git -c user.name="Davis Burgess" -c user.email="davis.burgess@gmail.com"`.
6. **Confirm:** after pushing, check that `Checks` and `pages build and deployment` pass for the commit (`gh run list`).

## Working alongside other sessions
- Pull before starting and again before committing.
- **Only one session ships releases to `main` at a time:** the release owner named in the chat. Other build sessions work on a branch `feat/<topic>` and open a PR; the release owner merges it and assigns the version number.
- Research and planning sessions don't touch code. Their output goes into the docs above, `ENHANCEMENTS.md` or `ALPHA.md`, on a `docs/<topic>` branch or as a doc-only commit.
- Before a long session ends, add a short handoff to the newest `RELEASES.md` entry, or to the relevant list, so the next session can pick up.

## Product rules
- **Rewards:** levels count only your own behavior (decisions and movements). "How well we know you" is the app's score and never affects levels or pins. A model error must never make the experience worse.
- **Quests:** only offer quests that can be filled. Supply is checked against the digest or a live probe first.
- **Pushback:** push back when warranted, and state trade-offs before building.
- **Experts:** for anything larger than a fix, review it with a virtual expert team: product, UX, recommendation engine, gamification, integrations, and legal/terms.

## Writing and privacy
- Smart Brevity style, with plain words in user-facing text.
- Never name Davis's employer anywhere: code, docs, commits or chat.
- Secrets are added by Davis as GitHub secrets. Never ask for them in chat.
