// Museum adapters. Each turns one museum's open-access API into the same artwork shape:
// { uid, src, museum, id, title, artist, artistBio, date, year, place, medium, mediumFamily, kind,
//   movement, subjects[], color, image, imageLarge, ar, dims, dimsCm, credit, url, onView, gallery, paras[] }
// Only public-domain (CC0) works with images are returned. Museum names are used for credit only, never as branding.

import { htmlToParas, parseDimsCm, mediumFamily, shuffle } from "./util.js";

export const MUSEUMS = {
  aic: { name: "Art Institute of Chicago", short: "Chicago", site: "https://www.artic.edu" },
  met: { name: "The Metropolitan Museum of Art", short: "The Met", site: "https://www.metmuseum.org" },
  cma: { name: "Cleveland Museum of Art", short: "Cleveland", site: "https://www.clevelandart.org" },
};

const AIC = "https://api.artic.edu/api/v1";
const AIC_IIIF = "https://www.artic.edu/iiif/2";
const MET = "https://collectionapi.metmuseum.org/public/collection/v1";
const CMA = "https://openaccess-api.clevelandart.org/api";

const AIC_FIELDS = [
  "id", "title", "artist_title", "artist_display", "date_display", "date_start", "style_title", "classification_title",
  "artwork_type_title", "place_of_origin", "medium_display", "image_id", "color", "thumbnail", "subject_titles",
  "dimensions", "dimensions_detail", "credit_line", "is_on_view", "gallery_title", "is_public_domain",
].join(",");

const clean = (s) => (s == null ? "" : String(s).replace(/\s+/g, " ").trim());
const stripParens = (s) => clean(String(s || "").replace(/\s*\(.*?\)\s*/g, " "));

/* ---------- normalizers (pure, unit-tested) ---------- */

export function normalizeAIC(r) {
  if (!r || !r.image_id || r.is_public_domain === false) return null;
  const dd = Array.isArray(r.dimensions_detail) ? r.dimensions_detail.find((d) => d && d.height && d.width) : null;
  const t = r.thumbnail || {};
  return {
    uid: `aic:${r.id}`, src: "aic", museum: MUSEUMS.aic.name, id: r.id,
    title: clean(r.title) || "Untitled", artist: clean(r.artist_title) || null,
    artistBio: clean(String(r.artist_display || "").split("\n").slice(1).join(", ")) || null,
    date: clean(r.date_display) || null, year: r.date_start ?? null,
    place: clean(r.place_of_origin) || null, medium: clean(r.medium_display) || null,
    mediumFamily: mediumFamily(r.medium_display), kind: clean(r.classification_title || r.artwork_type_title) || null,
    movement: clean(r.style_title) || null, subjects: (r.subject_titles || []).slice(0, 5),
    color: r.color && r.color.h != null ? { h: r.color.h, s: r.color.s, l: r.color.l } : null,
    image: `${AIC_IIIF}/${r.image_id}/full/843,/0/default.jpg`,
    imageLarge: `${AIC_IIIF}/${r.image_id}/full/1686,/0/default.jpg`,
    lqip: t.lqip || null, alt: clean(t.alt_text) || null,
    ar: t.width && t.height ? t.width / t.height : null,
    dims: clean(r.dimensions) || null,
    dimsCm: dd ? { h: dd.height, w: dd.width } : parseDimsCm(r.dimensions),
    credit: clean(r.credit_line) || null, url: `https://www.artic.edu/artworks/${r.id}`,
    onView: !!r.is_on_view, gallery: clean(r.gallery_title) || null, paras: null,
  };
}

export function normalizeMet(r) {
  if (!r || !r.isPublicDomain || !r.primaryImageSmall) return null;
  const period = stripParens(r.period || r.dynasty || r.reign || "");
  return {
    uid: `met:${r.objectID}`, src: "met", museum: MUSEUMS.met.name, id: r.objectID,
    title: clean(r.title) || "Untitled", artist: clean(r.artistDisplayName) || null,
    artistBio: clean([r.artistNationality, r.artistDisplayBio].filter(Boolean).join(", ")) || null,
    date: clean(r.objectDate) || null, year: Number.isFinite(r.objectBeginDate) ? r.objectBeginDate : null,
    place: clean(r.country || r.culture || r.region) || null, medium: clean(r.medium) || null,
    mediumFamily: mediumFamily(r.medium), kind: clean(r.classification || r.objectName) || null,
    movement: period || null, subjects: (r.tags || []).map((t) => t && t.term).filter(Boolean).slice(0, 5),
    color: null, image: r.primaryImageSmall, imageLarge: r.primaryImage || r.primaryImageSmall,
    lqip: null, alt: null, ar: null,
    dims: clean(r.dimensions) || null, dimsCm: parseDimsCm(r.dimensions),
    credit: clean(r.creditLine) || null, url: r.objectURL || `https://www.metmuseum.org/art/collection/search/${r.objectID}`,
    onView: !!clean(r.GalleryNumber), gallery: clean(r.GalleryNumber) ? `Gallery ${clean(r.GalleryNumber)}` : null,
    paras: [],   // The Met's open data has no description text
  };
}

export function normalizeCMA(r) {
  const web = r && r.images && r.images.web;
  if (!r || !web || !web.url) return null;
  if (r.share_license_status && String(r.share_license_status).toUpperCase() !== "CC0") return null;
  const c0 = (r.creators || [])[0] || {};
  const desc = String(c0.description || "");
  const artist = clean(desc.replace(/\s*\(.*$/, "")) || null;
  const bio = (desc.match(/\((.*)\)/) || [])[1] || null;
  const print = r.images.print && r.images.print.url;
  const paras = [r.wall_description, r.description, r.fun_fact, r.did_you_know]
    .filter(Boolean).flatMap((h) => htmlToParas(h)).filter((p, i, a) => a.indexOf(p) === i).slice(0, 4);
  return {
    uid: `cma:${r.id}`, src: "cma", museum: MUSEUMS.cma.name, id: r.id,
    title: clean(r.title) || "Untitled", artist, artistBio: clean(bio) || null,
    date: clean(r.creation_date) || null, year: Number.isFinite(r.creation_date_earliest) ? r.creation_date_earliest : null,
    place: clean((r.culture || [])[0]) || null, medium: clean(r.technique) || null,
    mediumFamily: mediumFamily(r.technique), kind: clean(r.type) || null,
    movement: null, subjects: [], color: null,
    image: web.url, imageLarge: print || web.url, lqip: null, alt: null,
    ar: web.width && web.height ? Number(web.width) / Number(web.height) : null,
    dims: clean(r.measurements) || null, dimsCm: parseDimsCm(r.measurements),
    credit: clean(r.creditline || r.credit_line) || null, url: r.url || `https://www.clevelandart.org/art/${r.accession_number}`,
    onView: !!r.current_location, gallery: clean(r.current_location) || null, paras,
  };
}

/* ---------- network ---------- */

async function getJSON(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Health: a museum that fails three times in a row is benched for ten minutes.
export const health = {
  aic: { fails: 0, ok: 0, last: null, benchedUntil: 0 },
  met: { fails: 0, ok: 0, last: null, benchedUntil: 0 },
  cma: { fails: 0, ok: 0, last: null, benchedUntil: 0 },
};
export const isAvailable = (src, now = Date.now()) => health[src] && health[src].benchedUntil <= now;
async function tracked(src, fn) {
  const h = health[src];
  try {
    const out = await fn();
    h.fails = 0; h.ok++; h.last = null;
    return out;
  } catch (e) {
    h.fails++; h.last = String(e && e.message || e);
    if (h.fails >= 3) { h.benchedUntil = Date.now() + 10 * 60 * 1000; h.fails = 0; }
    throw e;
  }
}

let aicBoostOK = true;
const aicPages = { hi: 20 };

async function searchAIC(q, { limit = 24, browse = false } = {}) {
  const hi = `&query[bool][must][0][term][is_public_domain]=true&query[bool][must][1][term][is_boosted]=true`;
  const pd = `&query[term][is_public_domain]=true`;
  const page = browse ? `&page=${1 + Math.floor(Math.random() * aicPages.hi)}` : "";
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  const base = `${AIC}/artworks/search?fields=${AIC_FIELDS}&limit=${limit}${qs}${page}`;
  if (aicBoostOK) {
    try {
      const j = await getJSON(base + hi);
      if (browse && j.pagination) aicPages.hi = Math.max(1, Math.min(j.pagination.total_pages || 1, Math.floor(9000 / limit)));
      const d = (j.data || []).map(normalizeAIC).filter(Boolean);
      if (d.length) return d;
      if (!q) aicBoostOK = false;
    } catch (e) { aicBoostOK = false; }
  }
  const j = await getJSON(base + pd);
  return (j.data || []).map(normalizeAIC).filter(Boolean);
}

async function pool(items, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } }
  }));
  return out;
}

async function searchMet(q, { limit = 12, browse = false } = {}) {
  const term = q || "painting";
  let j = await getJSON(`${MET}/search?hasImages=true&isHighlight=true&q=${encodeURIComponent(term)}`);
  if (!j.objectIDs || j.objectIDs.length < 4) j = await getJSON(`${MET}/search?hasImages=true&q=${encodeURIComponent(term)}`);
  const ids = shuffle((j.objectIDs || []).slice(0, browse ? 400 : 80)).slice(0, Math.ceil(limit * 1.6));
  const objs = await pool(ids, 6, (id) => getJSON(`${MET}/objects/${id}`, 10000));
  return objs.map(normalizeMet).filter(Boolean).slice(0, limit);
}

async function searchCMA(q, { limit = 20, browse = false } = {}) {
  const skip = browse ? Math.floor(Math.random() * 400) : 0;
  const qs = q ? `&q=${encodeURIComponent(q)}` : "";
  const j = await getJSON(`${CMA}/artworks/?has_image=1&cc0=1&limit=${limit}&skip=${skip}${qs}`);
  return (j.data || []).map(normalizeCMA).filter(Boolean);
}

const SEARCH = { aic: searchAIC, met: searchMet, cma: searchCMA };

export function search(src, q, opts) {
  if (!SEARCH[src]) return Promise.resolve([]);
  return tracked(src, () => SEARCH[src](q, opts));
}

// Long-form text and live gallery status. Chicago needs a second request; the others arrive with the search.
const detailCache = new Map();
export async function details(item) {
  if (item.src !== "aic") return { paras: item.paras || [] };
  if (detailCache.has(item.uid)) return detailCache.get(item.uid);
  const j = await getJSON(`${AIC}/artworks/${item.id}?fields=description,short_description,is_on_view,gallery_title,artist_display,technique_titles,theme_titles`);
  const d = j.data || {};
  const out = {
    paras: htmlToParas(d.description).length ? htmlToParas(d.description) : (d.short_description ? [clean(d.short_description)] : []),
    onView: d.is_on_view, gallery: d.gallery_title, techniques: d.technique_titles || [], themes: d.theme_titles || [],
    artistDisplay: d.artist_display || null,
  };
  detailCache.set(item.uid, out);
  return out;
}
