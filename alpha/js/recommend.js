// Recommendation engine v2: what to show next. Pure functions, shared by the app (deck.js) and the simulation lab
// (tests/reco-sim.mjs), so what we measure is exactly what ships.
//
// Every candidate is scored by the taste model: p (chance you'll keep it) and u (how little the model knows about it).
// Each card is chosen with one of three intents, mixed by the Discovery slider:
//   match    your best predicted work, penalized for repeating the school, country or artist of the last few cards
//   unsure   the work that teaches the model most: unfamiliar features, prediction near 50/50 ("learn")
//   explore  discovery with a map: schools next to ones you like, or ones you've barely seen, not pure randomness
// The intent is recorded on each decision, so "How well we know you" can score the matches fairly.

import { features } from "./model.js";
import { ADJACENT, SCHOOLS, SCHOOL_QUERY } from "./vocab.js";

const field = (f, dim) => { const t = f.find((x) => x.startsWith(dim + "|")); return t ? t.slice(dim.length + 1) : null; };
export function scoreAll(cands, model) {
  return cands.map((a) => {
    const f = a._f || (a._f = features(a));
    return { a, f, p: model.p(f), u: model.uncertainty(f), school: field(f, "school"), country: field(f, "country"), artist: a.artist || null };
  });
}

// Schools you like (by your own keeps), schools you've barely seen, and their neighbours.
export function schoolMap(model) {
  const seen = {}; for (const s of SCHOOLS) seen[s] = 0;
  const liked = [];
  // "Liked" uses the model's current weights, which follow recent decisions, not all-time tallies.
  for (const x of model.leaning("school", 40, 4)) { seen[x.value] = x.seen; if (x.weight > 0.08) liked.push([x.value, x.weight]); }
  for (const [t, c] of model.counts) if (t.startsWith("school|") && !(t.slice(7) in seen && seen[t.slice(7)])) seen[t.slice(7)] = c.c;
  liked.sort((a, b) => b[1] - a[1]);
  const near = new Set(); for (const [k] of liked.slice(0, 3)) for (const n of ADJACENT[k] || []) near.add(n);
  const rare = SCHOOLS.filter((s) => seen[s] < 3);
  return { liked: liked.map(([k]) => k), near, rare: new Set(rare), seen };
}

// recent: the last few works shown or decided (newest last). Returns { pick, why }.
export function choose(cands, { model, explore = 0.35, rand = Math.random, recent = [] }) {
  if (!cands.length) return null;
  if (model.drifting) explore = Math.max(explore, 0.6);   // taste is moving: look around more until the model catches up
  if (!model.trained) return { pick: cands[Math.floor(rand() * cands.length)], why: "explore" };
  const S = scoreAll(cands, model);
  const rs = recent.slice(-6).map((a) => { const f = a._f || features(a); return { school: field(f, "school"), country: field(f, "country"), artist: a.artist }; });
  const repeat = (x) => rs.reduce((t, r, i) => t + (0.4 + 0.12 * i) * ((r.school && r.school === x.school ? 0.16 : 0) + (r.country && r.country === x.country ? 0.07 : 0) + (r.artist && r.artist === x.artist ? 0.3 : 0)), 0);
  const r = rand();
  if (r < explore * 0.4 && model.drifting) {
    // Taste is moving: sample schools evenly (not just neighbours of old favourites) so a new love can surface.
    const bySchool = {}; for (const x of S) if (x.school && x.p >= 0.2) (bySchool[x.school] ||= []).push(x);
    const keys = Object.keys(bySchool);
    if (keys.length) { const list = bySchool[keys[Math.floor(rand() * keys.length)]]; return { pick: list.sort((a, b) => b.p - a.p)[0].a, why: "explore" }; }
  }
  if (r < explore * 0.4) {
    const map = schoolMap(model);
    const pool = S.filter((x) => x.school && (map.near.has(x.school) || map.rare.has(x.school)) && x.p >= 0.3);
    const list = pool.length ? pool : S;
    const best = list.map((x) => ({ x, s: x.p + 0.3 * x.u - repeat(x) + 0.15 * rand() })).sort((a, b) => b.s - a.s)[0].x;
    return { pick: best.a, why: "explore" };
  }
  if (r < explore) {
    const best = S.map((x) => ({ x, s: x.u * (1 - Math.abs(2 * x.p - 1)) - 0.5 * repeat(x) + 0.05 * rand() })).sort((a, b) => b.s - a.s)[0].x;
    return { pick: best.a, why: "unsure" };
  }
  const best = S.map((x) => ({ x, s: x.p - repeat(x) + 0.03 * rand() })).sort((a, b) => b.s - a.s)[0].x;
  return { pick: best.a, why: "match" };
}

// From a large local sample (the static collections), keep the few worth queueing: best predicted, most informative,
// and discoveries. Cheap: scoring hundreds of works takes a few milliseconds.
export function retrieve(records, model, { k = 12, rand = Math.random } = {}) {
  if (!records.length) return [];
  if (!model.trained) return records.slice().sort(() => rand() - 0.5).slice(0, k);
  const S = scoreAll(records, model), map = schoolMap(model), out = new Set();
  const take = (list, n) => { for (const x of list) { if (n <= 0) break; if (!out.has(x.a)) { out.add(x.a); n--; } } };
  take([...S].sort((a, b) => b.p - a.p), Math.ceil(k * 0.5));
  take([...S].sort((a, b) => b.u * (1 - Math.abs(2 * b.p - 1)) - a.u * (1 - Math.abs(2 * a.p - 1))), Math.ceil(k * 0.25));
  const disc = model.drifting ? S.filter((x) => x.p >= 0.2) : S.filter((x) => x.school && (map.near.has(x.school) || map.rare.has(x.school)) && x.p >= 0.3);
  take(disc.sort(() => rand() - 0.5), k - out.size);
  return [...out];
}

// What to ask the text-search museums for: something you like, a neighbour of it, or somewhere you haven't been.
export function planQuery(model, { explore = 0.35, rand = Math.random } = {}) {
  if (!model.trained) return null;
  if (model.drifting) explore = Math.max(explore, 0.6);
  const map = schoolMap(model), r = rand();
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pos = (dim, k) => model.leaning(dim, 12, 3).filter((x) => x.weight > 0.12).slice(0, k).map((x) => x.value);
  if (r < explore * 0.5) {
    const targets = [...map.near].concat([...map.rare]).filter((s) => SCHOOL_QUERY[s]);
    if (targets.length) { const s = pick(targets); return { q: pick(SCHOOL_QUERY[s]), why: "discover", school: s }; }
  }
  const opts = [...pos("style", 4), ...pos("artist", 3), ...pos("country", 2)];
  for (const s of map.liked.slice(0, 2)) if (SCHOOL_QUERY[s]) opts.push(pick(SCHOOL_QUERY[s]));
  return opts.length ? { q: pick(opts), why: "refine" } : null;
}
