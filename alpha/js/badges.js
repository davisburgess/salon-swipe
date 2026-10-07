// The badge cabinet: 39 enamel pins in eight families.
// Every rule is computed from your saved decisions, so history counts and nothing has to be logged twice.
// Tiered pins go bronze, silver, gilt, lapis. Higher tiers are earned whenever you reach them but stay sealed
// until your level catches up: silver at Collector, gilt at Curator, lapis at Connoisseur.
// Stored in state.badges as "pin:<id>:<tier>" -> time first earned (a flat map, so sync merges it like before).

import { geoOf, COUNTRY } from "./geo.js";

export const TIERS = [null, { key: "b", name: "Bronze", level: 0 }, { key: "s", name: "Silver", level: 2 }, { key: "g", name: "Gilt", level: 3 }, { key: "l", name: "Lapis", level: 4 }];
export const LEVEL_NAMES = ["Visitor", "Docent", "Collector", "Curator", "Connoisseur", "Director"];

export const FAMILIES = {
  firsts:   { name: "Firsts", enamel: "#7b2d2b", blurb: "The first moves that show you're actually looking." },
  explorer: { name: "Explorer", enamel: "#24427a", blurb: "Range: movements, centuries, the far ends of history." },
  atlas:    { name: "Atlas", enamel: "#2c6b5f", blurb: "Where the art you see was made." },
  museums:  { name: "Museums", enamel: "#2a2d33", blurb: "Seven collections, each with a personality." },
  lineage:  { name: "Lineages", enamel: "#5a2a55", blurb: "Love both ends of a real art-historical connection." },
  eye:      { name: "The Eye", enamel: "#8f6418", blurb: "Traits of your looking, after 40 decisions, when your keeps clearly lean one way." },
  collector:{ name: "Collector", enamel: "#34495e", blurb: "How much you keep, and how well the app reads you." },
  secret:   { name: "After hours", enamel: "#121214", blurb: "Secret until earned." },
};

/* ---------- facts the rules read ---------- */
const HOT = /\b(monet|van gogh|rembrandt|vermeer)\b/i;
const mvOf = (s) => `${(s.a && s.a.movement) || ""} ${(s.f || []).filter((t) => t.startsWith("style|")).map((t) => t.slice(6)).join(" ")}`.toLowerCase();
const yearOf = (s) => (s.a && Number.isFinite(s.a.year) ? s.a.year : null);
const NORTH_AFRICA = new Set(["EG", "MA", "DZ", "TN", "LY"]);
const SIDES = {
  ukiyo: (s, mv, g) => /ukiyo|floating world/.test(mv) || (g && g.iso === "JP" && /print|woodblock/i.test(`${s.a.kind} ${s.a.medium}`)),
  impressionist: (s, mv) => /impressionis/.test(mv),
  greek: (s, mv, g, y) => /greek|greece|hellenistic|cycladic/.test(mv) || (g && g.iso === "GR" && y != null && y < 0),
  roman: (s, mv, g, y) => /\broman?\b|\brome\b/.test(mv) || (g && g.iso === "IT" && y != null && y < 500),
  byzantine: (s, mv, g, y) => /byzantine/.test(mv) || (g && g.iso === "TR" && y != null && y >= 330 && y <= 1453),
  vienna: (s, mv) => /secession|jugendstil|wiener/.test(mv) || /klimt|schiele|kolo moser|kokoschka/i.test((s.a && s.a.artist) || ""),
  preraph: (s, mv) => /pre-?raphaelite/.test(mv) || /rossetti|millais|burne-jones|holman hunt|waterhouse/i.test((s.a && s.a.artist) || ""),
  earlyItalian: (s, mv, g, y) => /italian renaissance|early renaissance/.test(mv) || (g && g.iso === "IT" && y != null && y >= 1250 && y < 1520),
  cubist: (s, mv) => /cubis/.test(mv),
  africa: (s, mv, g) => /\bart of africa\b|\bafrican\b/.test(mv) || (g && g.continent === "AF" && !NORTH_AFRICA.has(g.iso)),
  neoclassical: (s, mv) => /neo-?classic/.test(mv),
};

export function badgeStats(state, model) {
  const sw = state.swipes || [];
  const st = { decided: 0, loves: 0, keeps: 0, passes: 0, why: 0, styles: new Set(), cents: new Set(), countries: new Set(), keptContinents: new Set(),
    lovedCountries: new Set(), srcAny: {}, lovesBySrc: {}, onViewKeeps: 0, secondLook: 0, deepTime: false, wetPaint: false, bookends: false,
    sides: {}, runMax: 0, perDay: {}, afterHours: false, hotTake: false, lovesByArtist: {}, changeOfHeart: false,
    undo: (state.counters && state.counters.undo) || 0, accuracy: model ? model.accuracy : null, eye: {} };
  const passesByStyle = {}, keepsWindow = [];
  const oldest = new Date().getFullYear() - 2000;
  let run = 0;
  for (const s of sw) {
    const a = s.a || {}, v = s.v, y = yearOf(s), mv = mvOf(s), g = geoOf(a, s.f);
    if (s.v !== 0) st.decided++;
    if (v === 2) st.loves++; if (v > 0) st.keeps++; if (v === -1) st.passes++;
    if (s.why && s.why.length) st.why++;
    for (const t of s.f || []) { if (t.startsWith("style|")) st.styles.add(t.slice(6)); else if (t.startsWith("cent|")) st.cents.add(t.slice(5)); }
    if (g && g.iso) st.countries.add(g.iso);
    if (a.src) st.srcAny[a.src] = (st.srcAny[a.src] || 0) + (v !== 0 ? 1 : 0);
    if (v > 0) {
      if (g) st.keptContinents.add(g.continent);
      if (a.onView) st.onViewKeeps++;
      // Bookends: two keeps 3,000 years apart within three hours of each other.
      if (y != null) { keepsWindow.push({ t: s.t || 0, y }); while (keepsWindow.length && (s.t || 0) - keepsWindow[0].t > 3 * 3600e3) keepsWindow.shift();
        const ys = keepsWindow.map((k) => k.y); if (Math.max(...ys) - Math.min(...ys) >= 3000) st.bookends = true; }
    }
    if (v === 2) {
      if (g && g.iso) st.lovedCountries.add(g.iso);
      if (a.src) st.lovesBySrc[a.src] = (st.lovesBySrc[a.src] || 0) + 1;
      if (y != null && y <= oldest) st.deepTime = true;
      if (y != null && y >= 1900) st.wetPaint = true;
      for (const [k, fn] of Object.entries(SIDES)) if (!st.sides[k] && fn(s, mv, g, y)) st.sides[k] = true;
      if (a.artist) st.lovesByArtist[a.artist] = (st.lovesByArtist[a.artist] || 0) + 1;
      for (const t of s.f || []) if (t.startsWith("style|") && (passesByStyle[t] || 0) >= 5) st.changeOfHeart = true;
    }
    if (v === -1) { for (const t of s.f || []) if (t.startsWith("style|")) passesByStyle[t] = (passesByStyle[t] || 0) + 1; if (HOT.test(a.artist || "")) st.hotTake = true; }
    if (s.look && v !== 0) st.secondLook++;
    run = v === 2 ? run + 1 : 0; st.runMax = Math.max(st.runMax, run);
    if (s.t && v !== 0) { const d = new Date(s.t); const day = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; st.perDay[day] = (st.perDay[day] || 0) + 1; if (d.getHours() < 4) st.afterHours = true; }
  }
  st.range = st.styles.size; st.centuries = st.cents.size; st.nCountries = st.countries.size;
  st.sources = Object.values(st.srcAny).filter((n) => n > 0).length;
  st.maxDay = Math.max(0, ...Object.values(st.perDay));
  st.topSrc = Object.entries(st.lovesBySrc).sort((a, b) => b[1] - a[1])[0] || null;
  st.fan = Object.entries(st.lovesByArtist).sort((a, b) => b[1] - a[1])[0] || null;
  // Eye traits: a visual quality you keep clearly more often than you keep things in general.
  const base = st.decided ? (2 * st.loves + (st.keeps - st.loves)) / (2 * st.loves + (st.keeps - st.loves) + st.passes) : 0;
  if (model && model.counts) for (const tok of ["light|Dark", "light|Bright", "sat|Vivid", "sat|Muted", "busy|Busy", "busy|Calm", "warm|Warm", "warm|Cool"]) {
    const c = model.counts.get(tok); if (!c || c.c < 15) continue;
    const rate = c.p / (c.p + c.n); st.eye[tok] = { rate, lift: rate - base, seen: c.c };
  }
  return st;
}
const eyeTrait = (tok) => (st) => st.decided >= 40 && st.eye[tok] && st.eye[tok].lift >= 0.12;
const both = (a, b) => (st) => !!(st.sides[a] && st.sides[b]);
const halves = (a, b, la, lb) => (st) => ({ have: (st.sides[a] ? 1 : 0) + (st.sides[b] ? 1 : 0), need: 2,
  hint: st.sides[a] && !st.sides[b] ? `Done: ${la}. Still to love: ${lb}.` : st.sides[b] && !st.sides[a] ? `Done: ${lb}. Still to love: ${la}.` : null });

/* ---------- the cabinet ----------
   value(st) -> number for tiered pins (tiers = thresholds), or test(st) -> bool for single pins.
   progress(st) -> { have, need, hint } shows a bar for single pins that can show one. */
export const BADGES = [
  { id: "first-love", fam: "firsts", name: "First Love", em: "heart", how: "Love a work.", fact: "Every collection starts with one work you couldn't walk past.", test: (s) => s.loves >= 1 },
  { id: "second-thoughts", fam: "firsts", name: "Second Thoughts", em: "hourglass", how: "Decide on a work you'd put off.", fact: "Slow looking has its own holiday: Slow Art Day, held each April.", test: (s) => s.secondLook >= 1 },
  { id: "artists-statement", fam: "firsts", name: "Artist's Statement", em: "quill", how: "Give reasons for your Loves.", unit: "Loves with reasons", tiers: [10, 40, 120, 300], value: (s) => s.why, fact: "Shorter and clearer than most artist's statements." },
  { id: "refuses", fam: "firsts", name: "Salon des Refusés", em: "refuse", how: "Pass on works.", unit: "passes", tiers: [100, 300, 750, 1500], value: (s) => s.passes, fact: "In 1863 Napoleon III let the Paris Salon's rejects show next door. Manet's Le Déjeuner sur l'herbe stole the show." },
  { id: "pentimento", fam: "firsts", name: "Pentimento", em: "pentimento", how: "Change your mind 10 times with Undo.", progress: (s) => ({ have: s.undo, need: 10 }), test: (s) => s.undo >= 10, fact: "Italian for 'repentance': an earlier idea showing through the paint. X-rays find them under many Old Masters." },

  { id: "grand-tour", fam: "explorer", name: "Grand Tour", em: "compass", how: "Judge works from many movements.", unit: "movements", tiers: [10, 25, 39, 60], value: (s) => s.range, fact: "Young British aristocrats spent months touring Italy's art in the 1700s. You're doing it with a thumb." },
  { id: "time-machine", fam: "explorer", name: "Time Machine", em: "clock", how: "Judge works from many centuries.", unit: "centuries", tiers: [6, 10, 15, 20], value: (s) => s.centuries, fact: "Five thousand years, give or take, in a single deck." },
  { id: "deep-time", fam: "explorer", name: "Deep Time", em: "amphora", how: "Love a work more than 2,000 years old.", test: (s) => s.deepTime, fact: "Older than the first public museums by more than 1,600 years." },
  { id: "wet-paint", fam: "explorer", name: "Wet Paint", em: "drip", how: "Love a work made after 1900.", test: (s) => s.wetPaint, fact: "Practically still drying." },
  { id: "bookends", fam: "explorer", name: "Bookends", em: "bookends", how: "Keep two works made 3,000 years apart within three hours.", test: (s) => s.bookends, fact: "Pharaoh, meet skyscraper." },

  { id: "passport", fam: "atlas", name: "Passport", em: "globe", how: "Judge art from many countries.", unit: "countries", tiers: [10, 25, 40, 60], value: (s) => s.nCountries, fact: "Stamped without a single queue." },
  { id: "all-six", fam: "atlas", name: "All Six", em: "continents", how: "Keep a work from every inhabited continent.", progress: (s) => ({ have: s.keptContinents.size, need: 6 }), test: (s) => s.keptContinents.size >= 6, fact: "Antarctica's collection is mostly ice. You're excused." },
  { id: "silk-road", fam: "atlas", name: "Silk Road", em: "silk", how: "Love works from China, Iran and Italy.", progress: (s) => ({ have: ["CN", "IR", "IT"].filter((c) => s.lovedCountries.has(c)).length, need: 3 }),
    test: (s) => ["CN", "IR", "IT"].every((c) => s.lovedCountries.has(c)), fact: "Named in 1877 by the geographer Ferdinand von Richthofen. Cobalt from Persia helped make China's blue-and-white porcelain." },

  { id: "museum-hopper", fam: "museums", name: "Museum Hopper", em: "ticket", how: "Judge works from different museums.", unit: "museums", tiers: [3, 5, 7], value: (s) => s.sources, fact: "Seven admissions, no coat check." },
  { id: "home-museum", fam: "museums", name: "Home Museum", em: "facade", how: "Love 15 works from one museum.", progress: (s) => ({ have: s.topSrc ? s.topSrc[1] : 0, need: 15 }), test: (s) => !!s.topSrc && s.topSrc[1] >= 15, fact: "Every serious looker has a home museum. Yours is the one you love most." },
  { id: "field-trip", fam: "museums", name: "Field Trip", em: "pin", how: "Keep 5 works that are on view right now.", progress: (s) => ({ have: s.onViewKeeps, need: 5 }), test: (s) => s.onViewKeeps >= 5, fact: "They're on a wall somewhere today. Go see one." },

  { id: "japonisme", fam: "lineage", name: "Japonisme", em: "wave", how: "Love an ukiyo-e print and an Impressionist painting.", test: both("ukiyo", "impressionist"), progress: halves("ukiyo", "impressionist", "ukiyo-e", "Impressionism"), fact: "The critic Philippe Burty named the craze in 1872. Monet, Degas and Van Gogh all collected Japanese prints." },
  { id: "copycat-empire", fam: "lineage", name: "Copycat Empire", em: "laurel", how: "Love a Greek work and a Roman one.", test: both("greek", "roman"), progress: halves("greek", "roman", "Greek", "Roman"), fact: "Many famous Greek bronzes survive only as Roman marble copies." },
  { id: "gold-standard", fam: "lineage", name: "Gold Standard", em: "mosaic", how: "Love a Byzantine work and a Vienna Secession one.", test: both("byzantine", "vienna"), progress: halves("byzantine", "vienna", "Byzantine", "Vienna Secession"), fact: "Klimt saw the gold mosaics of Ravenna in 1903. His golden phase followed." },
  { id: "brotherhood", fam: "lineage", name: "Brotherhood", em: "lily", how: "Love a Pre-Raphaelite work and an early Italian Renaissance one.", test: both("preraph", "earlyItalian"), progress: halves("preraph", "earlyItalian", "Pre-Raphaelite", "early Italian Renaissance"), fact: "Rossetti, Hunt and Millais founded the Pre-Raphaelite Brotherhood in 1848 to paint like the masters before Raphael." },
  { id: "crossed-paths", fam: "lineage", name: "Crossed Paths", em: "facets", how: "Love a Cubist work and a work from Africa.", test: both("cubist", "africa"), progress: halves("cubist", "africa", "Cubism", "art of Africa"), fact: "Picasso visited Paris's ethnographic museum at the Trocadéro in 1907 while painting Les Demoiselles d'Avignon." },
  { id: "back-to-the-future", fam: "lineage", name: "Back to the Future", em: "column", how: "Love a Neoclassical work and an ancient Greek or Roman one.", test: (s) => s.sides.neoclassical && (s.sides.greek || s.sides.roman),
    progress: (s) => ({ have: (s.sides.neoclassical ? 1 : 0) + (s.sides.greek || s.sides.roman ? 1 : 0), need: 2 }), fact: "Digs at Herculaneum (1738) and Pompeii (1748) sent Europe back to antiquity for its new style." },

  { id: "tenebrist", fam: "eye", name: "Tenebrist", em: "candle", how: "Keep dark works more than most.", test: eyeTrait("light|Dark"), tok: "light|Dark", fact: "From the Italian tenebroso, murky. Caravaggio made it famous." },
  { id: "plein-air", fam: "eye", name: "Plein Air", em: "sun", how: "Keep bright works more than most.", test: eyeTrait("light|Bright"), tok: "light|Bright", fact: "Paint in tubes, invented in 1841, let painters work outdoors." },
  { id: "wild-beast", fam: "eye", name: "Wild Beast", em: "beast", how: "Keep vivid works more than most.", test: eyeTrait("sat|Vivid"), tok: "sat|Vivid", fact: "A critic called Matisse and friends les fauves, wild beasts, at the 1905 Salon d'Automne." },
  { id: "grisaille", fam: "eye", name: "Grisaille", em: "grisaille", how: "Keep muted works more than most.", test: eyeTrait("sat|Muted"), tok: "sat|Muted", fact: "A painting made entirely in greys. Restraint, but make it art." },
  { id: "horror-vacui", fam: "eye", name: "Horror Vacui", em: "vacui", how: "Keep busy, detailed works more than most.", test: eyeTrait("busy|Busy"), tok: "busy|Busy", fact: "Latin for fear of empty space. You'd fill it too." },
  { id: "less-is-more", fam: "eye", name: "Less Is More", em: "less", how: "Keep calm, sparse works more than most.", test: eyeTrait("busy|Calm"), tok: "busy|Calm", fact: "Robert Browning wrote the line in 1855, in a poem about a painter. Mies van der Rohe borrowed it." },
  { id: "warm-blooded", fam: "eye", name: "Warm Blooded", em: "flame", how: "Keep warm-toned works more than most.", test: eyeTrait("warm|Warm"), tok: "warm|Warm", fact: "Reds, ochres and gold leaf. You run warm." },
  { id: "cool-customer", fam: "eye", name: "Cool Customer", em: "snow", how: "Keep cool-toned works more than most.", test: eyeTrait("warm|Cool"), tok: "warm|Cool", fact: "Blues and greys. Unflappable." },

  { id: "salon-hang", fam: "collector", name: "Salon Hang", em: "salon", how: "Keep works.", unit: "keeps", tiers: [50, 150, 400, 1000], value: (s) => s.keeps, fact: "The Paris Salon hung paintings floor to ceiling. Your wall is getting there." },
  { id: "open-book", fam: "collector", name: "Open Book", em: "book", how: "The app predicts you 75% of the time, after 100 decisions.", test: (s) => s.decided >= 100 && (s.accuracy ?? 0) >= 0.75, fact: "We can read you like a wall label." },
  { id: "enigma", fam: "collector", name: "Enigma", em: "enigma", how: "Still under 55% predictable after 150 decisions.", test: (s) => s.decided >= 150 && s.accuracy != null && s.accuracy < 0.55, fact: "We've stopped trying to predict you. Congratulations." },

  { id: "stendhal", fam: "secret", name: "Stendhal Syndrome", em: "stendhal", how: "Love five works in a row.", test: (s) => s.runMax >= 5, fact: "Stendhal described nearly fainting from beauty in Florence in 1817. A psychiatrist named the syndrome after him in 1979." },
  { id: "museum-feet", fam: "secret", name: "Museum Feet", em: "feet", how: "Make 100 decisions in one day.", test: (s) => s.maxDay >= 100, fact: "The curator Benjamin Ives Gilman named 'museum fatigue' in 1916. Sit down." },
  { id: "after-hours", fam: "secret", name: "After Hours", em: "moon", how: "Decide on a work between midnight and 4 a.m.", test: (s) => s.afterHours, fact: "The guards have gone home. The art hasn't." },
  { id: "hot-take", fam: "secret", name: "Hot Take", em: "hot", how: "Pass on a Monet, Van Gogh, Rembrandt or Vermeer.", test: (s) => s.hotTake, fact: "Bold. The gift shop will survive." },
  { id: "fan-mail", fam: "secret", name: "Fan Mail", em: "mail", how: "Love three works by one artist.", test: (s) => !!s.fan && s.fan[1] >= 3, fact: "At this point, write them a letter." },
  { id: "change-of-heart", fam: "secret", name: "Change of Heart", em: "change", how: "Love a movement you'd passed on five times.", test: (s) => s.changeOfHeart, fact: "People change. Movements are patient." },
];
export const byId = Object.fromEntries(BADGES.map((b) => [b.id, b]));

// Highest tier reached by the rules (1 for an earned single pin, 0 for none).
export function reached(b, st) {
  if (b.tiers) { const v = b.value(st); let k = 0; b.tiers.forEach((t, i) => { if (v >= t) k = i + 1; }); return k; }
  return b.test(st) ? 1 : 0;
}
export const earnedTier = (state, id) => { let k = 0; for (let t = 1; t <= 4; t++) if (state.badges[`pin:${id}:${t}`]) k = t; return k; };
export const tierOpen = (tier, level) => !TIERS[tier] || level >= TIERS[tier].level;

// Record every pin and tier the history supports. Returns what's new: [{ b, tier, sealed }].
export function award(state, st, level, now = Date.now()) {
  const fresh = [];
  for (const b of BADGES) {
    const r = reached(b, st);
    for (let t = 1; t <= r; t++) {
      const key = `pin:${b.id}:${t}`;
      if (!state.badges[key]) { state.badges[key] = now; fresh.push({ b, tier: t, sealed: !!b.tiers && !tierOpen(t, level) }); }
    }
  }
  return fresh;
}

// Pins whose seal a level just broke.
export function unsealedAt(state, level) {
  const out = [];
  for (const b of BADGES) if (b.tiers) for (let t = 2; t <= 4; t++) if (state.badges[`pin:${b.id}:${t}`] && TIERS[t].level === level) out.push({ b, tier: t });
  return out;
}

// What a pin should look like and say right now.
export function pinState(state, b, st, level) {
  const tier = earnedTier(state, b.id);
  const open = b.tiers ? Math.max(0, ...[0, 1, 2, 3, 4].filter((t) => t <= tier && tierOpen(t, level))) : tier;
  const sealed = b.tiers && tier > open ? tier : 0;
  let next = null;
  if (b.tiers) { const nt = tier + 1; if (nt <= b.tiers.length) next = { tier: nt, have: b.value(st), need: b.tiers[nt - 1] }; }
  else if (!tier && b.progress) { const p = b.progress(st); next = { tier: 1, ...p }; }
  return { tier, shown: open, sealed, next, secretHidden: b.fam === "secret" && !tier, t: tier ? state.badges[`pin:${b.id}:${tier}`] : null };
}

// The three pins closest to their next step, for the "Closest next" shelf.
export function closest(state, st, level, k = 3) {
  return BADGES.filter((b) => b.fam !== "secret" && b.fam !== "eye")
    .map((b) => ({ b, ps: pinState(state, b, st, level) }))
    .filter(({ ps }) => ps.next && ps.next.need > 0 && ps.next.have < ps.next.need)
    .map((x) => ({ ...x, frac: x.ps.next.have / x.ps.next.need }))
    .filter((x) => x.frac > 0)
    .sort((a, b) => b.frac - a.frac).slice(0, k);
}

/* ---------- your eye, as a title ---------- */
const ADJ = { "light|Dark": "Moody", "light|Bright": "Sunlit", "sat|Vivid": "Technicolor", "sat|Muted": "Hushed", "busy|Busy": "Maximalist", "busy|Calm": "Quiet", "warm|Warm": "Golden", "warm|Cool": "Cool-Headed" };
const NOUNS = [[/ukiyo/, "Floating-Worlder"], [/post-impressionis/, "Post-Impressionist"], [/impressionis/, "Impressionist"], [/pointill/, "Pointillist"], [/fauv/, "Fauve"],
  [/cubis/, "Cubist"], [/expressionis/, "Expressionist"], [/symbolis/, "Symbolist"], [/futuris/, "Futurist"], [/romantic/, "Romantic"], [/realis/, "Realist"],
  [/neo-?classic/, "Neoclassicist"], [/rococo/, "Rococo Courtier"], [/baroque|dutch golden|netherlandish|northern renaissance|flemish/, "Old Master"],
  [/renaissance/, "Renaissance Mind"], [/gothic|medieval|romanesque/, "Medievalist"], [/byzantine/, "Icon Keeper"], [/egypt|greek|greece|roman|rome|ancient|antiquity/, "Antiquarian"],
  [/pre-?raphaelite/, "Pre-Raphaelite"], [/art nouveau|secession|jugendstil/, "Aesthete"], [/arts and crafts/, "Craftsperson"], [/hudson river|tonalis|luminis/, "Wilderness Romantic"],
  [/mughal|persian|islamic/, "Miniaturist"], [/ming|qing|song|chinese|china/, "Scholar-Painter"], [/precisionis|modern/, "Modernist"]];
export function eyeTitle(st, model) {
  if (st.decided < 25) return null;
  const traits = Object.entries(st.eye).filter(([, e]) => e.lift >= 0.06).sort((a, b) => b[1].lift - a[1].lift);
  const adj = traits.length ? ADJ[traits[0][0]] : null;
  const styles = model ? model.leaning("style", 8, 3).filter((x) => x.weight > 0) : [];
  let noun = null;
  for (const s of styles) { const hit = NOUNS.find(([re]) => re.test(s.value.toLowerCase())); if (hit) { noun = hit[1]; break; } }
  if (!noun) noun = "Eclectic";
  return { title: `The ${adj ? adj + " " : ""}${noun}`, traits: traits.slice(0, 3).map(([tok]) => tok) };
}

/* ---------- artwork ---------- */
// Emblems are drawn on a 24-unit grid with round strokes.
const E = {
  heart: "M12 20s-7-4.6-7-10.2A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.2C19 15.4 12 20 12 20z",
  hourglass: "M7 3h10M7 21h10M8 3c0 5 8 6 8 9s-8 4-8 9M16 3c0 5-8 6-8 9s8 4 8 9",
  quill: "M19 3C11 4 6.5 10 5 21M19 3c-.6 6-5 10-11.5 10.5M10 12l2.5 2.5",
  refuse: "M5 4h14v16H5zM8 8h8v8H8zM9.5 9.5l5 5M14.5 9.5l-5 5",
  pentimento: "M9 6L5 10l4 4M5 10h9a5 5 0 0 1 0 10h-3",
  compass: "M12 2.5l2.3 9.5L12 21.5 9.7 12zM2.5 12l9.5-2.3 9.5 2.3-9.5 2.3z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2",
  amphora: "M9 3h6M10 3v3c-4 2-5 6-3 10l2 4h6l2-4c2-4 1-8-3-10V3M7 9c-2.5 0-3 3-1.5 4.5M17 9c2.5 0 3 3 1.5 4.5",
  drip: "M4 4h16v5c0 1.2-1 1.2-1 2.4V15a1.2 1.2 0 0 1-2.4 0v-2.5c0-.8-1.2-.8-1.2 0v6.3a1.2 1.2 0 0 1-2.4 0v-8.6c0-.8-1.2-.8-1.2 0V12a1.2 1.2 0 0 1-2.4 0V9.4C8.4 8.6 4 9 4 9z",
  bookends: "M2.5 20.5h19M3.5 20.5v-8M7.5 20.5v-8M2.5 12.5h6l-3-3zM14 20.5V4.5h5.5v16M16 7.5h1.5M16 10.5h1.5M16 13.5h1.5M16 16.5h1.5",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3.2 3 3.2 15 0 18M12 3c-3.2 3-3.2 15 0 18",
  continents: "M12 2.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM5 19.5h14M12 16.5v3M8 6.5c1.5 1 1 3 3 3.5s1 3 2.5 3M14 4c0 1.5 2 2 3 1.5",
  silk: "M3 19c3 0 4-4 7-4s3.5-6 7-6 3-3 4-3M3 19h.01M21 6h.01M10 15h.01M17 9h.01",
  ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4zM15 7v2M15 11v2M15 15v2",
  facade: "M3 9l9-5 9 5M4 9h16M6 9v8M10 9v8M14 9v8M18 9v8M3 19.5h18",
  pin: "M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21zM12 7.8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  wave: "M2.5 17c3 0 4.5-1.5 5.5-5 1.2-4.2 5.5-6.3 9-4.2-2.2-.2-3.6 1.8-2.7 3.8.8 1.6 3 1.7 4.2.4M2.5 20.5h19",
  laurel: "M12 20.5c-5-1.8-8-6.8-7-13.5M12 20.5c5-1.8 8-6.8 7-13.5M6.2 10.5L3.8 9.6M6.4 14.2l-2.4.3M8.6 17.4l-1.8 1.4M17.8 10.5l2.4-.9M17.6 14.2l2.4.3M15.4 17.4l1.8 1.4",
  mosaic: "M4 4h4.5v4.5H4zM9.75 4h4.5v4.5h-4.5zM15.5 4H20v4.5h-4.5zM4 9.75h4.5v4.5H4zM15.5 9.75H20v4.5h-4.5zM4 15.5h4.5V20H4zM9.75 15.5h4.5V20h-4.5zM15.5 15.5H20V20h-4.5zM12 11v2",
  lily: "M12 21V12M12 12c-3.2 0-5.2-3-5.2-6.5 3.2 0 5.2 2.4 5.2 6.5zM12 12c3.2 0 5.2-3 5.2-6.5-3.2 0-5.2 2.4-5.2 6.5zM12 12V3M9 21h6",
  facets: "M12 3l7.5 6.5L16 21H8L4.5 9.5zM4.5 9.5h15M12 3L8 21M12 3l4 18",
  column: "M6.5 5h11M8 5c-2.2 0-2.2 3 0 3M16 5c2.2 0 2.2 3 0 3M9 8v11M12 8v11M15 8v11M6.5 19.5h11",
  candle: "M12 3.5c2 2.6 2.8 5-.1 7.8-2.8-2.8-2-5.2.1-7.8zM9.8 12.5h4.4v8H9.8zM7 20.5h10",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8",
  beast: "M5 6l3 3M19 6l-3 3M6 10c0-3 2.7-4.5 6-4.5S18 7 18 10v3c0 4-3 7-6 7s-6-3-6-7zM9.5 12.5h.01M14.5 12.5h.01M10.5 16.5l1.5 1 1.5-1",
  grisaille: "M4 4h16v16H4zM4 9.3h16M4 14.6h16",
  vacui: "M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12 12m-4.5 0a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0",
  less: "M4 4h16v16H4zM16 15.5h.01",
  flame: "M12 21c-4 0-6.5-2.8-6.5-6.2 0-4.2 4-6.3 4-10.3 3 2 4.4 4.3 4.4 6.4.9-.8 1.2-2 1.2-3.1 2.2 2.1 3.4 4.4 3.4 7 0 3.4-2.5 6.2-6.5 6.2z",
  snow: "M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2",
  salon: "M3 3.5h8v6H3zM13 3.5h8v9h-8zM3 11.5h8v9H3zM13 14.5h8v6h-8z",
  book: "M12 6.5c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1v-14c-3-1-6-1-9 1zM12 6.5v14",
  enigma: "M9 9a3 3 0 1 1 4.2 2.8c-.9.4-1.2 1-1.2 2.2M12 17.5h.01",
  stendhal: "M12 20s-7-4.6-7-10.2A3.9 3.9 0 0 1 12 7.6a3.9 3.9 0 0 1 7 2.2C19 15.4 12 20 12 20zM19.5 2.5v4M17.5 4.5h4",
  feet: "M8 3.5c2 0 3 2 3 5s-1.2 4.8-3 4.8-3-1.8-3-4.8 1-5 3-5zM6.6 15.5h3v2.7a1.5 1.5 0 0 1-3 0zM16 6.5c2 0 3 2 3 5s-1.2 4.5-3 4.5-3-1.5-3-4.5 1-5 3-5zM14.6 18h3v1a1.5 1.5 0 0 1-3 0z",
  moon: "M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z",
  hot: "M4 4.5h16v11H9.5L4 20zM12 7.5v4.5M12 14h.01",
  mail: "M3 6h18v12H3zM3 6l9 7 9-7",
  change: "M4 12a8 8 0 0 1 13.7-5.6L20 4v6h-6l2.2-2.2A5.5 5.5 0 0 0 6.5 12M20 12a8 8 0 0 1-13.7 5.6L4 20v-6h6l-2.2 2.2A5.5 5.5 0 0 0 17.5 12",
  question: "M9 9a3 3 0 1 1 4.2 2.8c-.9.4-1.2 1-1.2 2.2M12 17.5h.01",
};

// Shared gradients, added to the page once.
export function ensureDefs(doc = document) {
  if (doc.getElementById("pp-pin-defs")) return;
  const host = doc.createElement("div");
  host.innerHTML = `<svg id="pp-pin-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
    <linearGradient id="pp-m1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2a873"/><stop offset=".45" stop-color="#9a5a2c"/><stop offset=".7" stop-color="#c98a52"/><stop offset="1" stop-color="#6e3e1c"/></linearGradient>
    <linearGradient id="pp-m2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f5f6"/><stop offset=".45" stop-color="#9da3aa"/><stop offset=".7" stop-color="#d9dcdf"/><stop offset="1" stop-color="#6b7178"/></linearGradient>
    <linearGradient id="pp-m3" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e3a1"/><stop offset=".45" stop-color="#b3872f"/><stop offset=".7" stop-color="#e9c66d"/><stop offset="1" stop-color="#7d5a17"/></linearGradient>
    <linearGradient id="pp-m4" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d7fe0"/><stop offset=".45" stop-color="#1b2f74"/><stop offset=".7" stop-color="#3553b8"/><stop offset="1" stop-color="#0d1a48"/></linearGradient>
    <radialGradient id="pp-sheen" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".5" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".18"/></radialGradient>
  </defs></svg>`;
  doc.body.appendChild(host.firstElementChild);
}

const TICKS = Array.from({ length: 48 }, (_, i) => { const a = (i / 48) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  return `M${(50 + c * 41.5).toFixed(1)} ${(50 + s * 41.5).toFixed(1)}L${(50 + c * 44).toFixed(1)} ${(50 + s * 44).toFixed(1)}`; }).join("");
// Gold flecks for lapis, the way real lapis lazuli carries pyrite.
const FLECKS = [20, 65, 110, 160, 205, 250, 300, 340].map((d, i) => { const a = (d * Math.PI) / 180, r = i % 2 ? 40 : 38.5;
  return `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(50 + Math.sin(a) * r).toFixed(1)}" r="${i % 3 ? .9 : 1.3}" fill="#f1d27a"/>`; }).join("");

// mode: "earned" | "sealed" (earned, waiting for a level) | "locked" (shown faded) | "secret" (embossed question mark)
export function pinSVG(b, tier = 1, mode = "earned") {
  const fam = FAMILIES[b.fam];
  if (mode === "secret") {
    const path = E.question;
    return `<svg class="pinart" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle cx="50" cy="50" r="44" class="emb-fill"/>
      <circle cx="50" cy="50" r="43" fill="none" class="emb-lo" stroke-width="1.6" transform="translate(-.8 -.8)"/>
      <circle cx="50" cy="50" r="43" fill="none" class="emb-hi" stroke-width="1.6" transform="translate(.8 .8)"/>
      <circle cx="50" cy="50" r="34" fill="none" class="emb-hi" stroke-width="1.2" transform="translate(-.6 -.6)"/>
      <circle cx="50" cy="50" r="34" fill="none" class="emb-lo" stroke-width="1.2" transform="translate(.6 .6)"/>
      <g transform="translate(26 26) scale(2)" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
        <path d="${path}" class="emb-hi" transform="translate(.35 .35)"/><path d="${path}" class="emb-lo"/></g></svg>`;
  }
  const metal = `url(#pp-m${Math.min(4, Math.max(1, tier))})`;
  const ink = b.fam === "secret" ? "#e5c770" : "#f4ead2";
  const seal = mode === "sealed" ? `<g transform="translate(74 74)"><circle r="13" fill="#8e2a20"/><circle r="13" fill="url(#pp-sheen)"/><circle r="9" fill="none" stroke="#c2574a" stroke-width="1.4"/>
      <path d="M-3.5 -1v-2.5a3.5 3.5 0 0 1 7 0V-1M-5 -1h10v7h-10z" fill="none" stroke="#f4ead2" stroke-width="1.5" stroke-linejoin="round"/></g>` : "";
  return `<svg class="pinart ${mode}" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><g class="pinbody">
    <circle cx="50" cy="52" r="45" fill="#000" opacity=".16"/>
    <circle cx="50" cy="50" r="45" fill="${metal}"/>
    <path d="${TICKS}" stroke="#000" stroke-opacity=".22" stroke-width=".8"/>
    ${tier === 4 ? FLECKS : ""}
    <circle cx="50" cy="50" r="37" fill="${metal}" transform="rotate(180 50 50)"/>
    <circle cx="50" cy="50" r="34.5" fill="${fam.enamel}"/>
    <circle cx="50" cy="50" r="34.5" fill="url(#pp-sheen)"/>
    <g transform="translate(26 26) scale(2)" fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="${E[b.em]}"/></g>
    <path d="M24 34a30 30 0 0 1 22-18" stroke="#fff" stroke-opacity=".35" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>${seal}</svg>`;
}

export const tierName = (b, t) => (b.tiers && TIERS[t] ? TIERS[t].name : "");
export const countryName = (iso) => (COUNTRY[iso] ? COUNTRY[iso].name : iso);
