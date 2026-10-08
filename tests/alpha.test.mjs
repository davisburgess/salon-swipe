// Unit tests for the alpha's pure modules. Run: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import { parseDimsCm, htmlToParas, workKey, eraOf, mediumFamily } from "../alpha/js/util.js";
import { normalizeAIC, normalizeMet, normalizeCMA, normalizeWikidata, normalizeVAM, normalizeSMK, normalizeStatic, search } from "../alpha/js/sources.js";
import { readFileSync } from "node:fs";
import { TasteModel, features } from "../alpha/js/model.js";
import { Deck, ARTIST_GAP, MAX_DEFERS } from "../alpha/js/deck.js";
import { blank, record, fromSalonSwipe, parseBackup, mergeSwipes, encodeCode, backupPayload } from "../alpha/js/store.js";
import { stats, levelFor, templateNote, profileFacts } from "../alpha/js/rewards.js";
import { OPENING } from "../alpha/js/curation.js";
import { measure } from "../alpha/js/vision.js";

// node lacks atob/btoa escape helpers in some versions; they exist in Node 22.
test("dimension parsing", () => {
  assert.deepEqual(parseDimsCm("73.7 × 92.1 cm (29 × 36 1/4 in.)"), { h: 73.7, w: 92.1 });
  assert.deepEqual(parseDimsCm("H. 29 x W. 36 in. (73.7 x 92.1 cm)"), { h: 73.7, w: 92.1 });
  assert.deepEqual(parseDimsCm("92 x 73 x 2 cm"), { h: 92, w: 73 });
  assert.deepEqual(parseDimsCm("Image: 250 × 380 mm"), { h: 25, w: 38 });
  assert.equal(parseDimsCm("Diam. 12 in."), null);
  assert.equal(parseDimsCm(null), null);
});

test("html to plain paragraphs strips markup", () => {
  assert.deepEqual(htmlToParas("<p>A <em>hazy</em> river.</p><p>Second&nbsp;para &amp; more.</p>"), ["A hazy river.", "Second para & more."]);
  assert.deepEqual(htmlToParas(""), []);
});

test("work keys match copies of the same work but not generic titles", () => {
  assert.equal(workKey({ title: "The Great Wave (Kanagawa oki nami ura)", artist: "Katsushika Hokusai" }), workKey({ title: "The Great Wave", artist: "Katsushika Hokusai" }));
  assert.equal(workKey({ title: "Untitled", artist: "Anyone" }), null);
  assert.equal(workKey({ title: "Bowl", artist: null }), null);
});

test("eras and media", () => {
  assert.equal(eraOf(1872), "1850–1899");
  assert.equal(eraOf(-300), "500–1 BCE");
  assert.equal(mediumFamily("Oil on canvas"), "Oil");
  assert.equal(mediumFamily("Color woodblock print; oban"), "Woodblock print");
});

const aicRaw = { id: 16568, title: "Water Lilies", artist_title: "Claude Monet", artist_display: "Claude Monet\nFrench, 1840–1926",
  date_display: "1906", date_start: 1906, style_title: "Impressionism", classification_title: "painting", place_of_origin: "France",
  medium_display: "Oil on canvas", image_id: "3c27b499-af56-f0d5-93b5-a7f2f1ad5813", color: { h: 200, s: 30, l: 50 },
  thumbnail: { lqip: "data:x", width: 3000, height: 2850, alt_text: "A pond" }, subject_titles: ["water lilies", "ponds"],
  dimensions: "89.9 × 94.1 cm (35 3/8 × 37 1/16 in.)", dimensions_detail: [{ height: 89.9, width: 94.1 }],
  credit_line: "Mr. and Mrs. Martin A. Ryerson Collection", is_on_view: true, gallery_title: "Gallery 243", is_public_domain: true };

test("Chicago normalizer", () => {
  const a = normalizeAIC(aicRaw);
  assert.equal(a.uid, "aic:16568"); assert.equal(a.artistBio, "French, 1840–1926");
  assert.equal(a.movement, "Impressionism"); assert.equal(a.mediumFamily, "Oil");
  assert.deepEqual(a.dimsCm, { h: 89.9, w: 94.1 }); assert.ok(a.image.includes("/full/843,/"));
  assert.equal(a.onView, true); assert.ok(Math.abs(a.ar - 3000 / 2850) < 1e-9);
  assert.equal(normalizeAIC({ ...aicRaw, image_id: null }), null);
  assert.equal(normalizeAIC({ ...aicRaw, is_public_domain: false }), null);
});

test("Met normalizer keeps only public-domain works with images", () => {
  const raw = { objectID: 436535, isPublicDomain: true, primaryImage: "https://images.metmuseum.org/x/large.jpg",
    primaryImageSmall: "https://images.metmuseum.org/x/small.jpg", title: "Wheat Field with Cypresses", artistDisplayName: "Vincent van Gogh",
    artistDisplayBio: "Dutch, Zundert 1853–1890 Auvers-sur-Oise", artistNationality: "Dutch", objectDate: "1889", objectBeginDate: 1889,
    medium: "Oil on canvas", dimensions: "28 7/8 × 36 3/4 in. (73.2 × 93.4 cm)", creditLine: "Purchase, The Annenberg Foundation Gift, 1993",
    classification: "Paintings", tags: [{ term: "Landscapes" }, { term: "Wheat" }], objectURL: "https://www.metmuseum.org/art/collection/search/436535",
    GalleryNumber: "822", culture: "", period: "", country: "" };
  const a = normalizeMet(raw);
  assert.equal(a.uid, "met:436535"); assert.deepEqual(a.dimsCm, { h: 73.2, w: 93.4 });
  assert.deepEqual(a.subjects, ["Landscapes", "Wheat"]); assert.equal(a.gallery, "Gallery 822");
  assert.equal(a.movement, null);
  assert.equal(normalizeMet({ ...raw, isPublicDomain: false }), null);
  assert.equal(normalizeMet({ ...raw, period: "Edo period (1615–1868)" }).movement, "Edo period");
});

test("Cleveland normalizer", () => {
  const raw = { id: 135382, accession_number: "1916.1975", title: "Nathaniel Hurd", creation_date: "c. 1765", creation_date_earliest: 1760,
    culture: ["America"], technique: "oil on canvas", type: "Painting", measurements: "Framed: 91.4 x 78.7 cm; Unframed: 76.2 x 65.4 cm",
    creators: [{ description: "John Singleton Copley (American, 1738–1815)", role: "artist" }], share_license_status: "CC0",
    images: { web: { url: "https://openaccess-cdn.clevelandart.org/1915.534/1915.534_web.jpg", width: "740", height: "900" }, print: { url: "https://x/print.jpg" } },
    wall_description: "<p>Hurd was a silversmith.</p>", url: "https://clevelandart.org/art/1915.534", current_location: "203 American Painting" };
  const a = normalizeCMA(raw);
  assert.equal(a.artist, "John Singleton Copley"); assert.equal(a.artistBio, "American, 1738–1815");
  assert.deepEqual(a.dimsCm, { h: 91.4, w: 78.7 }); assert.deepEqual(a.paras, ["Hurd was a silversmith."]);
  assert.equal(a.onView, true); assert.ok(Math.abs(a.ar - 740 / 900) < 1e-9); assert.equal(a.imageLarge, "https://x/print.jpg");
  assert.equal(normalizeCMA({ ...raw, share_license_status: "Copyrighted" }), null);
});

/* ---------- model ---------- */
const mk = (i, over = {}) => ({ uid: `aic:${i}`, src: "aic", id: i, title: `Work ${i}`, artist: `Artist ${i}`, image: `img${i}`, year: 1880,
  movement: "Realism", place: "France", kind: "painting", mediumFamily: "Oil", subjects: [], ...over });

test("model learns a clear preference and explains it", () => {
  const m = new TasteModel();
  for (let i = 0; i < 40; i++) {
    const likes = i % 2 === 0;
    const a = mk(i, { movement: likes ? "Impressionism" : "Baroque", place: "Elsewhere", artist: null });
    m.learn(features(a), likes ? 1 : -1);
  }
  const pImp = m.p(features(mk(99, { movement: "Impressionism", artist: null })));
  const pBar = m.p(features(mk(98, { movement: "Baroque", artist: null })));
  assert.ok(pImp > 0.7, `Impressionism p=${pImp}`); assert.ok(pBar < 0.3, `Baroque p=${pBar}`);
  const why = m.explain(features(mk(97, { movement: "Impressionism", artist: null })));
  assert.equal(why[0].value, "Impressionism"); assert.equal(why[0].dir, "+");
});

test("fit rebuilds an honest accuracy record and ignores undecided", () => {
  const swipes = [];
  for (let i = 0; i < 60; i++) { const like = i % 3 !== 0; const a = mk(i, { movement: like ? "Ukiyo-e" : "Rococo", artist: null }); swipes.push({ v: like ? 1 : -1, f: features(a) }); }
  swipes.push({ v: 0, f: features(mk(500)) });
  const m = new TasteModel().fit(swipes);
  assert.equal(m.n, 60);
  assert.ok(m.accuracy > 0.8, `accuracy ${m.accuracy}`);
});

/* ---------- deck ---------- */
function fakeSearch(make) { return async (src, q, opts) => make(src, q, opts); }
function deckWith(state, gen) {
  const model = new TasteModel();
  return new Deck({ state, model, search: fakeSearch(gen), isAvailable: () => true, rand: mulberry(7) });
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test("opening hang delivers one work per tradition, in order, labelled", async () => {
  const st = blank(); let n = 0;
  const d = deckWith(st, (src, q) => Array.from({ length: 6 }, () => mk(++n, { movement: null, artist: `A${n}` })));
  await d.refill(); d.topUp(3);
  assert.equal(d.queue[0]._seed.id, OPENING[0].id);
  assert.equal(d.queue[0].movement, OPENING[0].label);
  assert.equal(d.queue[1]._seed.id, OPENING[1].id);
});

test("no repeats: same id, same work under another record, or within one batch", async () => {
  const st = blank(); st.seedIdx = OPENING.length;
  const dupes = () => [mk(1), mk(1), mk(2, { title: "Work 1", artist: "Artist 1" }), mk(3), mk(4)];
  const d = deckWith(st, dupes);
  await d.refill();
  const uids = d.pool.map((a) => a.uid);
  assert.deepEqual(uids.sort(), ["aic:1", "aic:3", "aic:4"]);
  // Judge work 3; a re-fetch must not bring it (or a copy) back.
  record(st, mk(3), 1); d.markSeen(mk(3)); d.pool = [];
  await d.refill();
  assert.ok(!d.pool.some((a) => a.uid === "aic:3"));
});

test("artist spacing holds across the queue when alternatives exist", async () => {
  const st = blank(); st.seedIdx = OPENING.length; let n = 0;
  const d = deckWith(st, () => Array.from({ length: 24 }, () => { n++; return mk(n, { artist: n % 3 === 0 ? "Hokusai" : `Artist ${n}` }); }));
  await d.refill();
  const shown = [];
  for (let i = 0; i < 20; i++) { d.topUp(3); const a = d.queue.shift(); shown.push(a.artist); record(st, a, 1); d.markSeen(a); if (d.pool.length < 8) await d.refill(); }
  shown.forEach((a, i) => { if (a === "Hokusai") assert.ok(!shown.slice(Math.max(0, i - ARTIST_GAP + 1), i).includes("Hokusai"), `Hokusai repeated at ${i}`); });
});

test("Later returns a card 15-25 decisions on; the third deferral is undecided", async () => {
  const st = blank(); st.seedIdx = OPENING.length; let n = 0;
  const d = deckWith(st, () => Array.from({ length: 24 }, () => mk(++n)));
  await d.refill(); d.topUp(3);
  const card = d.queue[0];
  const r1 = d.defer(card);
  assert.ok(r1.entry.due >= 15 && r1.entry.due <= 25);
  for (let i = 0; i < r1.entry.due; i++) { d.topUp(3); const a = d.queue.shift(); record(st, a, -1); d.markSeen(a); d.releaseLater(); if (d.pool.length < 8) await d.refill(); }
  d.topUp(3);
  assert.ok(d.queue.slice(0, 2).some((a) => a.uid === card.uid && a._look === 2), "came back as second look");
  const back = d.queue.find((a) => a.uid === card.uid); d.queue.splice(d.queue.indexOf(back), 1); d.queue.unshift(back);
  d.defer(back);
  const third = { ...back, _look: MAX_DEFERS };
  assert.equal(d.defer(third).undecided, true);
});

test("deferred works aren't fetched again while waiting", async () => {
  const st = blank(); st.seedIdx = OPENING.length;
  const d = deckWith(st, () => [mk(1), mk(2), mk(3)]);
  await d.refill(); d.topUp(1);
  const c = d.queue[0]; d.defer(c); d.pool = [];
  await d.refill();
  assert.ok(!d.pool.some((a) => a.uid === c.uid));
});

/* ---------- store ---------- */
test("Salon Swipe history converts and trains the model", () => {
  const salon = { swipes: [{ id: 27992, v: 2, f: ["style|Impressionism", "artist|Claude Monet"], t: 5, a: { id: 27992, title: "Stacks of Wheat", artist_title: "Claude Monet", image_id: "abc", style_title: "Impressionism" } }],
    later: [{ a: { id: 1, title: "Later one", image_id: "z" }, n: 1, due: 30 }] };
  const conv = fromSalonSwipe(salon);
  assert.equal(conv.swipes[0].uid, "aic:27992");
  assert.ok(conv.swipes[0].a.image.includes("/iiif/2/abc/"));
  assert.equal(conv.later[0].a.uid, "aic:1");
  const code = "SALON1:" + Buffer.from(JSON.stringify(salon)).toString("base64");
  const parsed = parseBackup(code);
  assert.equal(parsed.swipes.length, 1); assert.equal(parsed.app, "salon-swipe");
});

test("backups round-trip and merges keep the newest record", () => {
  const st = blank(); record(st, mk(1), 1); record(st, mk(2), -1);
  const back = parseBackup(encodeCode(backupPayload(st)));
  assert.equal(back.swipes.length, 2);
  const other = blank(); record(other, mk(2), 2); other.swipes[0].t = Date.now() + 1000; record(other, mk(3), 1);
  const added = mergeSwipes(st, other.swipes);
  assert.equal(added, 1); assert.equal(st.swipes.length, 3);
  assert.equal(st.swipes.find((s) => s.uid === "aic:2").v, 2);
});

/* ---------- rewards ---------- */
test("levels need range and accuracy, not just volume", () => {
  const st = blank(); const m = new TasteModel();
  for (let i = 0; i < 120; i++) { const a = mk(i, { movement: "Realism" }); const r = record(st, a, i % 2 ? 1 : -1); m.learn(r.f, r.v); }
  const s = stats(st, m);
  assert.equal(s.range, 1);
  assert.equal(levelFor(s).name, "Visitor", "120 swipes of one movement shouldn't level up");
  const st2 = blank(); const m2 = new TasteModel();
  for (let i = 0; i < 45; i++) { const r = record(st2, mk(i, { movement: `Style ${i % 8}` }), 1); m2.learn(r.f, r.v); }
  assert.equal(levelFor(stats(st2, m2)).name, "Docent");
});

test("offline note draws only on facts we have", () => {
  const st = blank(); const m = new TasteModel();
  for (let i = 0; i < 40; i++) { const like = i % 2 === 0; const r = record(st, mk(i, { movement: like ? "Impressionism" : "Baroque", artist: null }), like ? 2 : -1); if (like) r.why = ["Light"]; m.learn(r.f, r.v); }
  const f = profileFacts(st, m);
  const note = templateNote(f, "Docent", { seed: 1 });
  assert.match(note.text, /Impressionism/); assert.match(note.text, /Baroque/);
  assert.equal(note.title, "You're now a Docent");
  // Consecutive notes differ: new angles, different phrasing, and tone changes the voice.
  const texts = new Set(); let avoid = [];
  for (let i = 0; i < 4; i++) { const n = templateNote(f, null, { seed: 100 + i, avoid }); texts.add(n.text); avoid = avoid.concat(n.angles).slice(-9); }
  assert.equal(texts.size, 4, "four notes, four different texts");
  const a = templateNote(f, null, { seed: 7 }), b = templateNote(f, null, { seed: 7, avoid: a.angles });
  assert.ok(!a.angles.includes(b.angles[0]), "second note leads with a fresh angle");
  const crit = templateNote(f, null, { seed: 7, tone: "critic" }).text;
  for (const [, k, n] of crit.matchAll(/(\d+) of (\d+) kept/g)) assert.ok(+k <= +n, "kept count never exceeds works seen");
  assert.notEqual(templateNote(f, null, { seed: 7, tone: "docent" }).text, templateNote(f, null, { seed: 7, tone: "cheeky" }).text);
});

test("vision measures brightness and warmth", () => {
  const w = 4, h = 4, px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) { px[i] = 230; px[i + 1] = 120; px[i + 2] = 40; px[i + 3] = 255; }
  const v = measure(px, w, h);
  assert.ok(v.warm > 0.5); assert.ok(v.sat > 0.6); assert.equal(v.edges, 0);
});

test("New style replaces the current work without recording a decision", async () => {
  const st = blank(); st.seedIdx = OPENING.length; let n = 0;
  const d = deckWith(st, (src, q) => Array.from({ length: 6 }, () => mk(++n, { movement: null, artist: `A${n}` })));
  await d.refill(); d.topUp(3);
  const current = d.queue[0];
  const res = await d.newStyle();
  assert.ok(res && res.seed);
  assert.equal(d.queue[0]._why, "newstyle");
  assert.equal(res.skipped, current);
  assert.equal(st.swipes.length, 0, "no vote recorded");
  assert.ok(!st.seen[current.uid]);
  assert.ok(d.pool.includes(current), "skipped work can come back later");
});

/* ---------- sources added in 0.2: tested against real responses captured by the probe workflow ---------- */
const live = (f) => JSON.parse(readFileSync(new URL(`./fixtures/live/${f}.body`, import.meta.url), "utf8"));

test("Wikidata normalizer on a real SPARQL response", () => {
  const out = normalizeWikidata(live("wikidata").results.bindings);
  assert.ok(out.length >= 3, `only ${out.length} works`);
  const a = out[0];
  assert.match(a.uid, /^wd:Q\d+$/); assert.ok(a.title && a.artist); assert.equal(a.movement, "Impressionism");
  assert.match(a.image, /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/.+\?width=900$/);
  assert.ok(out.every((x) => !/^Q\d+$/.test(x.title)), "no bare Q-ids as titles");
  assert.equal(new Set(out.map((x) => x.uid)).size, out.length, "one work per item even with several rows");
});

test("V&A normalizer on a real search response", () => {
  const out = live("vam").records.map(normalizeVAM).filter(Boolean);
  assert.ok(out.length >= 1);
  const a = out[0];
  assert.match(a.uid, /^vam:O\d+$/); assert.equal(a.artist, "Jan van Goyen", "maker name flipped to natural order");
  assert.match(a.image, /^https:\/\/framemark\.vam\.ac\.uk\/collections\/.+\/full\/!900,900\/0\/default\.jpg$/);
  assert.equal(a.year, 1628); assert.match(a.url, /^https:\/\/collections\.vam\.ac\.uk\/item\/O\d+\/$/);
});

test("SMK normalizer on a real search response", () => {
  const out = [...live("smk").items, ...live("smk_monet").items].map(normalizeSMK).filter(Boolean);
  assert.ok(out.length >= 4);
  const k = out.find((x) => x.uid === "smk:KMS3427");
  assert.equal(k.artist, "Ludvig Karsten"); assert.equal(k.artistBio, "Norwegian, 1876–1926");
  assert.equal(k.medium, "Oil on canvas"); assert.equal(k.kind, "Painting"); assert.deepEqual(k.dimsCm, { h: 77.9, w: 53.1 });
  const print = out.find((x) => x.uid === "smk:KKS5261"); assert.deepEqual(print.dimsCm, { h: 34, w: 26.9 }, "millimetres converted");
});

test("Cleveland normalizer on a real record prefers wall text and real image", () => {
  const a = normalizeCMA(live("cma_cors").data[0]);
  assert.equal(a.artist, "John Singleton Copley"); assert.ok(a.paras.length >= 1);
  assert.match(a.image, /openaccess-cdn\.clevelandart\.org/);
});

test("static collections: term search and browse over shards", async () => {
  const sample = JSON.parse(readFileSync(new URL("./fixtures/nga-sample.json", import.meta.url), "utf8"));
  const shards = [sample.slice(0, 6), sample.slice(6, 12)];
  const terms = {}; sample.forEach((r, n) => { if (r.s) (terms[r.s] ||= []).push(n); if (r.k) (terms[r.k] ||= []).push(n); });
  const index = { count: 12, shardSize: 6, shards: 2, terms };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.endsWith("/nga/index.json")) return new Response(JSON.stringify(index));
    const m = u.match(/\/nga\/shard-(\d+)\.json$/); if (m) return new Response(JSON.stringify(shards[+m[1]]));
    return new Response("", { status: 404 });
  };
  try {
    const kind = sample[0].k;
    const hits = await search("nga", kind, { limit: 20 });
    assert.ok(hits.length >= 1 && hits.every((a) => a.kind === kind), `term search returned ${hits.map((a) => a.kind)}`);
    assert.ok(hits.every((a) => /^https:\/\/api\.nga\.gov\/iiif\/.+\/full\/!900,900\/0\/default\.jpg$/.test(a.image)));
    const browse = await search("nga", "", { limit: 4 });
    assert.ok(browse.length >= 1 && browse.every((a) => a.uid.startsWith("nga:")));
    assert.deepEqual(await search("nga", "no such movement", {}), [], "a named tradition with no match yields nothing");
    assert.ok((await search("nga", "harvest", { limit: 4, browse: true })).length >= 1, "browsing with an unmatched term still returns works");
    const one = normalizeStatic("nga", sample.find((r) => r.h));
    assert.ok(one.dimsCm && one.onView === null, "NGA works have sizes and no on-view claim");
  } finally { globalThis.fetch = realFetch; }
});

test("Met search uses the paginated v1.1 endpoint (v1 was retired Oct 1, 2026)", async () => {
  const realFetch = globalThis.fetch, urls = [];
  const met = live("met_cors");
  globalThis.fetch = async (url) => {
    const u = String(url); urls.push(u);
    if (/\/v1\/search/.test(u)) return new Response("{}", { status: 410 });
    if (u.includes("/v1.1/search")) return new Response(JSON.stringify(live("met_v11_plain")));
    return new Response(JSON.stringify({ ...met, objectID: +u.split("/objects/")[1] }));
  };
  try {
    const out = await search("met", "sunflowers", { limit: 4 });
    assert.ok(out.length >= 1, "no works");
    assert.ok(urls.some((u) => /\/v1\.1\/search\?.*offset=\d+&limit=\d+/.test(u)) && !urls.some((u) => /\/v1\/search/.test(u)));
  } finally { globalThis.fetch = realFetch; }
});

/* ---------- 0.3: badge cabinet, place lexicon ---------- */
import { BADGES, badgeStats, award, pinState, unsealedAt, reached, byId, eyeTitle, closest, understanding } from "../alpha/js/badges.js";
import { placeOf } from "../alpha/js/geo.js";
import { museumStats } from "../alpha/js/museums.js";
import { countryStats, grandTour, exploreTerm, mapSVG } from "../alpha/js/atlas.js";
const mkSw = (i, v, a = {}, extra = {}) => ({ uid: `t:${i}`, v, t: 1_700_000_000_000 + i * 60_000, f: [a.movement && `style|${a.movement}`, a.year != null && `cent|c${Math.floor(a.year / 100)}`].filter(Boolean), a: { uid: `t:${i}`, title: `W${i}`, ...a }, ...extra });

test("place lexicon maps how museums describe place to modern countries", () => {
  const cases = { "France, 19th century": "FR", "Mughal India, court of Akbar (reigned 1556–1605)": "IN", "Venetian": "IT", "Japan, Edo period (1615–1868)": "JP",
    "American, born England, 1830 - 1904": "US", "Norwegian, 1876–1926": "NO", "Kingdom of the Netherlands": "NL", "Nigeria, Edo peoples, Court of Benin": "NG", "Flemish": "BE", "Persian": "IR" };
  for (const [t, iso] of Object.entries(cases)) assert.equal(placeOf(t)?.iso, iso, t);
  assert.equal(placeOf("Romanesque"), null, "Romanesque isn't Roman"); assert.equal(placeOf("Unknown"), null);
  assert.deepEqual(placeOf("West Africa"), { iso: null, continent: "AF" }, "continent-only places count for continents, not countries");
});

test("cabinet: 49 pins, unique ids, every rule runs on an empty history", () => {
  assert.equal(BADGES.length, 49); assert.equal(new Set(BADGES.map((b) => b.id)).size, 49);
  const st = badgeStats({ swipes: [], badges: {} }, null);
  for (const b of BADGES) assert.equal(reached(b, st), 0, b.id);
});

test("tiers earned beyond your level stay sealed until the level arrives", () => {
  const swipes = Array.from({ length: 30 }, (_, i) => mkSw(i, 1, { movement: `Movement ${i}` }));
  const state = { swipes, badges: {} };
  const st = badgeStats(state, null);
  assert.equal(reached(byId["grand-tour"], st), 2, "30 movements is silver");
  const fresh = award(state, st, 0);
  const gt = fresh.filter((f) => f.b.id === "grand-tour");
  assert.deepEqual(gt.map((f) => [f.tier, f.sealed]), [[1, false], [2, true]], "silver sealed for a Visitor");
  let ps = pinState(state, byId["grand-tour"], st, 0); assert.equal(ps.shown, 1); assert.equal(ps.sealed, 2);
  assert.ok(unsealedAt(state, 2).some((u) => u.b.id === "grand-tour" && u.tier === 2), "reaching Collector breaks the silver seal");
  ps = pinState(state, byId["grand-tour"], st, 2); assert.equal(ps.shown, 2); assert.equal(ps.sealed, 0);
  assert.equal(award(state, st, 2).length, 0, "nothing is awarded twice");
  const near = closest(state, st, 0); assert.ok(near.length >= 1 && near.every((x) => x.frac < 1));
});

test("lineages, secrets and dates come from real-looking history", () => {
  const swipes = [
    mkSw(1, 2, { movement: "Ukiyo-e", year: 1830, place: "Japan" }), mkSw(2, 2, { movement: "Impressionism", year: 1874, place: "France" }),
    mkSw(3, 2, { movement: "Byzantine", year: 1100 }), mkSw(4, 2, { movement: "Impressionism", year: 1880 }), mkSw(5, 2, { movement: "Realism", year: 1855 }),
    mkSw(6, -1, { artist: "Claude Monet", movement: "Impressionism", year: 1890 }), mkSw(7, 2, { year: -1350, place: "Egypt" }), mkSw(8, 1, { year: 1930, place: "Mexico" }),
  ];
  const st = badgeStats({ swipes, badges: {} }, null);
  const got = (id) => reached(byId[id], st) > 0;
  assert.ok(got("japonisme"), "ukiyo-e plus Impressionism"); assert.ok(!got("gold-standard"), "Byzantine alone isn't enough");
  assert.equal(byId["gold-standard"].progress(st).hint, "Done: Byzantine. Still to love: Vienna Secession.");
  assert.ok(got("stendhal"), "five Loves in a row"); assert.ok(got("hot-take"), "passed on a Monet"); assert.ok(got("deep-time")); assert.ok(!got("wet-paint"), "a Keep from 1930 isn't a Love");
  assert.ok(st.countries.has("JP") && st.countries.has("EG") && st.countries.has("MX"));
});

test("eye traits need a clear lean and enough looking; the title follows", () => {
  const counts = new Map([["light|Dark", { p: 30, n: 4, c: 24 }], ["sat|Vivid", { p: 6, n: 14, c: 17 }]]);
  const model = { counts, accuracy: 0.7, leaning: () => [{ value: "Dutch Golden Age", weight: 0.8 }] };
  const swipes = Array.from({ length: 60 }, (_, i) => mkSw(i, i % 3 ? 1 : -1, { movement: i % 3 ? "Dutch Golden Age" : "Rococo" }));   // keeps 2 in 3
  const st = badgeStats({ swipes, badges: {} }, model);
  assert.ok(reached(byId.tenebrist, st) > 0); assert.equal(reached(byId["wild-beast"], st), 0);
  assert.equal(eyeTitle(st, model).title, "The Moody Old Master");
  assert.equal(eyeTitle(badgeStats({ swipes: swipes.slice(0, 10), badges: {} }, model), model), null, "no title before 25 decisions");
});

test("offline shell lists every module the app imports", () => {
  const dir = new URL("../alpha/js/", import.meta.url), seen = new Set(), queue = ["app.js"];
  while (queue.length) { const f = queue.pop(); if (seen.has(f)) continue; seen.add(f);
    for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/from "\.\/([\w-]+\.js)"/g)) queue.push(m[1]); }
  const sw = readFileSync(new URL("../alpha/sw.js", import.meta.url), "utf8");
  for (const f of seen) assert.ok(sw.includes(`"./js/${f}"`), `sw.js SHELL is missing js/${f}`);
});

test("the app is scored fairly: its matches against everything else, never your level", () => {
  const sw = [];
  for (let i = 0; i < 60; i++) sw.push(mkSw(i, i % 10 < 8 ? 1 : -1, {}, { m: "match" }));          // keeps 80% of matches
  for (let i = 60; i < 120; i++) sw.push(mkSw(i, i % 2 ? 1 : -1, {}, { m: i % 3 ? "explore" : "unsure" }));   // 50% of the rest
  const u = understanding({ swipes: sw });
  assert.equal(Math.round(u.matchKeep * 100), 80); assert.equal(Math.round(u.otherKeep * 100), 50);
  assert.equal(u.name, "Mind Reader", `lift ${u.lift}`);
  assert.equal(understanding({ swipes: sw.slice(60) }).name, "Stranger", "no score without matches");
  // A generous user doesn't flatter the app: keeping everything gives no lift.
  const generous = sw.map((x) => ({ ...x, v: 1 }));
  assert.equal(understanding({ swipes: generous }).rung, 1);
});

test("levels ignore prediction accuracy entirely", () => {
  const st = { decided: 600, range: 30, accuracy: 0.3 };
  assert.equal(levelFor(st).name, "Curator", "a weak model can't hold you back");
  assert.ok(levelFor(st).next.needs.every((n) => !/accuracy/.test(n.label)));
});

test("pattern pins: both ends of a trait earn a pin", () => {
  const mkRun = (n, keepEvery) => Array.from({ length: n }, (_, i) => mkSw(i, i % keepEvery === 0 ? 1 : -1, { movement: i < n - 100 ? "Baroque" : "Cubism" }));
  const shifting = badgeStats({ swipes: mkRun(240, 4), badges: {} }, null);
  assert.ok(reached(byId["shape-shifter"], shifting) && !reached(byId["tried-and-true"], shifting), `steadiness ${shifting.steadiness}`);
  assert.ok(reached(byId.juror, shifting), "keeps 25%");
  const steady = badgeStats({ swipes: Array.from({ length: 240 }, (_, i) => mkSw(i, 1, { movement: i % 2 ? "Baroque" : "Rococo" })), badges: {} }, null);
  assert.ok(reached(byId["tried-and-true"], steady) && reached(byId.patron, steady));
  assert.ok(reached(byId["snap-judgment"], steady), "never deferred or read a wall text");
});

test("museums: stamps dated by the tenth decision, keep rates that don't overreact", () => {
  const sw = [];
  for (let i = 0; i < 12; i++) sw.push(mkSw(i, i < 9 ? 1 : -1, { src: "nga" }));
  for (let i = 12; i < 22; i++) sw.push(mkSw(i, -1, { src: "met" }));
  sw.push(mkSw(30, 1, { src: "vam" }));
  const ms = museumStats({ swipes: sw });
  assert.equal(ms.by.nga.stampAt, sw[9].t, "stamped on the tenth decision");
  assert.equal(ms.by.vam.stampAt, null); assert.equal(ms.home.src, "nga");
  assert.equal(ms.ranked.length, 2, "a single V&A keep doesn't rank");
  assert.ok(ms.by.met.score > 0, "zero keeps out of ten is pulled toward your overall rate");
});

test("atlas: country leanings, Grand Tour route, explore terms, map", () => {
  const sw = [];
  for (let i = 0; i < 8; i++) sw.push(mkSw(i, 2, { place: "Japan, Edo period" }));
  for (let i = 8; i < 16; i++) sw.push(mkSw(i, -1, { place: "Mexico" }));
  sw.push(mkSw(16, 2, { place: "Venetian" }), mkSw(17, 2, { place: "Venetian" }), mkSw(18, 2, { artistBio: "Norwegian, 1876–1926" }), mkSw(19, 1, { place: "Unknown" }));
  const cs = countryStats({ swipes: sw });
  assert.deepEqual(Object.keys(cs.by).sort(), ["IT", "JP", "MX", "NO"], "Unknown stays unknown");
  assert.ok(cs.by.JP.lean > 0.5 && cs.by.MX.lean < -0.5, `JP ${cs.by.JP.lean}, MX ${cs.by.MX.lean}`);
  assert.equal(cs.pulls[0].iso, "JP"); assert.ok(cs.by.JP.places.has("Japan"));
  assert.deepEqual(grandTour({ swipes: sw }), ["JP", "IT", "NO"], "repeats in a row collapse");
  assert.equal(exploreTerm("JP", "nga"), "Japanese"); assert.equal(exploreTerm("JP", "aic"), "Japan"); assert.equal(exploreTerm("XX", "aic"), null);
  const world = JSON.parse(readFileSync(new URL("../alpha/data/world.json", import.meta.url), "utf8"));
  const svg = mapSVG(world, cs, { selected: "JP", tour: ["JP", "IT"] });
  assert.equal((svg.match(/class="seen/g) || []).length, 4); assert.ok(/class="fog/.test(svg) && /class="route"/.test(svg) && /seen sel/.test(svg));
});
