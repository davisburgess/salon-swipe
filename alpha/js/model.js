// Taste model v2: regularized logistic regression over hashed features, retrained on your whole history.
// Each artwork becomes a set of tokens ("school|Romantic and Realist", "country|Japan", "type|Print"...). The model learns
// one weight per token, so it can say which features pushed a prediction, and how sure it is.
//
// What changed from v1 (0.6.0):
//  - Shared vocabulary (vocab.js, geo.js): canonical movements, a school for every work (most records have no movement),
//    modern country and continent, object type, museum. v1 used raw museum strings, which fragmented.
//  - Type x school pairs, so "Japanese prints" and "Japanese ceramics" can differ.
//  - Rare tokens are shrunk harder (a feature seen twice can't dominate), and recent decisions count more (half-life
//    about 500 decisions), so a change in taste is followed instead of averaged away.
//  - Undecided works train toward 50/50 instead of being ignored.
//  - uncertainty(): how little the model knows about a work's features, used to pick works that teach it the most.
// The model is small enough to retrain from scratch on every load.

import { hash32, eraOf, centuryOf, hueName } from "./util.js";
import { geoOf, COUNTRY, CONTINENTS } from "./geo.js";
import { canonMovement, schoolOf, typeOf } from "./vocab.js";

const D = 1 << 14;   // hashed feature space
const SCALE = { cc: 0.5, kt: 0.45, style: 0.8, school: 0.7, artist: 1.0, era: 0.5, cent: 0.3, country: 0.6, cont: 0.35, type: 0.6, ts: 0.5, med: 0.45, src: 0.3,
  subject: 0.35, hue: 0.4, light: 0.4, sat: 0.4, warm: 0.4, busy: 0.4 };
const DIM_LABEL = { style: "Movement", school: "School", artist: "Artist", era: "Era", cent: "Century", country: "Country", cont: "Continent", type: "Type",
  ts: "Type and school", cc: "Country and century", kt: "Type and continent", med: "Medium", src: "Museum", subject: "Subject", hue: "Color", light: "Light", sat: "Saturation", warm: "Temperature", busy: "Detail",
  place: "Place", kind: "Type" };
export const HALF_LIFE = 500;
// Learning settings, chosen with the simulation lab (tests/reco-sim.mjs, tests/reco-tune.mjs).
export const CFG = { lr: 0.15, biasLr: 0.05, l2: 0.004, l2Rare: 1.0, epochs: 3, halfLife: HALF_LIFE, recFloor: 0.25, crosses: ["cc"], decay: 0.995, driftHalfLife: 80, driftDrop: 0.15, driftSurprise: 0.18 };

// Visual cues measured from the image itself (see vision.js); tokens are coarse on purpose.
export function visTokens(v) {
  if (!v) return [];
  const t = [];
  t.push("light|" + (v.bright > 0.62 ? "Bright" : v.bright < 0.36 ? "Dark" : "Mid-tone"));
  t.push("sat|" + (v.sat > 0.42 ? "Vivid" : v.sat < 0.18 ? "Muted" : "Moderate"));
  t.push("warm|" + (v.warm > 0.06 ? "Warm" : v.warm < -0.04 ? "Cool" : "Neutral"));
  t.push("busy|" + (v.edges > 0.17 ? "Busy" : v.edges < 0.08 ? "Calm" : "Balanced"));
  return t;
}

const SRC_NAME = { aic: "Art Institute of Chicago", met: "The Met", nga: "National Gallery of Art", cma: "Cleveland Museum of Art", wd: "Wikimedia Commons", vam: "V&A", smk: "SMK" };
export function features(a) {
  if (!a) return [];
  const f = [];
  const add = (dim, v) => { if (v) f.push(`${dim}|${v}`); };
  const g = geoOf(a), year = Number.isFinite(a.year) ? a.year : null;
  const school = schoolOf(a.movement, g, year), type = typeOf(a.kind, a.medium || a.mediumFamily);
  add("style", canonMovement(a.movement)); add("school", school); add("artist", a.artist);
  add("era", eraOf(year)); add("cent", centuryOf(year));
  if (g) { add("country", g.iso && COUNTRY[g.iso] ? COUNTRY[g.iso].name : null); add("cont", CONTINENTS[g.continent]); }
  add("type", type); if (type && school) add("ts", `${type} · ${school}`);
  const cname = g && g.iso && COUNTRY[g.iso] ? COUNTRY[g.iso].name : null;
  if (CFG.crosses.includes("cc") && cname && year != null) add("cc", `${cname} · ${centuryOf(year)}`);
  if (CFG.crosses.includes("kt") && type && g) add("kt", `${type} · ${CONTINENTS[g.continent]}`);
  add("med", a.mediumFamily); add("src", SRC_NAME[a.src]);
  (a.subjects || []).slice(0, 4).forEach((s) => add("subject", s));
  add("hue", hueName(a.color || (a.vis && a.vis.hsl)));
  return f.concat(visTokens(a.vis));
}
// Tokens for a saved decision: rebuilt from the work, so old decisions use today's vocabulary.
export const tokensOf = (s) => (s && s.a && (s.a.title || s.a.movement || s.a.artist) ? features(s.a) : (s && s.f) || []);

const scaleOf = (tok) => SCALE[tok.slice(0, tok.indexOf("|"))] ?? 0.4;
export const tokenLabel = (tok) => {
  const i = tok.indexOf("|");
  return { dim: tok.slice(0, i), dimLabel: DIM_LABEL[tok.slice(0, i)] || tok.slice(0, i), value: tok.slice(i + 1) };
};
// Taste is moving when recent guesses are much worse than before, or you keep far less than the app expected.
function driftFrom(calls, preds) {
  if (calls.length < 120) return false;
  const rate = (l) => l.filter(Boolean).length / l.length;
  const drop = rate(calls.slice(-120, -40)) - rate(calls.slice(-40));
  const last = preds.slice(-40), expected = last.reduce((t, x) => t + x.p, 0) / last.length, kept = last.filter((x) => x.v > 0).length / last.length;
  const l80 = preds.slice(-80), surprise80 = l80.reduce((t, x) => t + x.p, 0) / l80.length - l80.filter((x) => x.v > 0).length / l80.length;
  return drop >= CFG.driftDrop || expected - kept >= CFG.driftSurprise || surprise80 >= CFG.driftSurprise * 0.66;   // holds until guesses recover
}
// The same check from the guesses saved with each decision (rec.p), cheap enough to run every few decisions.
export function driftFromHistory(swipes) {
  const d = (swipes || []).filter((s) => s.v !== 0 && typeof s.p === "number");
  return driftFrom(d.map((s) => (s.p >= 0.5) === (s.v > 0)), d.map((s) => ({ p: s.p, v: s.v })));
}
const target = (v) => (v > 0 ? 1 : v < 0 ? 0 : 0.5);
const weightOf = (v) => (v === 2 ? 2 : v === 0 ? 0.5 : 1);

export class TasteModel {
  constructor() { this.reset(); }
  reset() {
    this.w = new Float64Array(D); this.g2 = new Float64Array(D); this.b = 0; this.n = 0;
    this.counts = new Map();   // token -> { p: weighted keeps, n: passes, c: times seen }
    this.recent = [];          // rolling record of pre-swipe predictions: true when right
    this.drifting = false;
  }
  z(tokens) { let z = this.b; for (const t of tokens) z += this.w[hash32(t) % D] * scaleOf(t); return z; }
  p(tokens) { return 1 / (1 + Math.exp(-this.z(tokens))); }
  get trained() { return this.n >= 8; }

  // One AdaGrad step on one decision. Rare tokens get a stronger pull toward zero.
  step(tokens, y, sw, lr = CFG.lr) {
    const g = (this.p(tokens) - y) * sw;
    this.b -= CFG.biasLr * g;
    for (const t of tokens) {
      const i = hash32(t) % D, x = scaleOf(t), c = (this.counts.get(t) || { c: 0 }).c;
      const l2 = CFG.l2 + CFG.l2Rare / (1 + c);
      const grad = g * x + l2 * this.w[i];
      this.g2[i] = CFG.decay * this.g2[i] + grad * grad;   // decaying (RMSProp-style), so learning never freezes and drift is followed
      this.w[i] -= (lr / Math.sqrt(this.g2[i] + 1e-6)) * grad;
    }
  }
  count(tokens, v) {
    for (const t of tokens) {
      const c = this.counts.get(t) || { p: 0, n: 0, c: 0 };
      if (v > 0) c.p += v === 2 ? 2 : 1; else if (v < 0) c.n += 1;
      c.c++; this.counts.set(t, c);
    }
  }
  // Online update after a new decision.
  learn(tokens, v) {
    if (!tokens || v == null) return;
    this.count(tokens, v); this.step(tokens, target(v), weightOf(v)); if (v !== 0) this.n++;
  }

  // Full retrain, oldest first. Recent decisions weigh more; counts are rebuilt once.
  fit(swipes, epochs = CFG.epochs) {
    this.reset();
    const data = (swipes || []).map((s) => ({ f: tokensOf(s), v: s.v })).filter((d) => d.f.length && d.v != null);
    const N = data.length;
    // Is your taste moving? Replay predictions in order: if the last 40 calls are much worse than the 80 before them,
    // forget faster for now (and the deck explores more) until the model catches up.
    const probe = new TasteModel(), calls = [], preds = [];
    for (const d of data) {
      if (d.v !== 0 && probe.trained) { const p = probe.p(d.f); calls.push((p >= 0.5) === (d.v > 0)); preds.push({ p, v: d.v }); }
      probe.learn(d.f, d.v);
    }
    this.drifting = driftFrom(calls, preds);
    const halfLife = this.drifting ? CFG.driftHalfLife : CFG.halfLife;
    const keeps = data.filter((d) => d.v > 0).length, passes = data.filter((d) => d.v < 0).length;
    const base = (keeps + 1) / (keeps + passes + 2);
    this.b = Math.log(base / (1 - base));
    data.forEach((d) => this.count(d.f, d.v));
    for (let e = 0; e < epochs; e++) {
      data.forEach((d, i) => { const rec = Math.max(this.drifting ? 0.05 : CFG.recFloor, Math.pow(0.5, (N - 1 - i) / halfLife)); this.step(d.f, target(d.v), weightOf(d.v) * rec, CFG.lr / (1 + 0.5 * e)); });
    }
    this.n = data.filter((d) => d.v !== 0).length;
    this.recent = calls.slice(-40);   // honest accuracy record: each decision predicted from the ones before it
    return this;
  }

  record(predicted, v) {
    if (predicted == null || v === 0) return;
    this.recent.push((predicted >= 0.5) === (v > 0));
    if (this.recent.length > 40) this.recent.shift();
  }
  get accuracy() { return this.recent.length >= 10 ? this.recent.filter(Boolean).length / this.recent.length : null; }

  // How little the model knows about these features: 1 for all-new, near 0 for well-known.
  uncertainty(tokens) {
    if (!tokens.length) return 1;
    let s = 0, w = 0;
    for (const t of tokens) { const x = scaleOf(t), c = (this.counts.get(t) || { c: 0 }).c; s += x / Math.sqrt(1 + c); w += x; }
    return s / w;
  }
  novelty(tokens) {
    if (!tokens.length) return 1;
    return tokens.filter((t) => !this.counts.has(t)).length / tokens.length;
  }

  // The two strongest reasons behind a prediction, in plain words.
  explain(tokens, k = 2) {
    return tokens.filter((t) => !/^(cent|ts|cc|kt)\|/.test(t))
      .map((t) => ({ t, c: this.w[hash32(t) % D] * scaleOf(t), seen: (this.counts.get(t) || {}).c || 0 }))
      .filter((x) => x.seen >= 2 && Math.abs(x.c) > 0.05)
      .sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, k)
      .map((x) => ({ ...tokenLabel(x.t), dir: x.c > 0 ? "+" : "-", weight: x.c }));
  }

  // Strongest learned pulls and pushes per dimension, for the profile.
  leaning(dim, k = 6, minSeen = 2) {
    const out = [];
    for (const [t, c] of this.counts) {
      if (!t.startsWith(dim + "|") || c.c < minSeen) continue;
      out.push({ value: t.slice(dim.length + 1), weight: this.w[hash32(t) % D] * scaleOf(t), seen: c.c, liked: c.p, passed: c.n });
    }
    return out.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, k).sort((a, b) => b.weight - a.weight);
  }
}
