# Picture Plane releases

How every release ships:
1. **Impact map.** `node tests/impact.mjs <last release>` lists every feature the change touches (down to sections of `app.js`).
2. **Full review, not just the impacted parts.** Every feature in `tests/features.mjs` is checked on every release: unit and backend tests, then a named browser check per feature in `tests/e2e.mjs`. A test fails if the list and the checks drift apart. The run takes about two minutes, so there's no reason to check only part of it. Impact decides what to eyeball on a phone, not what to test.
3. **GitHub re-runs everything on each push** (Actions, "Checks"), and probes the real museum APIs every morning, which the build workspace can't reach. A commit message containing `[live]` runs that probe immediately; every release commit uses it.
4. **At most one small usability improvement per release,** listed here so you can veto it. Never a change to gestures, saved data, or anything you'd have to relearn without asking first.

## 0.7.0-alpha (Oct 8, 2026)

**Change requested by you: quests.**
- **A quest points your next 10, 20 or 30 works at one thing:** a movement, school, era, country, continent, type of work, artist or museum, or somewhere new (countries, movements or centuries you haven't seen). Inside a quest the engine still personalizes: your best matches from the Baroque, not random Baroque.
- **Quests button** beside New style opens the quest board:
  - *For your next badge*, built from your own progress: the missing half of a Lineages pair ("Love an Impressionist work to finish Japonisme"), the country Silk Road still needs, the continent All Six still needs, new countries for Passport, new movements for Grand Tour, new centuries for Time Machine, a work over 2,000 years old for Deep Time.
  - *Go deeper*: your strongest school, your top country, the artist you love most.
  - *Somewhere new*: a school you've barely seen, countries and centuries you haven't.
  - *Make your own*: pick what to look at and how many works.
- **Every badge can start its own quest:** tap a pin, then "Start a quest for this".
- **While on a quest,** a bar above the art shows your progress with an End button, and each card says how many are left.
- **When it's done,** a summary shows how many you kept (against your overall rate), your Loves from the quest, and the pins you earned on the way.
- **New pin, Pilgrim** (bronze to lapis: 1, 5, 15, 40 quests). Medieval pilgrims collected lead-tin badges at shrines. 49 pins.
- **Museum Day and Explore are now quests** under the hood: same cards, same stamps and records, one engine. Your finished ones count toward Pilgrim.
- Quests look in the on-device collections first (by date, type and place), then ask each museum, and keep only works that really count. If a quest runs dry, it says so and returns to everything.

**Review found and fixed**
- Quest suggestions said "love a Impressionist work"; articles now follow the word.
- The quest board numbered cards that have no order; they now carry icons instead.

**Checks:** 55 unit and backend tests (new: quest criteria, labels and searches; badge-linked suggestions), 44 of 44 browser checks (new: quests.board walks the board, makes a 10-work Impressionism quest, finishes it and checks the summary and pins; Museum Day and Explore checks pass on the new engine).
**On your phone:** tap Quests under the art. Start one from "For your next badge", finish it, and read the summary.

## 0.6.0-alpha (Oct 8, 2026)

**Change requested by you: a better recommendation engine.** Full write-up in RECOMMENDER.md.
- **One vocabulary.** Every work now gets a school (most records had no movement at all), a modern country and continent, and an object type. Museums' different labels for the same thing ("Impressionist", "Impressionism") now count as one.
- **A smarter model.** It doesn't let a feature it has seen twice dominate, weighs recent decisions more, learns from works you left undecided, and knows how sure it is.
- **It notices when your taste moves.** If its recent guesses get much worse, or you keep far less than it expected, it forgets faster and looks further afield. Portrait says so: "Your taste seems to be moving."
- **Better candidates.** Besides museum searches, it scores hundreds of National Gallery and Cleveland works on your device each time it refills and keeps the best.
- **Better picking.** Matches avoid repeating the school, country or artist of the last few cards; "learn" picks go where the model knows least; discovery follows an art-historical map of neighbouring schools instead of pure chance.
- Leanings in Taste now show Schools, Countries and Types of work.
- Your existing history is re-read in the new vocabulary automatically.

**How we know it's better:** a simulation lab plays six simulated people over the real 46,600-work catalog. Matches kept rose from 54% to 64%, the fair score from 15 to 19 points, and countries seen from 23 to 37. One case nearly regressed during development (a taste that changes halfway dropped to 27%); drift detection brought it back to parity (41% vs 42%). A test now reruns the lab on every push.

**Checks:** 53 unit and backend tests (new: vocabulary, model, drift, picker, simulation lab), 43 of 43 browser checks.
**On your phone:** just keep swiping. Watch "How well we know you" over the next 50 to 100 decisions; that's the live version of the lab's score.

## 0.5.0-alpha (Oct 7, 2026)

**Change requested by you: the Atlas.** Last of the three Taste releases.
- **A world map with fog of war.** Countries you've judged art from are tinted by how you lean: gold for a pull, slate for a pass, stronger the more works back it up. Everything else is hatched fog. Equal-area projection (Europe isn't inflated), 176 countries from Natural Earth's public-domain outlines, 44 KB, cached for offline.
- **Strongest pull** names your top three countries; a count shows how many countries and continents you've covered.
- **Your Grand Tour:** a dashed line through the countries of your last ten Loves.
- **Tap any country** for its numbers (seen, kept, loved, favorite movement) and the place names museums used for it ("Venetian", "Mughal India"). Countries under fog say so. A list of the countries you've seen does the same for anyone who'd rather not tap a map.
- **Explore:** from any country's panel, your next 12 works come from that country. Every museum is asked, and only works that really come from there are shown. If a country runs dry, it says so and goes back to everything. Finishing earns a new pin, **Expedition** (48 pins).
- **Where and when:** a 5,000-year strip under the map with your Loves and passes. Older centuries are squeezed to fit; the strip scrolls sideways on small screens.
- The jump bar is now Portrait, Badges, Museums, Atlas, Leanings.
- Places are mapped to today's countries, and the Atlas says so: a lens, not history.

**Review found and fixed**
- Five tabs in the jump bar, and the timeline, made the whole Taste page wider than a phone screen, so it slid sideways. The page layout grew to fit its widest piece. The layout is now pinned to the screen width, the tabs are tighter, and wide pieces scroll inside themselves. A new browser check fails if any page is wider than the screen.
- A few countries' names came out wrong ("United States Of America", "Great Britain", "The Netherlands" as an adjective). Names and adjectives are now set explicitly.

**Checks:** 48 unit and backend tests (new: Atlas leanings, route, explore terms, map), 43 of 43 browser checks (new: atlas.explore, which walks a full Explore of Japan and checks the page fits the screen).
**On your phone:** Taste, then Atlas. Tap a gold country, then Explore it. Check that nothing slides sideways.

## 0.4.0-alpha (Oct 7, 2026)

**Change requested by you: Museums.** Second of three Taste releases (the Atlas map is next).
- **Your museum:** the museum whose work you keep most, compared with your overall keep rate. Rates are steadied until a museum has enough decisions, so three lucky keeps don't crown a museum.
- **Passport:** each of the seven sources stamps your passport after 10 decisions there, dated by the decision that earned it. Your history counts, so existing stamps carry their real dates.
- **How often you keep each museum's work:** all seven, ranked.
- **On view now:** how many of your keeps were on a gallery wall when you saw them, by city, with a button to see them in Kept.
- **Museum Day:** pick a museum and your next 20 works come only from it (the opening hang waits). Each card says how many are left. Finishing gilds that museum's stamp and earns a new pin, **Day Tripper** (47 pins now). You can end the day early from Taste.
- The jump bar gains **Museums**: Portrait, Badges, Museums, Leanings.

**Bug you reported: zooming on a Mac**
- The full-size view used the browser's own scrolling, so a two-finger sideways swipe that reached the picture's edge became Back or Forward. It now has its own pan and zoom: two-finger scroll pans, pinch zooms around your fingers, click zooms in where you clicked (and out again), drag pans, and arrow and +/- keys work. None of it reaches the browser.
- The whole app no longer hands sideways swipes to the browser as navigation.

**Review found and fixed**
- Arrow keys pressed while the full-size view was open acted on the work behind it (deciding on it). They now move the picture.
- After jumping to a lower section, the jump bar could highlight the wrong one, because the page couldn't scroll far enough. The tapped section now stays highlighted, and the page has room at the bottom.
- Kept's "On view in Chicago" filter is now "On view" across every museum that reports it.

**Checks:** 47 unit and backend tests (new: museum stats), 42 of 42 browser checks, twice in a row (new: museums.day; wall.zoom now tests sideways scrolling, keys and zoom-out).
**On your Mac:** open a wall text, click the picture, zoom in, and two-finger swipe left and right; it should pan, never go Back. Pinch to zoom.
**On your phone:** Taste, then Museums: check your stamps' dates, then start a Museum Day and finish it.

## 0.3.2-alpha (Oct 7, 2026)

**Change requested by you: separate what you do from how well the app knows you.** A weak model should never cost you a level.

**Rewards now come in three kinds**
- **What you do** (Habits, Explorer, Atlas, Museums, Lineages, The Eye) and **levels**: decisions, movements, likes and passes only. Levels no longer require prediction accuracy, and they never go down from a model dip.
- **Your pattern** (new family): Tried and True or Shape-Shifter, Patron or Juror, Slow Looker or Snap Judgment. Read from your own history, never the model; both ends of each trait earn a pin, and Portrait shows where you sit.
- **You and the app** (new family): Called It (ten right in a row), Open Book, Enigma. The only pins that depend on the app's guesses; earned once, never taken back, never needed for a level.

**How well we know you** (new block on Portrait): the app's own ladder, Stranger to Mind Reader, scored fairly. It compares how often you keep the works the app picked as matches against everything else, so exploration cards and a generous or picky yes-rate don't skew it. It can fall, and it says so in its own voice. "Called it" moved here. This is also the scoreboard for the coming recommendation work.

**Under the hood**
- Each decision now records how its card was picked (match, test, explore, opening hang, second look), and wall texts opened are counted. Older decisions don't have this, so the app's ladder starts at Stranger and needs about 20 new matches.
- Your level is re-read once more; without the accuracy gate it may go up at your next decision.
- The eye title's movement now comes from your own tallies, not the model's weights.
- 46 pins (was 39). Salon Hang moved to Habits.

**Review found and fixed**
- Browsing Wikidata asked for a random slice deep into every painting, which timed out on the live probe (20 seconds), so those cards silently never arrived. Browsing now picks a well-covered movement at a random depth, with fallbacks; it answers in about half a second.
- The undo browser check matched works by title, and museum titles repeat ("Portrait of a Man"), so it could fail by chance. It now matches by each work's id.

**Checks:** 46 unit and backend tests (new: fair app scoring, levels ignore accuracy, pattern pins), 41 of 41 browser checks.
**On your phone:** open Taste. Your level shows decisions and movements only; "How well we know you" says Stranger until about 20 new matches, then gives the two percentages.

## 0.3.1-alpha (Oct 7, 2026)

**Change requested by you: levels for serious looking, demotion allowed.** You're the only user, so the ladder was re-tuned rather than preserved.

| Level | Decisions | Movements | Predicted right |
|---|---|---|---|
| Visitor | 0 | 0 | |
| Docent | 40 | 6 | |
| Collector | 150 | 14 | 60% |
| Curator | 500 | 24 | 65% |
| Connoisseur | 1,200 | 32 | 70% |
| Director | 2,500 | 40 | 72% |

- On first open, your level is re-read from your history once. If it drops, a notice says so, and pin tiers above your new level re-seal until you climb back. Reaching each level again brings its note and its broken seals.
- After that, accuracy only gates promotion: a bad streak never demotes you.
- Seals follow the new ladder: silver at Collector (150), gilt at Curator (500), lapis at Connoisseur (1,200).
- **Before real launch:** lock the ladder, so other users never get demoted.

**Checks:** 43 unit and backend tests, 41 of 41 browser checks (new: taste.recalibrate).
**On your phone:** open the app and check the level chip and the notice; then open Taste, Badges to see which tiers re-sealed.

## 0.3.0-alpha (Oct 7, 2026)

**Change requested by you: a Taste screen worth exploring.** First of three releases (then Museums, then the Atlas map).
- **Badge cabinet:** 39 enamel pins in eight families, each with a rule and a wall label (one true line about art, or a dry one about you). Tap any pin for its detail and progress. Locked pins show in faded full color; the six secret pins stay embossed with a "?" until earned.
- **Tiers with seals:** five pins go bronze, silver, gilt and a new top tier, lapis. Higher tiers count from day one but stay sealed until your level arrives: silver at Collector, gilt at Curator, lapis at Connoisseur. Leveling up shows the seals you broke. Thresholds run higher than the old badges (for example, Salon Hang: 50, 150, 400, then 1,000 keeps).
- **New top level, Director:** 1,500 decisions, 30 movements, 72% predicted. Existing levels are unchanged, so nobody is demoted.
- **Your history counts:** the first time you open this version, your existing decisions earn their pins in one "Your cabinet is open" moment instead of a stream of pop-ups.
- **Portrait:** your eye as a title ("The Moody Old Master"), drawn from the visual quality and movement you keep most; your strongest traits; level progress; and **Called it**, which shows how often the app guessed your last 10 decisions right. The title remembers what it was before.
- **One page, a sticky jump bar:** Portrait, Badges, Leanings. Tap to jump or just scroll; the bar follows along.
- **Place lexicon (groundwork for the Atlas):** maps how museums describe place ("Mughal India, court of Akbar", "Venetian", "Norwegian, 1876–1926") to modern countries. It places 98.8% of National Gallery works and 99.4% of Cleveland's that have any place; the rest stay unknown rather than guessed.

**Review found and fixed**
- The offline cache would have missed the two new modules, which would have broken the app offline. A new test now fails if any module the app imports is missing from the offline list.
- SMK works had no place at all; they now use the artist's nationality, as the National Gallery does.

**Usability improvement:** Kept a pin's progress one tap away: every pin opens its rule, tiers and what's left.

**Pushback, recorded:** you suggested gating which badges are available by level. Every badge counts from the start instead, because a Love that earns nothing feels like cheating. Level gates the *higher tiers* via seals.

**Checks:** 43 unit and backend tests (new: place lexicon, cabinet integrity, seals, lineages and secrets, eye traits and titles, offline shell), 40 of 40 browser checks (new: taste.portrait, taste.jump, badges.ceremony; taste.badges rewritten).
**On your phone:** open the app; you should see "Your cabinet is open." Tap "See them in Taste," tap a pin, and check its wall label. Use the jump bar, then scroll and watch it follow.

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
- Date historical pins by the decision that earned them, not the day the cabinet opened.
- Larger tap targets on the Kept filters at phone width.
- Haptic tick on Android when a drag crosses the decision point.
