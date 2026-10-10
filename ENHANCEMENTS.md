# Enhancements

Ideas evaluated but not built. Each list says what's feasible now, what it depends on, and the order we'd build it in. Separate from the launch list in [ALPHA.md](ALPHA.md#to-professionalize).

## Buy or visit art you love

Evaluated Oct 10, 2026, not started. The goal is to link from "I love this" to owning something like it, especially at low prices, or seeing it in person locally.

**The core constraint is matching, not linking.** The taste model learns from museum metadata: movement, country, century, medium and artist. A $40 Etsy watercolor or a thrift-store oil has none of that, only a seller's title and a photo. Recommending listings that fit your taste needs **image similarity**. Until that exists, anything shown is a search and must be labeled as one, not presented as a taste pick.

### The list, in build order

| # | Enhancement | Needs the backend? | Depends on | Effort |
|---|---|---|---|---|
| 1 | **"Own one like this" search links** on the wall text and in Kept. They open searches on Etsy, eBay, ShopGoodwill and Chairish, built from the work's style, subject and medium, plus "original" and a price ceiling set in Settings. | No | Nothing | ~1 release |
| 2 | **Print of the exact work** from a museum shop where one exists. The Met's custom-print pages appear to use the same object IDs as its collection API ([example](https://customprints.metmuseum.org/detail/488822/cole-clouds)); verify before building. | No | Check museum print-shop URL schemes | Part of #1 |
| 3 | **Image similarity for museum works.** The monthly build job computes image fingerprints for the National Gallery and Cleveland collections, as it already builds the quest index; the comparison runs on the device. This improves the main deck as well as shopping. | No | Model choice; size of the fingerprint file | 2–3 releases |
| 4 | **Local art: hand-kept Atlanta list** of studios, open-studio dates (e.g. [Atlanta Contemporary Open Studios](https://atlantacontemporary.org/programs/open-studios), spring and fall) and university galleries, folded into the Museums tab. | No | Someone keeps it current | ~1 release, then upkeep |
| 5 | **Galleries near you** via Google Places, with a browser key locked to the app's address and a spending cap. Free up to 5,000 calls a month, then about $32 per 1,000 ([pricing](https://openplacesapi.com/blog/google-places-api-pricing)). | No | Google Cloud key and billing cap | ~1 release |
| 6 | **Live eBay listings in the app, including search by image**, the best fit for "find me something like this" ([API](https://www.developer.ebay.com/api-docs/buy/browse/resources/item_summary/methods/searchByImage)). | **Yes** (eBay's secret must stay on a server) | Backend keys; eBay production approval and contract | 2 releases |
| 7 | **Live Etsy listings in the app.** Requires Etsy to approve the app's purpose, listings no more than 6 hours old, and a "not endorsed by Etsy" line ([API terms](https://www.etsy.com/legal/api)). | **Yes** | Backend keys; Etsy approval; ideally #3 | 2 releases |

### Sources ruled out
- **ShopGoodwill:** no official API. Only hidden internal endpoints exist; don't scrape. Search links only.
- **Artsy:** its public API is being retired, can vanish without notice, and is non-commercial only ([notice](https://developers.artsy.net/)).
- **Chairish, Saatchi Art, 1stDibs:** no public APIs found. Search links only.
- **Eventbrite** event search: closed to the public (as far as we know, since 2020).
- **Affiliate programs:** skip while there's one user. Etsy's program (run by Rakuten) doesn't list apps as an approved channel ([terms](https://www.etsy.com/affiliates/terms)).
- **Publishing Etsy snapshots from a scheduled job:** technically possible within the 6-hour rule, but it republishes Etsy's listings on a public site.

### Product guardrails
- Buying stays out of the Look deck. It lives in the wall text and in Kept.
- No badges or rewards for spending.
- No prices on cards and no "deals" language.
- Results not ranked by the taste model are labeled as searches.
- A price ceiling setting applies to every link and listing.
