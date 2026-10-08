// Museums as a dimension: passport stamps, how often you keep each museum's work, what's on view, and Museum Day.
// Everything here is read from your own decisions; nothing depends on the app's guesses.

import { MUSEUMS } from "./sources.js";

export const STAMP_AT = 10;          // decisions at a museum to earn its stamp
export const DAY_LENGTH = 20;        // works in a Museum Day
export const STAMP = {
  aic: { city: "CHICAGO", inst: "Art Institute", ink: "#7b2d2b", shape: "rect", rot: -4 },
  met: { city: "NEW YORK", inst: "The Met", ink: "#24427a", shape: "oval", rot: 3 },
  nga: { city: "WASHINGTON", inst: "National Gallery", ink: "#2c6b5f", shape: "rect", rot: -2 },
  cma: { city: "CLEVELAND", inst: "Museum of Art", ink: "#5a2a55", shape: "oval", rot: 4 },
  vam: { city: "LONDON", inst: "V&A", ink: "#8f6418", shape: "rect", rot: 2 },
  smk: { city: "COPENHAGEN", inst: "SMK", ink: "#2f5b7a", shape: "oval", rot: -3 },
  wd:  { city: "COMMONS", inst: "Wikimedia", ink: "#34495e", shape: "rect", rot: -5 },
};

// Per museum: decisions, keeps, Loves, on-view keeps, when the stamp was earned, and a keep rate that doesn't
// overreact to a handful of works (pulled toward your overall rate until there are enough decisions).
export function museumStats(state) {
  const out = {}; let dec = 0, kept = 0;
  for (const k of Object.keys(MUSEUMS)) out[k] = { src: k, decided: 0, keeps: 0, loves: 0, onView: 0, stampAt: null, dayDone: (state.museumDays || {})[k] || null };
  for (const s of state.swipes || []) {
    const m = s.a && out[s.a.src]; if (!m || s.v === 0) continue;
    m.decided++; dec++;
    if (s.v > 0) { m.keeps++; kept++; if (s.a.onView) m.onView++; }
    if (s.v === 2) m.loves++;
    if (m.decided === STAMP_AT) m.stampAt = s.t || Date.now();
  }
  const base = dec ? kept / dec : 0.5, prior = 6;
  for (const m of Object.values(out)) { m.keepRate = m.decided ? m.keeps / m.decided : null; m.score = (m.keeps + base * prior) / (m.decided + prior); }
  const ranked = Object.values(out).filter((m) => m.decided >= STAMP_AT).sort((a, b) => b.score - a.score);
  return { by: out, ranked, home: ranked[0] || null, base };
}

export const dayActive = (state) => !!(state.quest && state.quest.kind === "museum" && state.quest.left > 0);

// A dated, inked passport stamp. Unearned stamps are dashed outlines that say how many works are left.
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const fmt = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
export function stampSVG(src, m) {
  const st = STAMP[src]; if (!st) return "";
  const got = !!m.stampAt, ink = got ? st.ink : "currentColor";
  const frame = st.shape === "rect"
    ? `<rect x="8" y="10" width="144" height="80" rx="6" fill="none" stroke="${ink}" stroke-width="3"/><rect x="14" y="16" width="132" height="68" rx="3" fill="none" stroke="${ink}" stroke-width="1"/>`
    : `<ellipse cx="80" cy="50" rx="72" ry="41" fill="none" stroke="${ink}" stroke-width="3"/><ellipse cx="80" cy="50" rx="65" ry="34" fill="none" stroke="${ink}" stroke-width="1"/>`;
  const gilt = got && m.dayDone ? (st.shape === "rect"
    ? `<rect x="3" y="5" width="154" height="90" rx="9" fill="none" stroke="#b3872f" stroke-width="2.5"/>`
    : `<ellipse cx="80" cy="50" rx="77" ry="46" fill="none" stroke="#b3872f" stroke-width="2.5"/>`) : "";
  const left = Math.max(0, STAMP_AT - m.decided);
  return `<svg class="stamp ${got ? "got" : "todo"}" viewBox="0 0 160 100" role="img" aria-label="${st.city} stamp${got ? `, earned ${fmt(m.stampAt)}` : `, ${left} more works to earn`}">
    <g transform="rotate(${got ? st.rot : 0} 80 50)" ${got ? "" : 'stroke-dasharray="4 4" opacity=".45"'}>
      ${gilt}${frame}
      <text x="80" y="37" text-anchor="middle" font-family="Schibsted Grotesk, Arial, sans-serif" font-size="9" letter-spacing="2" fill="${ink}" stroke="none">${st.inst.toUpperCase().replace("&", "&amp;")}</text>
      <text x="80" y="58" text-anchor="middle" font-family="Newsreader, Georgia, serif" font-size="${st.city.length > 9 ? 16 : 20}" font-weight="500" letter-spacing="1.5" fill="${ink}" stroke="none">${st.city}</text>
      <text x="80" y="74" text-anchor="middle" font-family="Schibsted Grotesk, Arial, sans-serif" font-size="7.2" letter-spacing=".8" fill="${ink}" stroke="none">${got ? `ADMITTED · ${fmt(m.stampAt)}` : `${left} MORE ${left === 1 ? "WORK" : "WORKS"}`}</text>
    </g></svg>`;
}
