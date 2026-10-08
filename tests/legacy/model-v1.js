// Taste model: online logistic regression over hashed features.
// Each artwork becomes a set of tokens ("style|Impressionism", "light|bright"...). The model learns one weight per
// token, so it can say not just "you'll like this" but which features pushed it there.
// Small enough to retrain from scratch on every load (thousands of swipes in milliseconds).

import { hash32, eraOf, centuryOf, hueName } from "../../alpha/js/util.js";

const D = 1 << 13;   // hashed feature space
const SCALE = { style: 0.9, artist: 1.0, era: 0.6, cent: 0.4, place: 0.6, kind: 0.6, med: 0.6, subject: 0.35, hue: 0.4,
  light: 0.4, sat: 0.4, warm: 0.4, busy: 0.4 };
const DIM_LABEL = { style: "Movement", artist: "Artist", era: "Era", cent: "Century", place: "Place", kind: "Type", med: "Medium",
  subject: "Subject", hue: "Color", light: "Light", sat: "Saturation", warm: "Temperature", busy: "Detail" };

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

export function features(a) {
  const f = [];
  const add = (dim, v) => { if (v) f.push(`${dim}|${v}`); };
  add("style", a.movement); add("artist", a.artist); add("era", eraOf(a.year)); add("cent", centuryOf(a.year));
  add("place", a.place); add("kind", a.kind); add("med", a.mediumFamily);
  (a.subjects || []).slice(0, 4).forEach((s) => add("subject", s));
  add("hue", hueName(a.color || (a.vis && a.vis.hsl)));
  return f.concat(visTokens(a.vis));
}

const scaleOf = (tok) => SCALE[tok.slice(0, tok.indexOf("|"))] ?? 0.5;
export const tokenLabel = (tok) => {
  const i = tok.indexOf("|");
  return { dim: tok.slice(0, i), dimLabel: DIM_LABEL[tok.slice(0, i)] || tok.slice(0, i), value: tok.slice(i + 1) };
};

export class TasteModel {
  constructor() { this.reset(); }
  reset() {
    this.w = new Float64Array(D); this.b = 0; this.n = 0;
    this.counts = new Map();   // token -> {p, n, c}
    this.recent = [];          // rolling record of pre-swipe predictions: true when right
  }
  z(tokens) {
    let z = this.b;
    for (const t of tokens) z += this.w[hash32(t) % D] * scaleOf(t);
    return z;
  }
  p(tokens) { return 1 / (1 + Math.exp(-this.z(tokens))); }
  get trained() { return this.n >= 8; }

  // One stochastic-gradient step. v: 2 love, 1 keep, -1 pass, 0 undecided (ignored).
  learn(tokens, v, lr = 0.15, l2 = 1e-3) {
    if (v === 0 || !tokens) return;
    const y = v > 0 ? 1 : 0, sw = v === 2 ? 2 : 1;
    const g = (this.p(tokens) - y) * sw;
    this.b -= lr * g * 0.5;
    for (const t of tokens) {
      const i = hash32(t) % D, x = scaleOf(t);
      this.w[i] -= lr * (g * x + l2 * this.w[i]);
      const c = this.counts.get(t) || { p: 0, n: 0, c: 0 };
      if (y) c.p += sw; else c.n += 1; c.c++;
      this.counts.set(t, c);
    }
    this.n++;
  }

  // Full retrain from swipe history (oldest first). Counts are rebuilt once, weights over a few passes.
  fit(swipes, epochs = 4) {
    this.reset();
    const data = swipes.filter((s) => s.v !== 0 && Array.isArray(s.f));
    data.forEach((s) => this.learn(s.f, s.v));
    const counts = this.counts, n = this.n;
    for (let e = 1; e < epochs; e++) {
      const lr = 0.15 / (1 + e);
      for (const s of data) {
        const y = s.v > 0 ? 1 : 0, sw = s.v === 2 ? 2 : 1, g = (this.p(s.f) - y) * sw;
        this.b -= lr * g * 0.5;
        for (const t of s.f) { const i = hash32(t) % D; this.w[i] -= lr * (g * scaleOf(t) + 1e-3 * this.w[i]); }
      }
    }
    this.counts = counts; this.n = n;
    // Rebuild the accuracy record honestly: predict each swipe from the swipes before it.
    const probe = new TasteModel(); this.recent = [];
    for (const s of data) {
      if (probe.trained) this.recent.push((probe.p(s.f) >= 0.5) === (s.v > 0));
      probe.learn(s.f, s.v);
    }
    this.recent = this.recent.slice(-40);
    return this;
  }

  record(predicted, v) {
    if (predicted == null || v === 0) return;
    this.recent.push((predicted >= 0.5) === (v > 0));
    if (this.recent.length > 40) this.recent.shift();
  }
  get accuracy() { return this.recent.length >= 10 ? this.recent.filter(Boolean).length / this.recent.length : null; }

  novelty(tokens) {
    if (!tokens.length) return 1;
    return tokens.filter((t) => !this.counts.has(t)).length / tokens.length;
  }

  // The two strongest reasons behind a prediction, in plain words.
  explain(tokens, k = 2) {
    return tokens.map((t) => ({ t, c: this.w[hash32(t) % D] * scaleOf(t), seen: (this.counts.get(t) || {}).c || 0 }))
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
