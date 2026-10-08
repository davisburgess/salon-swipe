// Recommendation lab: plays simulated people with known tastes against the old engine (v1) and the new one (v2),
// over the real National Gallery and Cleveland catalogs (about 46,000 works).
//
// Two experiments:
//   A. Model only: both models predict the same sequence of random works, each prediction made before the decision is
//      revealed. Measures how fast and how well each model learns (AUC, log loss). Picking strategy plays no part.
//   B. Full engine: each engine chooses what to show and learns from the answers. Measures how often its "matches" are
//      kept, the gap over everything else (the app's fair score), and how widely it roams.
//
// Honest caveat: a simulated person's taste has to be written in some vocabulary. Ours is country, date, object type and
// a few artists, plus a large per-work "you just like it or you don't" component no model can see. That vocabulary is
// closer to v2's features than v1's raw museum strings, which is the improvement being tested, so treat the size of
// the gap with some caution. Usage: node tests/reco-sim.mjs [decisions=500] [seeds=3]

import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizeStatic } from "../alpha/js/sources.js";
import { geoOf } from "../alpha/js/geo.js";
import { TasteModel as V2, features as f2 } from "../alpha/js/model.js";
import { choose, retrieve, planQuery } from "../alpha/js/recommend.js";
import { TasteModel as V1, features as f1 } from "./legacy/model-v1.js";

const N = +(process.env.SIM_N || process.argv[2] || 500), SEEDS = +(process.env.SIM_SEEDS || process.argv[3] || 3), EXPLORE = 0.35;
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const sig = (z) => 1 / (1 + Math.exp(-z));

/* ---------- catalog ---------- */
const catalog = [];
for (const src of ["nga", "cma"]) {
  const dir = new URL(`../alpha/data/${src}/`, import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.startsWith("shard"))) for (const r of JSON.parse(readFileSync(new URL(f, dir)))) {
    const a = normalizeStatic(src, r); if (!a) continue;
    const g = geoOf(a); a._iso = g && g.iso; a._cont = g && g.continent; a._text = `${a.title} ${a.movement || ""} ${a.place || ""} ${a.artist || ""} ${a.kind || ""}`.toLowerCase();
    catalog.push(a);
  }
}
const typeIs = (a, re) => re.test(`${a.kind} ${a.medium || ""}`.toLowerCase());

/* ---------- simulated people ---------- */
const PERSONAS = {
  "Impressionism and Japan": (a) => (["FR", "NL", "JP"].includes(a._iso) && a.year >= 1840 && a.year <= 1915 ? 1.5 : 0) + (a._iso === "JP" && typeIs(a, /print|woodblock/) ? 1.2 : 0)
    - (typeIs(a, /sculpt|metal|coin|armor/) ? 1 : 0) - (a.year < 500 ? 0.8 : 0),
  "Old Masters": (a) => (["IT", "NL", "BE", "ES"].includes(a._iso) && a.year >= 1400 && a.year <= 1700 ? 1.6 : 0) + (typeIs(a, /paint|draw/) ? 0.4 : 0)
    - (a.year > 1850 ? 1.2 : 0) - (a._cont === "AS" ? 0.8 : 0),
  "Antiquarian": (a) => (a.year != null && a.year < 500 ? 1.6 : 0) + (typeIs(a, /sculpt|ceramic|metal|jade|coin|glass/) ? 1 : 0) - (typeIs(a, /print|photo/) ? 1 : 0),
  "Asia and Islam": (a) => (a._cont === "AS" ? 1.6 : 0) + (a._iso === "EG" && a.year > 640 ? 1 : 0) + (typeIs(a, /textile|velvet|silk|ceramic/) ? 0.6 : 0)
    - (a._cont === "EU" && a.year >= 1500 && a.year <= 1800 ? 0.8 : 0),
  "Photography and modern": (a) => (typeIs(a, /photo/) ? 1.6 : 0) + (a.year > 1890 ? 1 : 0) - (a.year != null && a.year < 1600 ? 1 : 0),
};
PERSONAS["Drifter (Japan, then Old Masters)"] = null;   // switches taste halfway
function person(name, seed) {
  const r = rng(seed * 7919 + name.length), quirk = new Map(), fans = new Set();
  const artists = [...new Set(catalog.map((a) => a.artist).filter(Boolean))]; for (let i = 0; i < 40; i++) fans.add(artists[Math.floor(r() * artists.length)]);
  const util = (a, t) => {
    const fn = name.startsWith("Drifter") ? (t < N / 2 ? PERSONAS["Impressionism and Japan"] : PERSONAS["Old Masters"]) : PERSONAS[name];
    if (!quirk.has(a.uid)) quirk.set(a.uid, gauss(r) * 0.8);
    return fn(a) + (fans.has(a.artist) ? 1.2 : 0) + quirk.get(a.uid) - 0.6;
  };
  const oracle = (a, t) => { const fn = name.startsWith("Drifter") ? (t < N / 2 ? PERSONAS["Impressionism and Japan"] : PERSONAS["Old Masters"]) : PERSONAS[name]; return fn(a) + (fans.has(a.artist) ? 1.2 : 0); };
  const decide = (a, t) => { const u = util(a, t), p = sig(1.6 * u); const keep = r() < p; return { v: keep ? (u > 1.4 && r() < 0.6 ? 2 : 1) : -1, p }; };
  return { util, decide, oracle };
}

/* ---------- A. model only ---------- */
function auc(pairs) {   // pairs of [prediction, kept]
  const pos = pairs.filter((x) => x[1]).map((x) => x[0]), neg = pairs.filter((x) => !x[1]).map((x) => x[0]);
  if (!pos.length || !neg.length) return null;
  let wins = 0; for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}
function modelOnly(name, seed) {
  const r = rng(seed), per = person(name, seed), m1 = new V1(), m2 = new V2(), h = [];
  const out = { v1: [], v2: [], or: [], ll1: 0, ll2: 0, n: 0 };
  for (let t = 0; t < N; t++) {
    const a = catalog[Math.floor(r() * catalog.length)], { v } = per.decide(a, t), y = v > 0;
    const F1 = f1(a), F2 = f2(a);
    if (t >= 40 && (name.startsWith("Drifter") ? t < N / 2 - 1 || t > N / 2 + 60 : true)) {
      const p1 = m1.p(F1), p2 = m2.p(F2);
      out.v1.push([p1, y]); out.v2.push([p2, y]); out.or.push([per.oracle(a, t), y]);
      out.ll1 -= Math.log(y ? Math.max(1e-6, p1) : Math.max(1e-6, 1 - p1)); out.ll2 -= Math.log(y ? Math.max(1e-6, p2) : Math.max(1e-6, 1 - p2)); out.n++;
    }
    m1.learn(F1, v); m2.learn(F2, v);
    h.push({ v, f: F2, a });
    if (t % 50 === 49) { m1.fit(h.map((x) => ({ v: x.v, f: f1(x.a) }))); m2.fit(h); }
  }
  return { auc1: auc(out.v1), auc2: auc(out.v2), aucO: auc(out.or), ll1: out.ll1 / out.n, ll2: out.ll2 / out.n };
}

/* ---------- B. full engine ---------- */
function v1Pick(pool, model, r) {
  const ex = EXPLORE;
  if (!model.trained || r() < ex * 0.45) return { pick: pool[Math.floor(r() * pool.length)], why: "explore" };
  const sc = pool.map((a) => { const f = f1(a); return { a, p: model.p(f), nov: model.novelty(f) }; });
  if (r() < ex) { sc.sort((x, y) => (Math.abs(x.p - 0.5) - 0.25 * x.nov) - (Math.abs(y.p - 0.5) - 0.25 * y.nov)); return { pick: sc[0].a, why: "unsure" }; }
  sc.sort((x, y) => (y.p + 0.05 * r()) - (x.p + 0.05 * r())); return { pick: sc[0].a, why: "match" };
}
function v1Refill(model, r, seen) {
  // v1 asked museums for a favourite movement/artist/place (when trained, and not exploring), otherwise browsed.
  let src = catalog;
  if (model.trained && r() > EXPLORE) {
    const fav = ["style", "artist", "place"].flatMap((d) => model.leaning(d, 12, 2).filter((x) => x.weight > 0.15).slice(0, 3).map((x) => `${d}|${x.value}`));
    if (fav.length) { const tok = fav[Math.floor(r() * fav.length)]; const hit = []; for (let i = 0; i < 4000 && hit.length < 24; i++) { const a = catalog[Math.floor(r() * catalog.length)]; if (f1(a).includes(tok)) hit.push(a); } if (hit.length) src = hit; }
  }
  const out = []; for (let i = 0; i < 24; i++) { const a = src[Math.floor(r() * src.length)]; if (!seen.has(a.uid)) out.push(a); } return out;
}
function v2Refill(model, r, seen) {
  // v2: score a large local sample (the static collections), plus a text query for the search-only museums.
  const sample = []; for (let i = 0; i < 800; i++) { const a = catalog[Math.floor(r() * catalog.length)]; if (!seen.has(a.uid)) sample.push(a); }
  const out = retrieve(sample, model, { k: 12, rand: r });
  const plan = planQuery(model, { explore: EXPLORE, rand: r });
  const q = plan && plan.q.toLowerCase(); let n = 0;
  for (let i = 0; i < 6000 && n < 12; i++) { const a = catalog[Math.floor(r() * catalog.length)]; if (seen.has(a.uid)) continue; if (!q || a._text.includes(q)) { out.push(a); n++; } }
  return out;
}
function engine(kind, name, seed) {
  const r = rng(seed + (kind === "v2" ? 1e6 : 0)), per = person(name, seed), model = kind === "v1" ? new V1() : new V2();
  const seen = new Set(), hist = [], shown = []; let pool = [];
  const res = { match: [], other: [], all: [], trueMatch: [], schools: new Set(), countries: new Set() };
  for (let t = 0; t < N; t++) {
    if (pool.length < 8) pool.push(...(kind === "v1" ? v1Refill(model, r, seen) : v2Refill(model, r, seen)).filter((a) => !seen.has(a.uid)));
    const { pick, why } = kind === "v1" ? v1Pick(pool, model, r) : choose(pool, { model, explore: EXPLORE, rand: r, recent: shown });
    pool.splice(pool.indexOf(pick), 1); seen.add(pick.uid); shown.push(pick);
    const { v, p } = per.decide(pick, t);
    if (t >= N / 2) { (why === "match" ? res.match : res.other).push(v > 0); res.all.push(v > 0); if (why === "match") res.trueMatch.push(p); }
    const g = f2(pick); const sc = g.find((x) => x.startsWith("school|")); if (sc) res.schools.add(sc); if (pick._iso) res.countries.add(pick._iso);
    const F = kind === "v1" ? f1(pick) : g; model.learn(F, v); hist.push({ v, a: pick, f: F });
    if (process.env.TRACE && name.startsWith("Drifter") && kind === "v2") { (globalThis.__tr ||= []).push({ t, why, v, om: ["IT", "NL", "BE", "ES"].includes(pick._iso) && pick.year >= 1400 && pick.year <= 1700, jp: ["FR", "NL", "JP"].includes(pick._iso) && pick.year >= 1840 && pick.year <= 1915, drift: model.drifting, pool: pool.length }); }
    if (t % 50 === 49) model.fit(kind === "v1" ? hist.map((x) => ({ v: x.v, f: x.f })) : hist);
  }
  const mean = (l) => (l.length ? l.reduce((s, x) => s + (x === true ? 1 : x === false ? 0 : x), 0) / l.length : 0);
  return { matchKeep: mean(res.match), otherKeep: mean(res.other), keep: mean(res.all), trueP: mean(res.trueMatch), schools: res.schools.size, countries: res.countries.size };
}

export function runModelOnly() {
  let a1 = 0, a2 = 0, l2 = 0, o = 0, k = 0;
  for (const name of Object.keys(PERSONAS)) for (let sd = 1; sd <= SEEDS; sd++) { const r = modelOnly(name, sd); a1 += r.auc1; a2 += r.auc2; l2 += r.ll2; o += r.aucO; k++; }
  return { auc: a2 / k, aucV1: a1 / k, ll: l2 / k, oracle: o / k };
}
export function runEngine(kind) {
  let m = 0, l = 0, k = 0;
  for (const name of Object.keys(PERSONAS)) for (let sd = 1; sd <= SEEDS; sd++) { const r = engine(kind, name, sd); m += r.matchKeep; l += r.matchKeep - r.otherKeep; k++; }
  return { match: m / k, lift: l / k };
}
/* ---------- run ---------- */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
const pct = (x) => `${(x * 100).toFixed(0)}%`.padStart(5);
const t0 = Date.now();
console.log(`Catalog: ${catalog.length} works. ${N} decisions per run, ${SEEDS} seeds per person.\n`);
console.log("A. Model only (same works, predictions made before each answer)");
console.log("person".padEnd(36) + "AUC v1  AUC v2   log loss v1  v2");
const A = { a1: 0, a2: 0, l1: 0, l2: 0, k: 0 };
for (const name of Object.keys(PERSONAS)) {
  let a1 = 0, a2 = 0, l1 = 0, l2 = 0;
  for (let s = 1; s <= SEEDS; s++) { const r = modelOnly(name, s); a1 += r.auc1; a2 += r.auc2; l1 += r.ll1; l2 += r.ll2; }
  a1 /= SEEDS; a2 /= SEEDS; l1 /= SEEDS; l2 /= SEEDS; A.a1 += a1; A.a2 += a2; A.l1 += l1; A.l2 += l2; A.k++;
  console.log(name.padEnd(36) + `${a1.toFixed(3)}   ${a2.toFixed(3)}    ${l1.toFixed(3)}      ${l2.toFixed(3)}`);
}
console.log("average".padEnd(36) + `${(A.a1 / A.k).toFixed(3)}   ${(A.a2 / A.k).toFixed(3)}    ${(A.l1 / A.k).toFixed(3)}      ${(A.l2 / A.k).toFixed(3)}`);

console.log("\nB. Full engine (second half of each run)");
console.log("person".padEnd(36) + "matches kept  v1    v2  | lift v1  v2 | true match odds v1  v2 | schools v1 v2 | countries v1 v2");
const B = { v1: [], v2: [] };
for (const name of Object.keys(PERSONAS)) {
  const agg = { v1: [], v2: [] };
  for (let s = 1; s <= SEEDS; s++) for (const k of ["v1", "v2"]) agg[k].push(engine(k, name, s));
  const avg = (k, f) => agg[k].reduce((t, x) => t + x[f], 0) / SEEDS;
  for (const k of ["v1", "v2"]) B[k].push({ m: avg(k, "matchKeep"), l: avg(k, "matchKeep") - avg(k, "otherKeep"), tp: avg(k, "trueP") });
  console.log(name.padEnd(36) + `            ${pct(avg("v1", "matchKeep"))} ${pct(avg("v2", "matchKeep"))} |  ${pct(avg("v1", "matchKeep") - avg("v1", "otherKeep"))} ${pct(avg("v2", "matchKeep") - avg("v2", "otherKeep"))} |              ${pct(avg("v1", "trueP"))} ${pct(avg("v2", "trueP"))} |      ${String(Math.round(avg("v1", "schools"))).padStart(2)} ${String(Math.round(avg("v2", "schools"))).padStart(2)} |        ${String(Math.round(avg("v1", "countries"))).padStart(3)} ${String(Math.round(avg("v2", "countries"))).padStart(3)}`);
}
const mean = (k, f) => B[k].reduce((t, x) => t + x[f], 0) / B[k].length;
console.log("average".padEnd(36) + `            ${pct(mean("v1", "m"))} ${pct(mean("v2", "m"))} |  ${pct(mean("v1", "l"))} ${pct(mean("v2", "l"))} |              ${pct(mean("v1", "tp"))} ${pct(mean("v2", "tp"))}`);
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)} s`);
const summary = { aucV1: A.a1 / A.k, aucV2: A.a2 / A.k, matchV1: mean("v1", "m"), matchV2: mean("v2", "m"), liftV1: mean("v1", "l"), liftV2: mean("v2", "l") };

}
