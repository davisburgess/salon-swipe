# Art source integrations

What feeds Picture Plane, what's next, and what needs real product work. Every source was checked from GitHub Actions (`.github/workflows/probe.yml`) for live responses and cross-origin (CORS) headers. CORS decides whether a browser app can call an API directly; without it, data must come through the Worker or a prebuilt dataset.

## Live now (0.2.0)

| Source | How | Licence | Strength |
|---|---|---|---|
| Art Institute of Chicago | Live API, CORS open | CC0 public-domain images | Impressionism, modern, Japanese prints |
| The Met | Live API, CORS open | CC0 Open Access | Breadth across 5,000 years |
| National Gallery of Art | Open dataset (GitHub), rebuilt monthly; IIIF images | CC0 | European and American painting, folk art |
| Cleveland Museum of Art | Open dataset (GitHub), rebuilt monthly | CC0 | Asian, Egyptian, Islamic, medieval |
| Wikidata + Wikimedia Commons | Live SPARQL, CORS open | Public domain (artists died before 1955) | Modern movements other museums lack |
| Victoria and Albert Museum | Live API, CORS open | Personal, non-commercial only | Decorative arts, South Asia, Arts and Crafts |
| SMK (Denmark) | Live API, CORS open | Public domain | Danish Golden Age, Nordic painting |

## Next: moderate work

Ranked by art added per unit of effort.

1. **Europeana.** Aggregates thousands of European museums; strongest single addition. Free personal key; CORS open. Needs rights filtering (`reusability=open`) and quality filtering, since records vary widely. *About a day.*
2. **Rijksmuseum.** Rembrandt, Vermeer, Dutch Golden Age at depth. The current API is Linked Art: search returns only IDs, so each work needs a second lookup. Best done as a prebuilt dataset, like Cleveland. *One to two days.*
3. **Smithsonian Open Access** (Freer and Sackler, American Art, Cooper Hewitt). Free api.data.gov key. Keep the key in the Worker, which proxies requests. *About a day once the Worker is deployed.*
4. **Harvard Art Museums.** Excellent metadata and wall text. Free key (the probe got 401 without one); same Worker proxy. Images are not all CC0, so filter by rights. *About a day.*
5. **Wikipedia summaries as wall text.** Wikidata works link to Wikipedia articles; a one-paragraph summary would fill the wall text for Wikidata and SMK works, which currently show facts only. CORS open, no key. *Half a day.*
6. **Paris Musées** (Petit Palais, Musée Carnavalet), **Te Papa** (New Zealand), **Finnish National Gallery**. Each needs a key or a dataset build; each adds a distinct regional strength. *A day each.*
7. **Getty and Yale (LUX).** Linked Art APIs with strong provenance. Same two-step pattern as Rijksmuseum; do after it, reusing the code. *A day each after Rijksmuseum.*

## Later: product work, not just plumbing

- **User accounts.** Replace the sync key with passkeys or Sign in with Apple/Google. Unlocks everything below. Requires a privacy policy rewrite, account deletion and data export. The Worker and database already exist, so this is mostly identity plus migration of existing keys.
- **Friends and taste matching.** Compare tastes, see where you overlap, swap Kept collections. Needs accounts, consent and abuse controls.
- **Shared and public collections.** Publish a Kept board as a link. Needs moderation for user text and rights checks on V&A images (non-commercial only).
- **Living artists and post-1955 work.** The biggest gap. Requires licences, not APIs: gallery partnerships (Artsy-type marketplaces), rights agencies such as ARS or DACS, or artists opting in directly. This is a commercial and legal workstream; it decides whether the product can recommend art people can actually buy.
- **Museum partnerships.** Exhibition feeds, "on view near you," and ticket links. Turns taste into visits, a plausible revenue line.
- **User uploads.** "Rate this piece I saw." Needs storage, moderation, and an image-rights policy.
- **Google Arts and Culture.** Huge and polished, but no public API. Only reachable through a partnership.

## Rules for adding a source

1. Probe it from GitHub first: response shape and CORS headers, committed to `tests/fixtures/live`.
2. Use public-domain or CC0 images only, unless the licence is shown in Settings (as for the V&A).
3. Write a normalizer with a unit test against the real captured response, add it to `tests/features.mjs`, and add it to the nightly live probe.
4. No CORS means a prebuilt dataset (GitHub Actions) or a Worker proxy, never a public CORS relay.
5. Keys live in the Worker, never in the app.
