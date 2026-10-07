# Picture Plane releases

How every release ships:
1. **Impact map.** `node tests/impact.mjs <last release>` lists every feature the change touches (down to sections of `app.js`).
2. **Full review, not just the impacted parts.** Every feature in `tests/features.mjs` is checked on every release: unit and backend tests, then a named browser check per feature in `tests/e2e.mjs`. A test fails if the list and the checks drift apart. The run takes about two minutes, so there's no reason to check only part of it. Impact decides what to eyeball on a phone, not what to test.
3. **GitHub re-runs everything on each push** (Actions, "Checks"), and probes the real museum APIs every morning, which the build workspace can't reach. A commit message containing `[live]` runs that probe immediately; every release commit uses it.
4. **At most one small usability improvement per release,** listed here so you can veto it. Never a change to gestures, saved data, or anything you'd have to relearn without asking first.

## 0.2.0-alpha (Oct 6, 2026)

**Change requested by you: more art.** Seven sources instead of three, roughly 46,000 more works on disk plus four live collections.
- **National Gallery of Art** (Washington): 22,461 public-domain works with images, from its open dataset. Strong in European painting, American art and folk art.
- **Wikidata and Wikimedia Commons:** paintings by artists who died before 1955, searchable by movement or artist. Fills the modern gaps: Futurism, Vienna Secession, Der Blaue Reiter, Fauvism, Expressionism.
- **Victoria and Albert Museum** (London): decorative arts, Mughal and South Asian painting, Arts and Crafts, Pre-Raphaelites. Images are for personal, non-commercial use only; Settings says so.
- **SMK, National Gallery of Denmark:** Danish Golden Age and Nordic painting. Titles are often in Danish; types, techniques and nationalities are translated.
- **Five new traditions** in the opening hang (39 total): American folk art, Danish Golden Age, Futurism, Vienna Secession, Der Blaue Reiter. Existing traditions now draw from the best-suited source.

**Review found and fixed**
- **The Met went dark on Oct 1.** The Met retired the search endpoint the app used and now answers it with "410 Gone"; every Met request has failed since then, with the other museums quietly covering. The app now uses the Met's replacement (v1.1, paginated).
- **The nightly museum probe could never fail.** Its output went through a pipe that swallowed the exit code, which is how the Met outage went unflagged for five days. It now fails loudly, posts its results where they can be read without the logs, and identifies itself like a browser, so museum bot shields don't produce false alarms. Chicago's image server challenges all data-center robots; the probe recognises that challenge instead of reporting an outage.
- **Cleveland never worked in a browser.** Its API sends no cross-origin permission, so every Cleveland request from the app failed silently and the other museums covered for it. Cleveland now loads from its open dataset (24,141 CC0 works with images), rebuilt monthly on GitHub along with the National Gallery's.
- Browsing (outside the opening hang) sent words like "portrait" to Wikidata as if they were movement names and got nothing back. Browsing now takes a random slice of each collection when a word doesn't match.

**Usability improvement:** Kept loads faster. Tiles now request small images from every museum that can resize them, not just Chicago.

**Checks:** 37 unit and backend tests (new: Wikidata, V&A, SMK and Cleveland normalizers run against real responses captured from each API; static collection search; Met v1.1 search), 37 of 37 browser feature checks, twice in a row (new: sources.mix, which fetches each new tradition through the deck and requires the right museum for each). Three older checks that assumed only Chicago, the Met and Cleveland were made deterministic. The live probe covers all seven sources and runs on every release commit.
**On your phone:** swipe about 40 works and open Kept. You should see museum names beyond Chicago and the Met. Open the wall text on a V&A or SMK work. In Settings, check that seven museums are listed and the V&A note shows. Look for a Met work again; you haven't seen one since Oct 1.

## 0.1.2-alpha (Oct 6, 2026)

**Change requested by you**
- Decide straight from the wall text. A bar at the bottom (Pass, Later, Keep, Love) sits where your thumb is, and swiping the panel right or left keeps or passes, the same as the card. Scrolling the text still works normally. A one-line hint shows the first three times.
- Not shown when you open a work from Kept, since you've already decided on it.

**Review found and fixed**
- On a computer, dragging the panel past the window edge didn't register. The drag now follows the pointer off-screen.
- Dragging on the picture in the wall text could start an image drag instead of a swipe.

**Checks:** 31 unit and backend tests, 36 of 36 browser feature checks (new: wall.decide).
**On your phone:** open the wall text, scroll it, then swipe the panel right; the next work should appear. Try the Keep button in the bar too.

## 0.1.1-alpha (Oct 5, 2026)

**Review found and fixed**
- Arrow keys did nothing while the wall text was open, including the wall text that opens on its own for a second look. They now close it and act on the work.
- Leaving the page could save an older copy of your data over a newer one written by another tab. Changes are now saved only when they happen, and a tab reloads if another tab changes your collection.
- A Later card that had come back but wasn't decided yet could be lost if you closed the app at that moment. It's now saved.

**Usability improvement**
- The opening hang shows your place: "Opening hang 4 of 34: Baroque".

**Checks:** 31 unit and backend tests, 35 of 35 browser feature checks.
**On your phone:** glance at three works (art fills the space, label sits just under it).

## 0.1.0-alpha (Oct 5, 2026)
First alpha: gallery-wall design, three museums, opening hang, taste model, Later, New style, levels, badges, Curator's Notes, Kept with favorites, sync and backups, installable and offline.

## Usability backlog (small, one per release unless you say otherwise)
- Show "Undo" in the toast for a few seconds after each decision.
- Let the Kept grid sort by newest, artist, or date made.
- Remember scroll position in Kept when you come back from the wall text.
- Show a one-line "why this was picked" on Kept tiles you loved from a New style.
- Larger tap targets on the Kept filters at phone width.
- Haptic tick on Android when a drag crosses the decision point.
