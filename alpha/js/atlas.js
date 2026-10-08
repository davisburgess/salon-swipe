// The Atlas: where the art you judge was made, as modern countries on an equal-area map, with fog over everywhere
// you haven't seen. Read from your own decisions only; nothing here depends on the app's guesses.

import { geoOf, COUNTRY, CONTINENTS } from "./geo.js";

export const EXPLORE_LENGTH = 12;   // works in an Explore
let worldP = null;
export const loadWorld = () => (worldP ||= fetch(new URL("../data/world.json", import.meta.url)).then((r) => { if (!r.ok) throw new Error("map"); return r.json(); }).catch((e) => { worldP = null; throw e; }));

// Per country: decisions, keeps, Loves, the place names museums used, favorite movement, and a lean from
// "usually pass" (-1) to "strong pull" (+1), steadied toward your overall keep rate until there are enough works.
export function countryStats(state) {
  const by = {}; let dec = 0, kept = 0;
  for (const s of state.swipes || []) {
    if (s.v === 0) continue;
    const g = geoOf(s.a, s.f); if (!g || !g.iso) continue;
    const c = (by[g.iso] ||= { iso: g.iso, decided: 0, keeps: 0, loves: 0, places: new Map(), styles: {} });
    c.decided++; dec++;
    if (s.v > 0) { c.keeps++; kept++; }
    if (s.v === 2) c.loves++;
    const raw = String((s.a && (s.a.place || s.a.artistBio)) || "").split(/[,(]/)[0].trim();
    if (raw) c.places.set(raw, (c.places.get(raw) || 0) + 1);
    const mv = s.a && s.a.movement; if (mv && s.v > 0) c.styles[mv] = (c.styles[mv] || 0) + s.v;
  }
  const base = dec ? kept / dec : 0.5, prior = 4;
  for (const c of Object.values(by)) {
    c.keepRate = c.keeps / c.decided;
    c.lean = Math.max(-1, Math.min(1, ((c.keeps + base * prior) / (c.decided + prior) - base) / 0.3));
    c.topStyle = Object.entries(c.styles).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
  const list = Object.values(by);
  const pulls = list.filter((c) => c.decided >= 4 && c.lean > 0.15).sort((a, b) => b.lean - a.lean);
  const continents = new Set(list.map((c) => COUNTRY[c.iso] && COUNTRY[c.iso].continent).filter(Boolean));
  return { by, list, base, pulls, continents };
}

// Your Grand Tour: the countries of your last ten Loves, in order, skipping repeats in a row.
export function grandTour(state, k = 10) {
  const out = [];
  for (const s of state.swipes || []) {
    if (s.v !== 2) continue;
    const g = geoOf(s.a, s.f); if (!g || !g.iso) continue;
    if (out[out.length - 1] !== g.iso) out.push(g.iso);
  }
  return out.slice(-k);
}

const PULL = "#c48a2a", PASS = "#6f8296";
export function mapSVG(world, cs, { selected = null, tour = [] } = {}) {
  const centers = Object.fromEntries(world.countries.map((c) => [c.id, c.c]));
  const paths = world.countries.map((c) => {
    const st = cs.by[c.id], name = c.name.replace(/&/g, "&amp;");
    const sel = c.id === selected ? " sel" : "";
    if (!st) return `<path class="fog${sel}" data-iso="${c.id}" d="${c.d}"><title>${name}, unexplored</title></path>`;
    const pct = Math.round(Math.min(1, Math.abs(st.lean)) * 78 + 10);
    const fill = `color-mix(in srgb, ${st.lean >= 0 ? PULL : PASS} ${pct}%, var(--land))`;
    return `<path class="seen${sel}" data-iso="${c.id}" d="${c.d}" style="fill:${fill}"><title>${name}: ${st.decided} seen, ${Math.round(st.keepRate * 100)}% kept</title></path>`;
  }).join("");
  const pts = tour.map((iso) => centers[iso]).filter(Boolean);
  const route = pts.length > 1 ? `<path class="route" d="M${pts.map((p) => p.join(" ")).join("L")}" fill="none"/>` +
    pts.map((p, i) => `<circle class="stop${i === pts.length - 1 ? " last" : ""}" cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 5 : 3.2}"/>`).join("") : "";
  return `<svg class="worldmap" viewBox="0 0 ${world.width} ${world.height}" role="img" aria-label="Map of where the art you've judged was made">
    <defs><pattern id="pp-fog" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" class="fogbg"/><line x1="0" y1="0" x2="0" y2="7" class="fogline" stroke-width="2.2"/></pattern></defs>
    <g class="countries">${paths}</g>${route}</svg>`;
}

// Where and when: a 5,000-year strip of your Loves (dots) and passes (ticks). Older centuries are compressed.
export function timelineSVG(state) {
  const W = 1000, pad = 30, s = W - pad * 2;
  const X = (y) => y < 0 ? pad + Math.max(0, (y + 3000) / 3000) * s * 0.22 : y < 1400 ? pad + s * 0.22 + (y / 1400) * s * 0.2 : pad + s * 0.42 + Math.min(1, (y - 1400) / 560) * s * 0.58;
  const ys = (state.swipes || []).filter((x) => x.v !== 0 && x.a && Number.isFinite(x.a.year) && x.a.year > -3500 && x.a.year < 2030);
  const loves = ys.filter((x) => x.v === 2), passes = ys.filter((x) => x.v === -1);
  const ticks = [[-3000, "3000 BCE"], [-1000, "1000 BCE"], [0, "1 CE"], [1000, "1000"], [1400, "1400"], [1600, "1600"], [1800, "1800"], [1960, "1960"]];
  const label = (y) => (y < 0 ? `${-y} BCE` : String(y));
  return `<svg class="timeline" viewBox="0 0 ${W} 96" role="img" aria-label="Your Loves and passes across 5,000 years">
    <line x1="${pad}" x2="${W - pad}" y1="52" y2="52" class="axis"/>
    ${ticks.map(([y, l]) => `<line x1="${X(y)}" x2="${X(y)}" y1="48" y2="56" class="tick"/><text x="${X(y)}" y="78" text-anchor="middle" class="tl">${l}</text>`).join("")}
    ${passes.slice(-400).map((x) => `<line x1="${X(x.a.year).toFixed(1)}" x2="${X(x.a.year).toFixed(1)}" y1="55" y2="64" class="pass"/>`).join("")}
    ${loves.slice(-300).map((x, i) => `<circle cx="${X(x.a.year).toFixed(1)}" cy="${40 - (i % 4) * 7}" r="4" class="love"><title>${String(x.a.title || "").replace(/[<&]/g, "")}, ${label(x.a.year)}</title></circle>`).join("")}
  </svg>`;
}

export const continentName = (k) => CONTINENTS[k] || k;
// The words to search each museum for when exploring a country.
export function exploreTerm(iso, src) {
  const c = COUNTRY[iso]; if (!c) return null;
  return src === "nga" ? c.adj : c.name;   // the National Gallery indexes by nationality ("Japanese"); others by place
}
