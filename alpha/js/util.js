// Small, dependency-free helpers shared by every module. Pure functions only, so they run in Node tests too.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const norm = (x) => String(x || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim();

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) { const k = Math.floor(rand() * (i + 1)); [arr[i], arr[k]] = [arr[k], arr[i]]; }
  return arr;
}

// FNV-1a 32-bit; used for feature hashing in the taste model.
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// HTML from museum APIs -> plain paragraphs (array of strings). No markup survives.
export function htmlToParas(html) {
  if (!html) return [];
  const text = String(html)
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/p\s*>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&rsquo;/g, "’").replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”").replace(/&mdash;/g, "—").replace(/&ndash;/g, "–");
  return text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// Pull height × width in centimetres from a museum dimension string.
// Handles "73.7 × 92.1 cm", "H. 29 x W. 36 in. (73.7 x 92.1 cm)", "92.1 x 73.7 x 2 cm".
export function parseDimsCm(text) {
  if (!text) return null;
  const s = String(text).replace(/,/g, ".");
  const m = s.match(/(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)(?:\s*[×xX]\s*\d+(?:\.\d+)?)?\s*cm/);
  if (m) {
    const h = parseFloat(m[1]), w = parseFloat(m[2]);
    if (h > 0 && w > 0 && h < 5000 && w < 5000) return { h, w };
  }
  const mm = s.match(/(\d+(?:\.\d+)?)\s*[×xX]\s*(\d+(?:\.\d+)?)\s*mm/);
  if (mm) return { h: parseFloat(mm[1]) / 10, w: parseFloat(mm[2]) / 10 };
  return null;
}

export function eraOf(year) {
  if (year == null || isNaN(year)) return null;
  if (year < -500) return "Before 500 BCE";
  if (year < 0) return "500–1 BCE";
  if (year < 1000) return "1–999";
  if (year < 1400) return "1000–1399";
  const c = Math.floor(year / 50) * 50;
  return `${c}–${c + 49}`;
}

export function centuryOf(year) {
  if (year == null || isNaN(year)) return null;
  if (year < 0) return `${Math.ceil(-year / 100)} c. BCE`;
  const c = Math.floor(year / 100) + 1;
  const sfx = c % 10 === 1 && c !== 11 ? "st" : c % 10 === 2 && c !== 12 ? "nd" : c % 10 === 3 && c !== 13 ? "rd" : "th";
  return `${c}${sfx} century`;
}

export function hueName(c) {
  if (!c || c.h == null) return null;
  if (c.s < 12 || c.l < 12) return c.l < 30 ? "Dark & tonal" : "Muted / greyed";
  const h = c.h;
  return h < 15 || h >= 345 ? "Reds" : h < 45 ? "Oranges & ochres" : h < 70 ? "Yellows & golds"
    : h < 160 ? "Greens" : h < 200 ? "Teals" : h < 255 ? "Blues" : h < 290 ? "Violets" : "Pinks & magentas";
}

// Map of medium keywords -> a readable medium family. Order matters: first match wins.
const MEDIA = [
  [/oil/, "Oil"], [/tempera/, "Tempera"], [/watercolou?r|gouache/, "Watercolor & gouache"],
  [/woodblock|woodcut/, "Woodblock print"], [/etching|engraving|lithograph|screenprint|aquatint|drypoint/, "Print"],
  [/photograph|albumen|gelatin silver|daguerreotype/, "Photograph"], [/ink/, "Ink"], [/pastel/, "Pastel"],
  [/chalk|charcoal|graphite|pencil/, "Drawing"], [/bronze/, "Bronze"], [/marble|limestone|sandstone|stone/, "Stone"],
  [/porcelain|stoneware|earthenware|ceramic|terracotta/, "Ceramic"], [/silk|cotton|wool|linen|textile/, "Textile"],
  [/silver|gold/, "Precious metal"], [/glass/, "Glass"], [/wood/, "Wood"],
];
export function mediumFamily(medium) {
  const m = String(medium || "").toLowerCase();
  for (const [re, name] of MEDIA) if (re.test(m)) return name;
  return null;
}

export const workKey = (a) => {
  const t = norm(a && a.title), who = norm(a && a.artist);
  const GENERIC = new Set(["", "untitled", "fragment", "study", "sketch", "drawing", "print", "photograph", "plate", "bowl", "vase", "jar", "cup", "dish"]);
  return !who || GENERIC.has(t) ? null : `${t}|${who}`;
};

export function relTime(ts, now = Date.now()) {
  const d = Math.round((now - ts) / 1000);
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} hr ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
