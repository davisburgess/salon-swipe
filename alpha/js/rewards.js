// Progress that rewards looking, not swiping. Levels need range and a model that actually predicts you;
// raw swipe count alone never levels you up.

import { tokenLabel } from "./model.js";
import { OPENING } from "./curation.js";

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

// The facts a Curator's Note may draw on. The writer (Claude or the offline writer below) uses nothing else.
export function profileFacts(state, model) {
  const st = stats(state, model);
  const lean = (dim) => model.leaning(dim, 8, 2);
  const pick = (dim, sign, k) => lean(dim).filter((x) => (sign > 0 ? x.weight > 0.1 : x.weight < -0.1))
    .sort((a, b) => sign * (b.weight - a.weight)).slice(0, k).map((x) => ({ value: x.value, seen: x.seen, liked: x.liked, passed: x.passed }));
  const dims = ["style", "artist", "place", "med", "era", "subject", "hue", "light", "sat", "warm", "busy"];
  const likes = {}, passes = {};
  for (const d of dims) { const l = pick(d, 1, 3), p = pick(d, -1, 2); if (l.length) likes[tokenLabel(d + "|x").dimLabel] = l; if (p.length) passes[tokenLabel(d + "|x").dimLabel] = p; }
  const brief = (s) => ({ title: s.a.title, artist: s.a.artist, date: s.a.date, movement: s.a.movement });
  const recentLoves = state.swipes.filter((s) => s.v === 2).slice(-6).map(brief);
  const hesitations = state.swipes.filter((s) => s.v === 0).slice(-5).map(brief);
  // What's shifted lately: liked movements in the last 25 decisions vs. everything before.
  const decided = state.swipes.filter((s) => s.v !== 0);
  const topStyle = (list) => {
    const c = {}; for (const s of list) if (s.v > 0) for (const t of s.f || []) if (t.startsWith("style|")) c[t.slice(6)] = (c[t.slice(6)] || 0) + (s.v === 2 ? 2 : 1);
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  };
  const recentTop = topStyle(decided.slice(-25)), earlierTop = topStyle(decided.slice(0, -25));
  const seenStyles = new Set(state.swipes.flatMap((s) => (s.f || []).filter((t) => t.startsWith("style|")).map((t) => t.slice(6).toLowerCase())));
  const unexplored = OPENING.filter((o) => !seenStyles.has(o.label.toLowerCase())).map((o) => o.label);
  const lastNote = state.notes[state.notes.length - 1];
  return { decisions: st.decided, keepRate: Math.round(st.keepRate * 100), loves: st.loves, undecided: st.undecided,
    accuracy: st.accuracy == null ? null : Math.round(st.accuracy * 100), movementsExplored: st.range,
    reasonsForLoves: st.why, likes, passes, recentLoves, hesitations,
    shift: recentTop && earlierTop && recentTop !== earlierTop ? { from: earlierTop, to: recentTop } : null,
    unexplored: unexplored.slice(0, 8), sinceLastNote: lastNote ? state.swipes.filter((s) => s.t > lastNote.t).length : st.total };
}

/* ---------- offline notes ----------
   Used when the backend isn't connected. Each note is assembled from "angles" (one observation each),
   written in the chosen tone, and avoids angles the last few notes already used. */
const first = (o, k, i = 0) => (o && o[k] && o[k][i] ? o[k][i].value : null);
const lc = (s) => String(s || "").toLowerCase();
const pickOne = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Each angle returns null when the facts can't support it, or phrasings keyed by tone.
const ANGLES = {
  contrast: (f) => { const a = first(f.likes, "Movement"), b = first(f.passes, "Movement"); if (!a || !b) return null; return {
    cheeky: [`You keep reaching for ${a} and walking straight past ${b}. Consistent, at least.`, `${a}: yes. ${b}: not even a second glance. The curators of ${b} would like a word.`, `Put ${a} and ${b} in the same room and you'd only ever see one wall.`],
    docent: [`Your clearest pattern so far: you respond to ${a} and tend to pass on ${b}.`, `${a} draws you in, while ${b} rarely does. That's a useful contrast to keep in mind as you look.`],
    critic: [`Preference for ${a} over ${b} is now statistically visible in your choices.`, `${a} succeeds with you where ${b} fails; consider what each asks of the viewer.`],
    friend: [`You're totally a ${a} person, and ${b} just isn't your thing. Love that you know it!`, `${a} keeps winning you over. ${b}? Not so much, and that's fine.`] }; },
  movement: (f) => { const a = first(f.likes, "Movement"); if (!a) return null; const s = f.likes.Movement[0], kept = Math.max(0, s.seen - s.passed); return {
    cheeky: [`${a} is doing a lot of work in your heart right now.`, `${kept} yeses for ${a}. At this point it's less a preference and more a relationship.`, `If ${a} had a fan club, you'd be on the board.`],
    docent: [`${a} is the movement you respond to most so far, across ${s.seen} works.`, `You've kept or loved most of the ${a} works you've seen.`],
    critic: [`${a} dominates your positive responses (${kept} of ${s.seen} kept).`, `Your strongest affinity is ${a}; the sample is ${s.seen} works.`],
    friend: [`You really love ${a}! ${kept} of ${s.seen} have been keepers.`, `${a} keeps making you happy, and honestly, fair.`] }; },
  place: (f) => { const p = first(f.likes, "Place"); if (!p) return null; return {
    cheeky: [`Geographically, your eye keeps landing in ${p}. Passport not required.`, `${p} keeps winning. The tourism board thanks you.`],
    docent: [`Works made in ${p} stand out among the ones you keep.`, `You respond often to art from ${p}.`],
    critic: [`Provenance clusters around ${p} in what you keep.`, `There's a regional bias toward ${p} in your selections.`],
    friend: [`You keep picking things from ${p}. Maybe a trip is in order?`, `${p} art is clearly your happy place.`] }; },
  visual: (f) => { const looks = [first(f.likes, "Light"), first(f.likes, "Saturation"), first(f.likes, "Detail"), first(f.likes, "Temperature")].filter(Boolean).map(lc); if (looks.length < 2) return null; const l = looks.slice(0, 3).join(", "); return {
    cheeky: [`Before you read a single label, you've already decided: ${l}. Your eye is faster than your brain.`, `Visually you favor ${l} surfaces. Labels optional.`],
    docent: [`Looking past subject and period, you favor ${l} pictures.`, `The images you keep tend to be ${l}, regardless of when they were made.`],
    critic: [`Formally, you favor ${l} surfaces across periods, a sign the pull is visual rather than historical.`],
    friend: [`You love art that feels ${l}. You know what you like!`] }; },
  color: (f) => { const h = first(f.likes, "Color"); if (!h) return null; return {
    cheeky: [`You have a soft spot for ${lc(h)}. We noticed. Everyone noticed.`, `Show you ${lc(h)} and you melt a little.`],
    docent: [`Works dominated by ${lc(h)} are among your favorites.`],
    critic: [`Chromatically, ${lc(h)} recurs in what you keep.`],
    friend: [`${h} really gets you. Same honestly.`] }; },
  why: (f) => { const top = Object.entries(f.reasonsForLoves || {}).sort((a, b) => b[1] - a[1]); if (!top.length) return null; const w = lc(top[0][0]), w2 = top[1] ? lc(top[1][0]) : null; return {
    cheeky: [`When you love something, you say it's the ${w}. We believe you.`, `You keep citing the ${w}${w2 ? `, with the ${w2} a close second` : ""}. A person of principle.`],
    docent: [`When you explain a Love, you most often point to ${w}${w2 ? ` and ${w2}` : ""}.`],
    critic: [`Self-reported criteria: ${w}${w2 ? `, then ${w2}` : ""}. Test that against what you pass on.`],
    friend: [`It's all about the ${w} for you, isn't it? Love that.`] }; },
  recentLove: (f) => { const r = f.recentLoves[f.recentLoves.length - 1]; if (!r) return null; const by = r.artist ? ` by ${r.artist}` : ""; return {
    cheeky: [`Your latest Love was ${r.title}${by}. Bold choice. We respect it.`, `${r.title}${by} got the star. It's not hard to see why.`],
    docent: [`Your most recent Love, ${r.title}${by}, fits the pattern${r.movement ? ` of your ${r.movement} picks` : ""}.`],
    critic: [`Most recent Love: ${r.title}${by}. Ask what it shares with the last few.`],
    friend: [`You loved ${r.title}${by} recently. Great pick!`] }; },
  shift: (f) => { if (!f.shift) return null; const { from, to } = f.shift; return {
    cheeky: [`Plot twist: you started out all about ${from}, and lately it's ${to}. People change.`, `Remember ${from}? Lately you've moved on to ${to}. ${from} is taking it well.`],
    docent: [`Your taste is moving: earlier you favored ${from}; recently it's ${to}.`],
    critic: [`A drift from ${from} toward ${to} over your last 25 decisions.`],
    friend: [`Ooh, lately you're into ${to} more than ${from}. Exciting!`] }; },
  hesitation: (f) => { if (f.undecided < 2) return null; const h = f.hesitations[f.hesitations.length - 1]; return {
    cheeky: [`${f.undecided} works left you genuinely undecided${h ? `, ${h.title} among them` : ""}. That's where taste gets interesting.`, `You've shrugged at ${f.undecided} works. A shrug is still an opinion.`],
    docent: [`${f.undecided} works left you undecided. Those borderline cases often teach the most.`],
    critic: [`${f.undecided} unresolved judgments. Revisit them; ambivalence is information.`],
    friend: [`${f.undecided} had you on the fence, and that's totally okay.`] }; },
  rate: (f) => { if (f.decisions < 20) return null; if (f.keepRate >= 70) return {
    cheeky: [`You keep ${f.keepRate}% of what you see. Generous. Possibly too generous.`], docent: [`You keep about ${f.keepRate}% of what you see, which leaves plenty to compare.`],
    critic: [`A ${f.keepRate}% keep rate. Be harder to please; it sharpens the profile.`], friend: [`You like ${f.keepRate}% of everything. Such an open mind!`] };
    if (f.keepRate <= 35) return { cheeky: [`You keep only ${f.keepRate}% of what you see. The bar is high and we respect it.`], docent: [`You're selective, keeping about ${f.keepRate}% of what you see.`],
      critic: [`A ${f.keepRate}% keep rate: discriminating.`], friend: [`Picky! Only ${f.keepRate}% make the cut.`] };
    return null; },
  accuracy: (f) => { if (f.accuracy == null) return null; return {
    cheeky: [`We now guess your reaction right ${f.accuracy}% of the time. Don't let it go to your head. Or ours.`, `${f.accuracy}% predictable. Mysterious, but not that mysterious.`],
    docent: [`The app now predicts your reaction correctly about ${f.accuracy}% of the time.`],
    critic: [`Model accuracy: ${f.accuracy}%. The remaining misses are where your taste is still forming.`],
    friend: [`The app gets you right ${f.accuracy}% of the time now!`] }; },
  artist: (f) => { const a = first(f.likes, "Artist"); if (!a) return null; return {
    cheeky: [`${a} keeps getting your approval. It may be time to admit you have a favorite.`],
    docent: [`${a} is the artist you've responded to most consistently.`],
    critic: [`${a} recurs among your keeps; study what the work has in common.`],
    friend: [`You and ${a} are clearly a match!`] }; },
};
// A closing invitation, always last.
const NEXT = (f, r) => {
  const opts = [];
  if (f.unexplored.length) { const u = pickOne(f.unexplored, r); opts.push({ cheeky: `Next, try ${u}. Worst case, you'll have something new to pass on.`, docent: `Next, try a little ${u}; you haven't seen any yet.`, critic: `Next, test yourself against ${u}, which you haven't seen.`, friend: `Next up: ${u}! You haven't tried it yet.` }); }
  const b = first(f.passes, "Movement");
  if (b) opts.push({ cheeky: `Give ${b} one more honest look before you write it off for good.`, docent: `Consider giving ${b} another look; you may find one that changes your mind.`, critic: `Find the strongest ${b} work you can and judge it fairly.`, friend: `Maybe give ${b} one more chance? You never know!` });
  return opts.length ? pickOne(opts, r) : null;
};
const TITLES = {
  cheeky: ["Where your taste stands", "An honest assessment", "Notes from the back office", "What we've learned about you", "The verdict, for now"],
  docent: ["Your taste so far", "What you respond to", "A note on your looking"],
  critic: ["Critique", "Notes on your eye", "Assessment"],
  friend: ["Look at you go!", "Your art vibe", "What you love"],
};

export function templateNote(f, levelName, opts = {}) {
  const tone = TONES_OK.has(opts.tone) ? opts.tone : "cheeky";
  const r = rng(opts.seed ?? Date.now());
  const avoid = new Set(opts.avoid || []);
  const avail = Object.entries(ANGLES).map(([k, fn]) => [k, fn(f)]).filter(([, v]) => v);
  // Fresh angles first, then shuffled; a level-up always leads with the strongest pattern.
  const fresh = avail.filter(([k]) => !avoid.has(k)), stale = avail.filter(([k]) => avoid.has(k));
  const shuffled = (list) => list.map((x) => [r(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  let order = [...shuffled(fresh), ...shuffled(stale)];
  if (levelName) { const lead = order.find(([k]) => k === "contrast") || order.find(([k]) => k === "movement"); if (lead) order = [lead, ...order.filter((x) => x !== lead)]; }
  const chosen = order.slice(0, 3);
  const lines = chosen.map(([, v]) => pickOne(v[tone] || v.cheeky, r));
  const nxt = NEXT(f, r); if (nxt) lines.push(nxt[tone] || nxt.cheeky);
  if (!chosen.length) lines.unshift("Too early for a verdict. Keep looking; patterns show up after a few dozen works.");
  const title = levelName ? `You're now a ${levelName}` : pickOne(TITLES[tone], r);
  return { title, text: lines.join(" "), angles: chosen.map(([k]) => k), tone };
}
const TONES_OK = new Set(["cheeky", "docent", "critic", "friend"]);
