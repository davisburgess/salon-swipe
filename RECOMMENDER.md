# Picture Plane recommendation engine (v2, 0.6.0)

## What the team found in v1
- **Most works had no style at all.** About 70% of National Gallery records and all of Cleveland's have no movement, so the model saw only artist, raw place text and type for them. Museums also label the same thing many ways ("Impressionist", "Dutch Golden Age painting", "France, 19th century"), which split one taste across many features.
- **Rare features ruled.** A feature seen twice could carry as much weight as one seen fifty times.
- **No sense of change.** Every decision counted equally forever, and the learning rate kept shrinking, so a shift in taste was averaged away.
- **Small, accidental candidate pools.** The deck picked the best of whatever two dozen works one museum search returned.
- **Exploration was random,** not aimed at anything.

## What changed
| Piece | v1 | v2 |
|---|---|---|
| Vocabulary | Raw museum strings | One vocabulary (`vocab.js`, `geo.js`): canonical movement, a **school** for every work (from movement, or country and date), modern country and continent, object type, museum |
| Pairs | None | Type x school ("Japanese prints" vs "Japanese ceramics"), country x century |
| Rare features | Same treatment as common | Shrunk toward zero until seen enough |
| Time | All decisions equal | Recent decisions weigh more (half-life about 500); learning never freezes |
| Undecided | Ignored | Teaches "ambivalent" |
| Taste change | Not detected | **Drift detection**: when recent guesses get much worse, or you keep far less than expected, the model forgets faster and the deck explores more. Portrait says so. |
| Candidates | One search, about 24 works | Plus on-device scoring of hundreds of National Gallery and Cleveland works per refill |
| Picking | Match / unsure / random | **Match** (best predicted, no repeating the last few cards' school, country or artist), **Learn** (where the model knows least), **Discover** (neighbouring schools on an art-historical map, or barely-seen ones; evenly across schools during a drift) |
| Searches | Favourite movements | Favourite movements, artists, countries and schools, plus neighbours and unexplored schools |

## How it was tested
`tests/reco-sim.mjs` plays six simulated people over the real 46,600-work catalog, with 500 decisions and 3 seeds each. Every person's taste includes a large per-work component no model can see. A unit test reruns a short version on every push and fails if v2 stops beating v1.

| Result | v1 | v2 |
|---|---|---|
| Matches kept | 54% | 64% |
| True odds a match is liked | 54% | 65% |
| Fair score (match keeps minus everything else) | 15 pts | 19 pts |
| Countries seen in 500 decisions | 23 | 37 |
| Model ranking quality, AUC (ceiling 0.735) | 0.649 | 0.672 |
| Changing taste: matches kept | 42% | 41% (was 27% before drift detection) |

Caveat: simulated tastes are written in country, date, type and artist, which is closer to v2's vocabulary than v1's, so the size of the gap is optimistic. The real test is "How well we know you" in the app, which scores the live engine the same fair way.

## Not yet
- **Image similarity.** Embeddings of each picture would let the model learn "looks like this" across schools. It needs a one-time offline pass over the collections (a GitHub workflow), then a small file per collection.
- **Your real history in the lab.** With a backup file, the lab can replay your actual decisions and tune on them.
- **Quests** (next release). Museum Day and Explore are already "focus" constraints on the deck; quests generalize them to any criterion (movement, era, place, artist, type) and to the next badge.
