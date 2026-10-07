# Picture Plane releases

How every release ships:
1. **Impact map.** `node tests/impact.mjs <last release>` lists every feature the change touches (down to sections of `app.js`).
2. **Full review, not just the impacted parts.** Every feature in `tests/features.mjs` is checked on every release: unit and backend tests, then a named browser check per feature in `tests/e2e.mjs`. A test fails if the list and the checks drift apart. The run takes about two minutes, so there's no reason to check only part of it. Impact decides what to eyeball on a phone, not what to test.
3. **GitHub re-runs everything on each push** (Actions, "Checks"), and probes the real museum APIs every morning, which the build workspace can't reach.
4. **At most one small usability improvement per release,** listed here so you can veto it. Never a change to gestures, saved data, or anything you'd have to relearn without asking first.

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
