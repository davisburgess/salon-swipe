// Progress that rewards looking, not swiping. Levels need range and a model that actually predicts you;
// raw swipe count alone never levels you up.

import { tokenLabel } from "./model.js";

export const LEVELS = [
  { name: "Visitor", min: 0, acc: 0, range: 0 },
  { name: "Docent", min: 25, acc: 0, range: 5 },
  { name: "Collector", min: 75, acc: 0.6, range: 10 },
  { name: "Curator", min: 200, acc: 0.65, range: 16 },
  { name: "Connoisseur", min: 400, acc: 0.7, range: 22 },
];

export function stats(state, model) {
  const decided = state.swipes.filter((s) => s.v !== 0);
  const styles = new Set(), cents = new Set(), museums = new Set();
  let loves = 0, keeps = 0, passes = 0, undecided = 0, whyTagged = 0, chicagoOnView = 0, secondLookDecided = 0;
  const why = {};
  for (const s of state.swipes) {
    for (const t of s.f || []) { if (t.startsWith("style|")) styles.add(t.slice(6)); if (t.startsWith("cent|")) cents.add(t.slice(5)); }
    if (s.a && s.a.src) museums.add(s.a.src);
    if (s.v === 2) loves++; else if (s.v === 1) keeps++; else if (s.v === -1) passes++; else undecided++;
    if (s.why && s.why.length) { whyTagged++; s.why.forEach((w) => (why[w] = (why[w] || 0) + 1)); }
    if (s.v > 0 && s.a && s.a.src === "aic" && s.a.onView) chicagoOnView++;
    if (s.look && s.v !== 0) secondLookDecided++;
  }
  return { decided: decided.length, total: state.swipes.length, loves, keeps, passes, undecided,
    keepRate: decided.length ? (loves + keeps) / decided.length : 0, range: styles.size, centuries: cents.size,
    museums: museums.size, whyTagged, why, chicagoOnView, secondLookDecided, accuracy: model.accuracy };
}

export function levelFor(st) {
  let lv = 0;
  for (let i = 1; i < LEVELS.length; i++) {
    const L = LEVELS[i];
    if (st.decided >= L.min && st.range >= L.range && (L.acc === 0 || (st.accuracy ?? 0) >= L.acc)) lv = i; else break;
  }
  const next = LEVELS[lv + 1];
  const needs = next ? [
    { label: "works judged", have: st.decided, need: next.min },
    { label: "movements explored", have: st.range, need: next.range },
    ...(next.acc ? [{ label: "prediction accuracy", have: Math.round((st.accuracy ?? 0) * 100), need: Math.round(next.acc * 100), pct: true }] : []),
  ].map((n) => ({ ...n, done: n.have >= n.need })) : [];
  return { level: lv, name: LEVELS[lv].name, next: next ? { name: next.name, needs } : null };
}

export const BADGES = [
  { id: "first-love", name: "First love", desc: "Loved a work", test: (s) => s.loves >= 1 },
  { id: "wide-angle", name: "Wide angle", desc: "Judged works from 10 movements", test: (s) => s.range >= 10 },
  { id: "grand-tour", name: "Grand tour", desc: "Judged works from 25 movements", test: (s) => s.range >= 25 },
  { id: "time-traveler", name: "Time traveler", desc: "Works from 6 different centuries", test: (s) => s.centuries >= 6 },
  { id: "three-cities", name: "Three cities", desc: "Works from all three museums", test: (s) => s.museums >= 3 },
  { id: "second-thoughts", name: "Second thoughts", desc: "Decided on a work after putting it off", test: (s) => s.secondLookDecided >= 1 },
  { id: "says-why", name: "Says why", desc: "Gave reasons for 10 Loves", test: (s) => s.whyTagged >= 10 },
  { id: "field-trip", name: "Field trip", desc: "Kept 5 works on view in Chicago right now", test: (s) => s.chicagoOnView >= 5 },
  { id: "tough-crowd", name: "Tough crowd", desc: "Passed on 100 works", test: (s) => s.passes >= 100 },
];

// The facts a Curator's Note may draw on. The writer is told to use nothing else.
export function profileFacts(state, model) {
  const st = stats(state, model);
  const lean = (dim) => model.leaning(dim, 8, 2);
  const pick = (dim, sign, k) => lean(dim).filter((x) => (sign > 0 ? x.weight > 0.1 : x.weight < -0.1))
    .sort((a, b) => sign * (b.weight - a.weight)).slice(0, k).map((x) => ({ value: x.value, seen: x.seen, liked: x.liked, passed: x.passed }));
  const dims = ["style", "artist", "place", "med", "era", "subject", "hue", "light", "sat", "warm", "busy"];
  const likes = {}, passes = {};
  for (const d of dims) { const l = pick(d, 1, 3), p = pick(d, -1, 2); if (l.length) likes[tokenLabel(d + "|x").dimLabel] = l; if (p.length) passes[tokenLabel(d + "|x").dimLabel] = p; }
  const recentLoves = state.swipes.filter((s) => s.v === 2).slice(-5).map((s) => ({ title: s.a.title, artist: s.a.artist, date: s.a.date, movement: s.a.movement }));
  const hesitations = state.swipes.filter((s) => s.v === 0).slice(-5).map((s) => ({ title: s.a.title, artist: s.a.artist, movement: s.a.movement }));
  return { decisions: st.decided, keepRate: Math.round(st.keepRate * 100), loves: st.loves, undecided: st.undecided,
    accuracy: st.accuracy == null ? null : Math.round(st.accuracy * 100), movementsExplored: st.range,
    reasonsForLoves: st.why, likes, passes, recentLoves, hesitations };
}

/* ---------- offline notes ---------- */
// Used when the backend isn't connected. Written in the default dry voice.
const first = (o, k) => (o[k] && o[k][0] ? o[k][0].value : null);
export function templateNote(f, levelName) {
  const mov = first(f.likes, "Movement"), anti = first(f.passes, "Movement"), place = first(f.likes, "Place");
  const light = first(f.likes, "Light"), sat = first(f.likes, "Saturation"), hue = first(f.likes, "Color"), busy = first(f.likes, "Detail");
  const topWhy = Object.entries(f.reasonsForLoves || {}).sort((a, b) => b[1] - a[1])[0];
  const lines = [];
  if (mov && anti) lines.push(`You keep reaching for ${mov} and walking straight past ${anti}. Consistent, at least.`);
  else if (mov) lines.push(`${mov} is doing a lot of work in your heart right now.`);
  if (place) lines.push(`Geographically, your eye keeps landing in ${place}.`);
  const looks = [light && light.toLowerCase(), sat && sat.toLowerCase(), busy && busy.toLowerCase()].filter(Boolean);
  if (looks.length) lines.push(`Visually you favor ${looks.join(", ")} surfaces${hue ? `, with a soft spot for ${hue.toLowerCase()}` : ""}.`);
  if (topWhy) lines.push(`When you love something, you say it's the ${topWhy[0].toLowerCase()}. We believe you.`);
  if (f.keepRate >= 70) lines.push(`You keep ${f.keepRate}% of what you see. Generous. Possibly too generous.`);
  else if (f.keepRate <= 30 && f.decisions > 20) lines.push(`You keep only ${f.keepRate}% of what you see. The bar is high and we respect it.`);
  if (f.undecided >= 3) lines.push(`${f.undecided} works left you genuinely undecided. That's where taste gets interesting.`);
  if (f.accuracy != null) lines.push(`We now guess your reaction right ${f.accuracy}% of the time.`);
  if (!lines.length) lines.push("Too early for a verdict. Keep looking; patterns show up after a few dozen works.");
  return { title: levelName ? `You're now a ${levelName}` : "Where your taste stands", text: lines.slice(0, 5).join(" ") };
}
