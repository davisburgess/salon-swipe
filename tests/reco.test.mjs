// Recommendation engine v2: vocabulary, model behaviour, picker, and a regression run of the simulation lab.
import test from "node:test";
import assert from "node:assert/strict";
import { canonMovement, schoolOf, typeOf } from "../alpha/js/vocab.js";
import { placeOf } from "../alpha/js/geo.js";
import { TasteModel, features, driftFromHistory } from "../alpha/js/model.js";
import { choose, retrieve } from "../alpha/js/recommend.js";
import { matches, label, queries, newQuest, questForBadge, suggestions, critFromBuilder, digestCount, digestMatches, facts } from "../alpha/js/quests.js";
import { readFileSync } from "node:fs";
import { normalizeStatic } from "../alpha/js/sources.js";
import { badgeStats } from "../alpha/js/badges.js";

test("vocabulary: one name per movement, a school for every work, a short list of types", () => {
  assert.equal(canonMovement("Impressionist"), "Impressionism"); assert.equal(canonMovement("Dutch Golden Age painting"), "Dutch Golden Age");
  assert.equal(canonMovement("Yongzheng"), "Qing dynasty"); assert.equal(canonMovement("Neo-Impressionist"), "Pointillism");
  assert.equal(schoolOf(null, placeOf("Dutch"), 1660), "Baroque and Golden Age", "no movement: from country and date");
  assert.equal(schoolOf(null, placeOf("Japan, Edo period"), 1790), "East Asian traditions");
  assert.equal(schoolOf(null, placeOf("Egypt"), -1350), "Antiquity");
  assert.equal(schoolOf("Impressionism", placeOf("France"), 1874), "Impressionism and after");
  assert.equal(typeOf("Photograph", "gelatin silver print"), "Photograph", "a photo printed on paper is still a photo");
  assert.equal(typeOf("Velvet"), "Textiles"); assert.equal(typeOf("Print", "color woodblock print"), "Print");
});

const work = (i, o) => ({ uid: `t:${i}`, title: `W${i}`, src: "nga", ...o });
test("model: learns a clear taste, knows what it doesn't know, rebuilds old decisions in today's vocabulary", () => {
  const m = new TasteModel(), sw = [];
  for (let i = 0; i < 80; i++) {
    const like = i % 2 === 0, a = like ? work(i, { place: "Japan", year: 1800, kind: "Print" }) : work(i, { place: "Italian", year: 1500, kind: "Painting" });
    sw.push({ uid: a.uid, v: like ? 1 : -1, a, f: ["style|old token"] });
  }
  m.fit(sw);
  const jp = features(work(900, { place: "Japan", year: 1820, kind: "Print" })), it = features(work(901, { place: "Italian", year: 1490, kind: "Painting" }));
  assert.ok(m.p(jp) > 0.7 && m.p(it) < 0.3, `Japan ${m.p(jp).toFixed(2)}, Italy ${m.p(it).toFixed(2)}`);
  const unknown = features(work(902, { place: "Peru", year: -200, kind: "Textile" }));
  assert.ok(m.uncertainty(unknown) > m.uncertainty(jp) + 0.3, "unfamiliar work isn't flagged as unfamiliar");
  assert.ok(m.leaning("country", 4).some((x) => x.value === "Japan"), "history rebuilt from the works, not the old tokens");
});

test("model: notices when taste moves, from the guesses saved with each decision", () => {
  const steady = Array.from({ length: 160 }, (_, i) => ({ v: i % 2 ? 1 : -1, p: i % 2 ? 0.8 : 0.2 }));
  assert.equal(driftFromHistory(steady), false);
  const moved = steady.map((s, i) => (i >= 120 ? { v: s.p > 0.5 ? -1 : 1, p: s.p } : s));
  assert.equal(driftFromHistory(moved), true);
});

test("picker: matches avoid repeating the last few cards' school; discovery and learning are labelled", () => {
  const m = new TasteModel(), sw = [];
  for (let i = 0; i < 60; i++) { const a = i % 3 ? work(i, { place: "Dutch", year: 1650, kind: "Painting" }) : work(i, { place: "French", year: 1880, kind: "Painting" }); sw.push({ uid: a.uid, v: 1, a }); }
  m.fit(sw);
  const dutch = Array.from({ length: 5 }, (_, i) => work(100 + i, { place: "Dutch", year: 1655, kind: "Painting" }));
  const french = work(200, { place: "French", year: 1885, kind: "Painting" });
  const r = choose([...dutch, french], { model: m, explore: 0, rand: () => 0.5, recent: dutch.slice(0, 5) });
  assert.equal(r.why, "match"); assert.equal(r.pick, french, "five Dutch cards in a row: the next match should change the subject");
  const seq = [0.05, 0.25]; let k = 0; const rnd = () => seq[k++ % 2];
  assert.equal(choose([...dutch, french], { model: m, explore: 0.5, rand: rnd }).why, "explore");
  assert.equal(retrieve([...dutch, french], m, { k: 3 }).length, 3);
});

test("simulation lab: the new engine beats the old one", async () => {
  process.env.SIM_N = "300"; process.env.SIM_SEEDS = "1";
  const { runEngine, runModelOnly } = await import("./reco-sim.mjs");
  const m = runModelOnly(); assert.ok(m.auc > m.aucV1, `model AUC: v1 ${m.aucV1.toFixed(3)}, v2 ${m.auc.toFixed(3)}`);
  const v1 = runEngine("v1"), v2 = runEngine("v2");
  assert.ok(v2.match > v1.match + 0.04, `matches kept: v1 ${(v1.match * 100).toFixed(0)}%, v2 ${(v2.match * 100).toFixed(0)}%`);
});

test("quests: criteria, labels, searches", () => {
  const dutch = work(1, { place: "Dutch", year: 1660, kind: "Painting", movement: "Dutch Golden Age painting" });
  const jp = work(2, { place: "Japan, Edo period", year: 1830, kind: "Print", movement: "Ukiyo-e" });
  const q = (crit) => newQuest({ swipes: [] }, crit, 20);
  assert.ok(matches(q({ movement: "Dutch Golden Age" }), dutch) && !matches(q({ movement: "Dutch Golden Age" }), jp));
  assert.ok(matches(q({ school: "East Asian traditions", type: "Print" }), jp), "criteria combine");
  assert.ok(matches(q(critFromBuilder("era", "1600:1700")), dutch) && !matches(q(critFromBuilder("era", "1600:1700")), jp));
  assert.ok(matches(q({ iso: "JP" }), jp) && matches(q({ cont: "EU" }), dutch));
  assert.equal(label({ movement: "Baroque" }), "Baroque"); assert.equal(label({ iso: "JP" }), "Works from Japan");
  assert.equal(label({ type: "Print", cont: "AS" }), "Prints from Asia"); assert.equal(label({ yearFrom: 1600, yearTo: 1700 }), "1600–1700");
  assert.deepEqual(queries({ iso: "JP" }, "nga"), ["Japanese"]); assert.deepEqual(queries({ iso: "JP" }, "aic"), ["Japan"]);
  // "Somewhere new": what you've already seen doesn't count.
  const seen = { swipes: [{ uid: "s1", v: 1, a: dutch }] };
  const fresh = newQuest(seen, { newCountry: true }, 20);
  assert.ok(!matches(fresh, dutch) && matches(fresh, jp));
});

test("quests: badges point at the quest that moves them forward", () => {
  const sw = [{ uid: "a", v: 2, a: work(3, { place: "Japan", year: 1830, kind: "Print", movement: "Ukiyo-e" }), f: ["style|Ukiyo-e"] }];
  const st = badgeStats({ swipes: sw, badges: {} }, null), none = () => 0;
  const jq = questForBadge("japonisme", st, {}, none);
  assert.deepEqual(jq.crit, { movement: "Impressionism" }); assert.match(jq.why, /finish Japonisme/);
  const uq = questForBadge("japonisme", { ...st, sides: { impressionist: true } }, {}, none);
  assert.equal(uq.label, "Ukiyo-e prints"); assert.ok(matches(newQuest({ swipes: [] }, uq.crit, 20), work(9, { place: "Japan, Edo period", year: 1830, kind: "Print" })), "an unlabelled Edo print counts, as it does for the pin");
  assert.deepEqual(questForBadge("silk-road", st, {}, none).crit, { iso: "CN" });
  assert.ok(questForBadge("passport", st, {}, none).crit.newCountry);
  assert.equal(questForBadge("japonisme", { ...st, sides: { ukiyo: true, impressionist: true } }, {}, none), null, "nothing left to do");
  const sg = suggestions({ swipes: sw }, null, st, none);
  assert.ok(sg.badge.length >= 1 && sg.badge[0].goal === "japonisme", "a half-finished pair comes first");
  assert.ok(sg.fresh.some((x) => x.crit.newCountry));
});

const digest = JSON.parse(readFileSync(new URL("../alpha/data/digest.json", import.meta.url), "utf8"));
test("quest supply: the digest matches the collections, record for record", () => {
  for (const src of ["nga", "cma"]) {
    const idx = JSON.parse(readFileSync(new URL(`../alpha/data/${src}/index.json`, import.meta.url), "utf8"));
    assert.equal(digest.srcs[src].count, idx.count, `${src} digest is stale: rebuild with node tools/build_digest.mjs`);
    // Spot-check: the facts in the digest are the facts quests use on the real record.
    const shard = JSON.parse(readFileSync(new URL(`../alpha/data/${src}/shard-003.json`, import.meta.url), "utf8"));
    for (const k of [0, 57, 199]) {
      const pos = 3 * idx.shardSize + k, f = facts(normalizeStatic(src, shard[k]) || {}), c = digest.srcs[src].cols, get = (n) => (c[n][pos] < 0 ? null : digest.dicts[n][c[n][pos]]);
      assert.deepEqual([get("iso"), get("school"), get("type"), c.year[pos]], [f.iso, f.school, f.type, f.year], `${src} record ${pos}`);
    }
  }
});

test("quest supply: every quest the board can suggest has the works on this device, before the live museums", () => {
  const empty = { swipes: [] };
  // The China quest that failed in 0.7.0 has thousands of works.
  assert.ok(digestCount(digest, newQuest(empty, { iso: "CN" }, 20), empty) > 1000);
  // Every badge-linked criterion the board can suggest either has 20+ works here, or is one the live museums must fill.
  const st = { sides: {}, keptContinents: new Set(), lovedCountries: new Set(), nCountries: 0, range: 0, centuries: 0, decided: 0 };
  const ids = ["japonisme", "copycat-empire", "gold-standard", "brotherhood", "crossed-paths", "back-to-the-future", "silk-road", "all-six", "deep-time", "wet-paint", "passport", "grand-tour", "time-machine"];
  const thin = [];
  for (const id of ids) {
    const q = questForBadge(id, st, empty, () => 0); if (!q) continue;
    const n = digestCount(digest, newQuest(empty, q.crit, q.total), empty);
    if (n < q.total) thin.push(`${id} ${JSON.stringify(q.crit)}: ${n}`);
  }
  // Known: these come only from the live museums (Wikidata, V&A), which the app checks before offering them.
  assert.deepEqual(thin.map((x) => x.split(" ")[0]).sort(), ["brotherhood", "crossed-paths"], thin.join("; "));
});
