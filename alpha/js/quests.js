// Quests: point the deck at something for a while. A quest is a criterion plus a length:
//   { school, movement, iso, cont, yearFrom, yearTo, type, artist, src, newCountry, newMovement, newCentury }
// Any combination works; a work counts when it meets every field. Inside a quest the recommender still personalizes:
// you get your best matches from the Baroque, not random Baroque. Museum Day and Explore are quests too.
// Suggestions connect quests to badges ("love an Impressionist painting to finish Japonisme").

import { geoOf, COUNTRY, CONTINENTS } from "./geo.js";
import { canonMovement, schoolOf, typeOf, SCHOOL_QUERY, SCHOOLS } from "./vocab.js";
import { centuryOf, norm } from "./util.js";
import { MUSEUMS } from "./sources.js";

export const QUEST_LENGTHS = [10, 20, 30];
const NOW = new Date().getFullYear();

// What a work is, in quest terms (cached on the work).
export function facts(a) {
  if (a._q) return a._q;
  const g = geoOf(a), y = Number.isFinite(a.year) ? a.year : null;
  return (a._q = { iso: g && g.iso, cont: g && g.continent, year: y, movement: canonMovement(a.movement), school: schoolOf(a.movement, g, y),
    type: typeOf(a.kind, a.medium || a.mediumFamily), artist: norm(a.artist), century: centuryOf(y), src: a.src });
}

// Does this work count toward the quest?
export function matches(quest, a) {
  if (!quest || !a) return false;
  return matchFacts(quest, facts(a));
}
function matchFacts(quest, f) {
  const c = quest.crit, ex = quest.excl || {};
  if (c.src && f.src !== c.src) return false;
  if (c.iso && f.iso !== c.iso) return false;
  if (c.cont && f.cont !== c.cont) return false;
  if (c.school && f.school !== c.school) return false;
  if (c.movement && f.movement !== c.movement) return false;
  if (c.type && f.type !== c.type) return false;
  if (c.artist && !(f.artist && f.artist.includes(norm(c.artist)))) return false;
  if (c.yearFrom != null && !(f.year != null && f.year >= c.yearFrom)) return false;
  if (c.yearTo != null && !(f.year != null && f.year < c.yearTo)) return false;
  if (c.newCountry && !(f.iso && !(ex.countries || []).includes(f.iso))) return false;
  if (c.newMovement && !(f.movement && !(ex.movements || []).includes(f.movement))) return false;
  if (c.newCentury && !(f.century && !(ex.centuries || []).includes(f.century))) return false;
  return true;
}

const yearLabel = (y) => (y < 0 ? `${-y} BCE` : String(y));
export function label(crit) {
  const parts = [];
  if (crit.newCountry) parts.push("Countries you haven't seen");
  if (crit.newMovement) parts.push("Movements you haven't seen");
  if (crit.newCentury) parts.push("Centuries you haven't seen");
  if (crit.movement) parts.push(crit.movement);
  if (crit.school) parts.push(crit.school);
  if (crit.type) parts.push(crit.type.endsWith("s") ? crit.type : `${crit.type}s`);
  if (crit.artist) parts.push(crit.artist);
  if (crit.iso) parts.push(`from ${COUNTRY[crit.iso] ? COUNTRY[crit.iso].name : crit.iso}`);
  if (crit.cont) parts.push(`from ${CONTINENTS[crit.cont]}`);
  if (crit.yearFrom != null && crit.yearTo != null) parts.push(`${yearLabel(crit.yearFrom)}–${yearLabel(crit.yearTo)}`);
  else if (crit.yearFrom != null) parts.push(`after ${yearLabel(crit.yearFrom)}`);
  else if (crit.yearTo != null) parts.push(`before ${yearLabel(crit.yearTo)}`);
  if (crit.src) parts.push(`at the ${MUSEUMS[crit.src].name}`);
  const s = parts.join(" ").replace(/^from /, "Works from ").replace(/^(before|after) /, "Works made $1 ").replace(/^at the /, "The ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// What to type into each museum's search. Empty means browse and filter.
export function queries(crit, src) {
  if (crit.artist) return [crit.artist];
  if (crit.movement) return [crit.movement];
  if (crit.iso && COUNTRY[crit.iso]) return [src === "nga" ? COUNTRY[crit.iso].adj : COUNTRY[crit.iso].name];
  if (crit.school && SCHOOL_QUERY[crit.school]) return SCHOOL_QUERY[crit.school];
  if (crit.cont) return Object.entries(COUNTRY).filter(([, c]) => c.continent === crit.cont).map(([, c]) => (src === "nga" ? c.adj : c.name));
  if (crit.type) return [crit.type.replace(/s$/, "").toLowerCase()];
  return [];
}

// Start: what you've already seen, for "somewhere new" quests.
export function newQuest(state, crit, total, extra = {}) {
  const excl = {};
  if (crit.newCountry || crit.newMovement || crit.newCentury) {
    const cs = new Set(), ms = new Set(), ce = new Set();
    for (const s of state.swipes || []) { const f = facts(s.a || {}); if (f.iso) cs.add(f.iso); if (f.movement) ms.add(f.movement); if (f.century) ce.add(f.century); }
    excl.countries = [...cs]; excl.movements = [...ms]; excl.centuries = [...ce];
  }
  return { id: `${Date.now().toString(36)}`, crit, excl, label: extra.label || label(crit), kind: extra.kind || "quest", goal: extra.goal || null,
    total, left: total, seen: 0, kept: 0, loved: 0, picks: [], t: Date.now() };
}

/* ---------- suggestions ---------- */
// Badge-linked quests. Each lineage side becomes a criterion; other badges point at what they still need.
const SIDE = {
  ukiyo: { iso: "JP", type: "Print", yearFrom: 1600, yearTo: 1900 }, impressionist: { movement: "Impressionism" }, greek: { iso: "GR", yearTo: 0 }, roman: { iso: "IT", yearTo: 500 },
  byzantine: { iso: "TR", yearFrom: 330, yearTo: 1453 }, vienna: { movement: "Vienna Secession" }, preraph: { movement: "Pre-Raphaelite" },
  earlyItalian: { iso: "IT", yearFrom: 1250, yearTo: 1520 }, cubist: { movement: "Cubism" }, africa: { school: "Arts of Africa" }, neoclassical: { movement: "Neoclassicism" },
};
const SIDE_NAME = { ukiyo: "ukiyo-e print", impressionist: "Impressionist work", greek: "ancient Greek work", roman: "ancient Roman work", byzantine: "Byzantine work",
  vienna: "Vienna Secession work", preraph: "Pre-Raphaelite work", earlyItalian: "early Italian Renaissance work", cubist: "Cubist work", africa: "work from Africa", neoclassical: "Neoclassical work" };
const SIDE_LABEL = { ukiyo: "Ukiyo-e prints", greek: "Ancient Greece", roman: "Ancient Rome", byzantine: "Byzantine art", earlyItalian: "Early Italian Renaissance" };
const LINEAGE = { japonisme: ["ukiyo", "impressionist"], "copycat-empire": ["greek", "roman"], "gold-standard": ["byzantine", "vienna"], brotherhood: ["preraph", "earlyItalian"],
  "crossed-paths": ["cubist", "africa"], "back-to-the-future": ["neoclassical", "greek"] };

// A quest that moves a given badge forward, or null. st: badgeStats.
export function questForBadge(id, st, state, earned) {
  if (LINEAGE[id]) {
    const [a, b] = LINEAGE[id]; const need = !st.sides[a] ? a : !st.sides[b] ? b : null; if (!need) return null;
    const other = need === a ? b : a;
    const an = (w) => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);
    return { crit: SIDE[need], label: SIDE_LABEL[need], total: 20, goal: id, why: st.sides[other] ? `Love ${an(SIDE_NAME[need])} to finish ${badgeTitle(id)}.` : `Half of ${badgeTitle(id)}: love ${an(SIDE_NAME[need])}.` };
  }
  const t = (n) => earned(id) < n;
  switch (id) {
    case "passport": return t(4) ? { crit: { newCountry: true }, total: 20, goal: id, why: `Passport counts countries: ${st.nCountries} so far.` } : null;
    case "grand-tour": return t(4) ? { crit: { newMovement: true }, total: 20, goal: id, why: `Grand Tour counts movements: ${st.range} so far.` } : null;
    case "time-machine": return t(4) ? { crit: { newCentury: true }, total: 20, goal: id, why: `Time Machine counts centuries: ${st.centuries} so far.` } : null;
    case "all-six": { const miss = Object.keys(CONTINENTS).find((c) => !st.keptContinents.has(c)); return miss ? { crit: { cont: miss }, total: 20, goal: id, why: `All Six still needs a keep from ${CONTINENTS[miss]}.` } : null; }
    case "silk-road": { const miss = ["CN", "IR", "IT"].find((c) => !st.lovedCountries.has(c)); return miss ? { crit: { iso: miss }, total: 20, goal: id, why: `Silk Road still needs a Love from ${COUNTRY[miss].name}.` } : null; }
    case "deep-time": return earned(id) ? null : { crit: { yearTo: NOW - 2000 }, total: 20, goal: id, why: "Deep Time: love a work more than 2,000 years old." };
    case "wet-paint": return earned(id) ? null : { crit: { yearFrom: 1900 }, total: 20, goal: id, why: "Wet Paint: love a work made after 1900." };
    case "home-museum": return earned(id) || !st.topSrc ? null : { crit: { src: st.topSrc[0] }, total: 20, goal: id, why: `Home Museum: ${st.topSrc[1]} of 15 Loves at the ${MUSEUMS[st.topSrc[0]].name}.` };
    default: return null;
  }
}
const TITLES = { japonisme: "Japonisme", "copycat-empire": "Copycat Empire", "gold-standard": "Gold Standard", brotherhood: "Brotherhood", "crossed-paths": "Crossed Paths", "back-to-the-future": "Back to the Future" };
const badgeTitle = (id) => TITLES[id] || id;

// The quest board: for your next badge, go deeper, somewhere new.
export function suggestions(state, model, st, earned) {
  const out = { badge: [], deeper: [], fresh: [] };
  const order = ["japonisme", "silk-road", "all-six", "gold-standard", "brotherhood", "crossed-paths", "copycat-empire", "back-to-the-future", "deep-time", "wet-paint", "passport", "grand-tour", "time-machine", "home-museum"];
  const lin = order.filter((id) => LINEAGE[id]).map((id) => ({ id, half: LINEAGE[id].some((s) => st.sides[s]) }));
  const ranked = [...lin.filter((x) => x.half).map((x) => x.id), ...order.filter((id) => !LINEAGE[id]), ...lin.filter((x) => !x.half).map((x) => x.id)];
  for (const id of ranked) { if (out.badge.length >= 3) break; const q = questForBadge(id, st, state, earned); if (q) out.badge.push(q); }
  const pos = (dim) => (model && model.trained ? model.leaning(dim, 10, 4).filter((x) => x.weight > 0.1) : []);
  const school = pos("school")[0]; if (school && SCHOOLS.includes(school.value)) out.deeper.push({ crit: { school: school.value }, total: 20, why: `Your strongest school so far.` });
  const country = pos("country")[0]; const iso = country && Object.keys(COUNTRY).find((k) => COUNTRY[k].name === country.value);
  if (iso) out.deeper.push({ crit: { iso }, total: 20, why: `The country you keep most.` });
  const fan = st.fan && st.fan[1] >= 2 ? st.fan[0] : null; if (fan) out.deeper.push({ crit: { artist: fan }, total: 10, why: `${st.fan[1]} Loves so far.` });
  const seenSchools = new Set(); for (const [t, c] of (model && model.counts) || []) if (t.startsWith("school|") && c.c >= 3) seenSchools.add(t.slice(7));
  const rare = SCHOOLS.filter((s) => !seenSchools.has(s) && SCHOOL_QUERY[s]);
  if (rare.length) out.fresh.push({ crit: { school: rare[(st.decided || 0) % rare.length] }, total: 10, why: "A school you've barely seen." });
  out.fresh.push({ crit: { newCountry: true }, total: 20, why: "Every work from a country new to you." });
  out.fresh.push({ crit: { newCentury: true }, total: 10, why: "Every work from a century new to you." });
  return out;
}

// Choices for "make your own".
export const BUILDER = {
  school: { label: "School", options: () => SCHOOLS.map((s) => [s, s]) },
  movement: { label: "Movement", options: () => ["Impressionism", "Post-Impressionism", "Baroque", "Dutch Golden Age", "Renaissance", "Northern Renaissance", "Rococo", "Neoclassicism", "Romanticism",
    "Realism", "Symbolism", "Pre-Raphaelite", "Art Nouveau", "Expressionism", "Fauvism", "Cubism", "Futurism", "Ukiyo-e", "Gothic", "Byzantine", "Hudson River School", "Tonalism", "Pointillism",
    "Vienna Secession", "Der Blaue Reiter", "Danish Golden Age", "Qing dynasty", "Ming dynasty"].map((m) => [m, m]) },
  era: { label: "Era", options: () => [["-5000:-500", "Before 500 BCE"], ["-500:500", "500 BCE to 500"], ["500:1400", "500 to 1400"], ["1400:1500", "1400s"], ["1500:1600", "1500s"],
    ["1600:1700", "1600s"], ["1700:1800", "1700s"], ["1800:1850", "1800 to 1850"], ["1850:1900", "1850 to 1900"], ["1900:2000", "1900 and after"]] },
  iso: { label: "Country", options: () => Object.entries(COUNTRY).map(([k, c]) => [k, c.name]).sort((a, b) => a[1].localeCompare(b[1])) },
  cont: { label: "Continent", options: () => Object.entries(CONTINENTS) },
  type: { label: "Type of work", options: () => ["Painting", "Print", "Drawing", "Sculpture", "Photograph", "Ceramics", "Textiles", "Metalwork and jewelry", "Books and manuscripts", "Decorative arts"].map((t) => [t, t]) },
  src: { label: "Museum", options: () => Object.entries(MUSEUMS).map(([k, m]) => [k, m.name]) },
  artist: { label: "Artist", options: null },
};
export function critFromBuilder(kind, value) {
  if (kind === "era") { const [a, b] = value.split(":").map(Number); return { yearFrom: a, yearTo: b }; }
  return { [kind]: value };
}

/* ---------- supply: the on-device catalog digest (tools/build_digest.mjs) ----------
   Counts exactly how many National Gallery and Cleveland works fit a quest, and picks them, so the app never
   recommends or starts a quest it can't fill. Artist quests can't be counted here (the digest has no names). */
export const digestCan = (crit) => !crit.artist;
function rowFacts(d, src, i) {
  const c = d.srcs[src].cols, get = (k) => (c[k][i] < 0 ? null : d.dicts[k][c[k][i]]);
  const y = c.year[i];
  return { src, iso: get("iso"), cont: get("cont"), school: get("school"), type: get("type"), movement: get("mov"), year: y, century: centuryOf(y), artist: null };
}
export function digestMatches(d, quest, srcs = Object.keys(d.srcs)) {
  const out = [];
  for (const src of srcs) { if (!d.srcs[src]) continue; const n = d.srcs[src].count; for (let i = 0; i < n; i++) if (matchFacts(quest, rowFacts(d, src, i))) out.push([src, i]); }
  return out;
}
// Works that fit and that you haven't judged yet.
export function digestCount(d, quest, state, srcs) {
  if (!d || !digestCan(quest.crit)) return null;
  const n = digestMatches(d, quest, srcs).length;
  const seen = (state.swipes || []).filter((s) => s.a && d.srcs[s.a.src] && (!srcs || srcs.includes(s.a.src)) && matches(quest, s.a)).length;
  return Math.max(0, n - seen);
}
