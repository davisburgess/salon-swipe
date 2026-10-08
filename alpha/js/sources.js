// Museum adapters. Each turns one museum's open-access API into the same artwork shape:
// { uid, src, museum, id, title, artist, artistBio, date, year, place, medium, mediumFamily, kind,
//   movement, subjects[], color, image, imageLarge, ar, dims, dimsCm, credit, url, onView, gallery, paras[] }
// Only public-domain (CC0) works with images are returned. Museum names are used for credit only, never as branding.

import { htmlToParas, parseDimsCm, mediumFamily, shuffle, norm } from "./util.js";

export const MUSEUMS = {
  aic: { name: "Art Institute of Chicago", short: "Chicago", site: "https://www.artic.edu" },
  met: { name: "The Metropolitan Museum of Art", short: "The Met", site: "https://www.metmuseum.org" },
  nga: { name: "National Gallery of Art", short: "Washington", site: "https://www.nga.gov" },
  cma: { name: "Cleveland Museum of Art", short: "Cleveland", site: "https://www.clevelandart.org" },
  wd: { name: "Wikimedia Commons", short: "Commons", site: "https://commons.wikimedia.org", note: "Public-domain paintings catalogued on Wikidata, from museums worldwide." },
  vam: { name: "Victoria and Albert Museum", short: "V&A", site: "https://www.vam.ac.uk", note: "Images are free for personal, non-commercial use." },
  smk: { name: "SMK, National Gallery of Denmark", short: "Copenhagen", site: "https://www.smk.dk", note: "Titles are often in Danish." },
};

const AIC = "https://api.artic.edu/api/v1";
const AIC_IIIF = "https://www.artic.edu/iiif/2";
const MET = "https://collectionapi.metmuseum.org/public/collection/v1";
const MET_SEARCH = "https://collectionapi.metmuseum.org/public/collection/v1.1/search";   // /v1/search retired Oct 1, 2026
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
export const health = Object.fromEntries(Object.keys(MUSEUMS).map((k) => [k, { fails: 0, ok: 0, last: null, benchedUntil: 0 }]));
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

// The Met retired /v1/search on Oct 1, 2026. /v1.1/search takes the same filters and pages with offset and limit.
async function searchMet(q, { limit = 12, browse = false } = {}) {
  const term = encodeURIComponent(q || "painting");
  const find = (hl, offset, n) => getJSON(`${MET_SEARCH}?hasImages=true${hl ? "&isHighlight=true" : ""}&q=${term}&offset=${offset}&limit=${n}`);
  let j = await find(true, 0, 80);
  if (!j.objectIDs || j.objectIDs.length < 4) {
    const offset = browse ? Math.floor(Math.random() * 300) : 0;
    j = await find(false, offset, 100);
    if (offset && !(j.objectIDs || []).length) j = await find(false, 0, 100);   // fewer results than the random offset
  }
  const ids = shuffle(j.objectIDs || []).slice(0, Math.ceil(limit * 1.6));
  const objs = await pool(ids, 6, (id) => getJSON(`${MET}/objects/${id}`, 10000));
  return objs.map(normalizeMet).filter(Boolean).slice(0, limit);
}

/* ---------- static collections (built from open-data releases; see tools/build_*.py) ---------- */
// Records use short keys: i id, t title, a artist, b bio, d date, y year, m medium, k type, s style, p place, c credit,
// u NGA image id, img/imgL image URLs, r aspect, h/w size in cm, x alt text, url, v gallery, col collection, wt wall text.
const STATIC_BASE = new URL("../data/", import.meta.url).href;
const staticIdx = {}, staticShards = {};
const loadIndex = (src) => (staticIdx[src] ||= getJSON(`${STATIC_BASE}${src}/index.json`).catch((e) => { delete staticIdx[src]; throw e; }));
const shardOrder = [];
const loadShard = (src, n) => {
  const key = `${src}/${n}`;
  if (!staticShards[key]) {
    staticShards[key] = getJSON(`${STATIC_BASE}${src}/shard-${String(n).padStart(3, "0")}.json`).catch((e) => { delete staticShards[key]; throw e; });
    shardOrder.push(key); while (shardOrder.length > 16) delete staticShards[shardOrder.shift()];   // keep memory bounded
  }
  return staticShards[key];
};
// The catalog digest: a few facts for every on-device work, for counting and fetching quest works.
let digestP = null;
export const loadDigest = () => (digestP ||= getJSON(`${STATIC_BASE}digest.json`, 20000).catch((e) => { digestP = null; throw e; }));
// Specific works from a static collection by position, loading only the shards they're in.
export async function loadStaticAt(src, positions) {
  const idx = await loadIndex(src), by = new Map();
  for (const p of positions) { const sh = Math.floor(p / idx.shardSize); if (!by.has(sh)) by.set(sh, []); by.get(sh).push(p % idx.shardSize); }
  const out = [];
  await Promise.all([...by.entries()].map(async ([sh, list]) => { const recs = await loadShard(src, sh).catch(() => []); for (const k of list) { const a = recs[k] && normalizeStatic(src, recs[k]); if (a) out.push(a); } }));
  return out;
}
// A random slice of a static collection, for the recommender to score on the device (recommend.js retrieve).
export async function sampleLocal(src, { shards = 1 } = {}) {
  const idx = await loadIndex(src);
  const picks = Array.from({ length: shards }, () => Math.floor(Math.random() * idx.shards));
  const got = await Promise.all(picks.map((n) => loadShard(src, n).catch(() => [])));
  return got.flat().map((r) => normalizeStatic(src, r)).filter(Boolean);
}

export function normalizeStatic(src, r) {
  if (!r || !(r.u || r.img)) return null;
  const nga = src === "nga";
  return {
    uid: `${src}:${r.i}`, src, museum: MUSEUMS[src].name, id: r.i, title: r.t || "Untitled", artist: r.a || null, artistBio: r.b || null,
    date: r.d || null, year: r.y ?? null, place: r.p || null, medium: r.m || null, mediumFamily: mediumFamily(r.m), kind: r.k || null,
    movement: r.s || null, subjects: [], color: null,
    image: nga ? `https://api.nga.gov/iiif/${r.u}/full/!900,900/0/default.jpg` : r.img,
    imageLarge: nga ? `https://api.nga.gov/iiif/${r.u}/full/!2000,2000/0/default.jpg` : (r.imgL || r.img),
    lqip: null, alt: r.x || null, ar: r.r || null,
    dims: r.h && r.w ? `${r.h} × ${r.w} cm` : null, dimsCm: r.h && r.w ? { h: r.h, w: r.w } : null,
    credit: r.c || null, url: nga ? `https://www.nga.gov/collection/art-object-page.${r.i}.html` : r.url,
    onView: nga ? null : !!r.v, gallery: r.v || null, paras: r.wt || [],
  };
}

async function searchStatic(src, q, { limit = 24, browse = false } = {}) {
  const idx = await loadIndex(src);
  let picks = null;   // record numbers
  if (q) {
    const key = norm(q);
    const ids = Object.entries(idx.terms || {}).filter(([t]) => { const n = norm(t); return n && (n.includes(key) || key.includes(n)); }).flatMap(([, v]) => v);
    if (ids.length) picks = shuffle([...new Set(ids)]).slice(0, limit * 2);
    else if (!browse) return [];   // a named tradition with no match: let the next museum try
  }
  if (!picks) {   // browsing: a random stretch of the collection
    const shard = Math.floor(Math.random() * idx.shards);
    picks = Array.from({ length: limit * 2 }, () => shard * idx.shardSize + Math.floor(Math.random() * idx.shardSize));
  }
  const byShard = new Map();
  for (const n of picks) { const sh = Math.floor(n / idx.shardSize); if (!byShard.has(sh)) byShard.set(sh, []); byShard.get(sh).push(n % idx.shardSize); }
  const shards = [...byShard.keys()].slice(0, 3);
  const loaded = await Promise.all(shards.map((sh) => loadShard(src, sh)));
  const out = [];
  shards.forEach((sh, i) => { for (const pos of new Set(byShard.get(sh))) { const a = normalizeStatic(src, loaded[i][pos]); if (a) out.push(a); } });
  return shuffle(out).slice(0, limit);
}

/* ---------- Wikidata + Wikimedia Commons ---------- */
// Paintings with an image on Commons whose creator died before 1955 (so the work is very likely public domain).
const WD = "https://query.wikidata.org/sparql";
const sparqlStr = (s) => `"${String(s).replace(/["\\]/g, "")}"`;
function wdQuery(q, offset) {
  const base = `?item wdt:P31 wd:Q3305213; wdt:P18 ?image; wdt:P170 ?creator. ?creator wdt:P570 ?died. FILTER(YEAR(?died) < 1955)`;
  const by = !q ? `?item wdt:P135 ?movement.`
    : q.mode === "creator" ? `?creator rdfs:label ${sparqlStr(q.text)}@en. OPTIONAL { ?item wdt:P135 ?movement. }`
    : `?item wdt:P135 ?movement. ?movement rdfs:label ${sparqlStr(q.text)}@en.`;
  return `SELECT ?item ?itemLabel ?image ?creatorLabel ?inception ?movementLabel ?collectionLabel ?countryLabel ?height ?width WHERE {
    ${base} ${by}
    OPTIONAL { ?item wdt:P571 ?inception. } OPTIONAL { ?item wdt:P195 ?collection. } OPTIONAL { ?item wdt:P495 ?country. }
    OPTIONAL { ?item wdt:P2048 ?height. } OPTIONAL { ?item wdt:P2049 ?width. }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 60 OFFSET ${offset}`;
}
const isQid = (s) => /^Q\d+$/.test(s || "");
export function normalizeWikidata(rows) {
  const by = new Map();
  for (const b of rows || []) {
    const v = (k) => (b[k] ? b[k].value : null);
    const id = (v("item") || "").split("/").pop();
    if (!id || by.has(id) || !v("image")) continue;
    const file = v("image").replace(/^http:/, "https:");
    const title = v("itemLabel"), artist = v("creatorLabel");
    if (!title || isQid(title)) continue;
    const year = v("inception") ? parseInt(v("inception").replace(/^\+/, ""), 10) : null;
    const h = parseFloat(v("height")), w = parseFloat(v("width"));
    const coll = v("collectionLabel");
    by.set(id, {
      uid: `wd:${id}`, src: "wd", museum: MUSEUMS.wd.name, id, title, artist: isQid(artist) ? null : artist, artistBio: null,
      date: Number.isFinite(year) ? String(year) : null, year: Number.isFinite(year) ? year : null,
      place: isQid(v("countryLabel")) ? null : v("countryLabel"), medium: null, mediumFamily: "Oil", kind: "painting",
      movement: isQid(v("movementLabel")) ? null : v("movementLabel"), subjects: [], color: null,
      image: `${file}?width=900`, imageLarge: `${file}?width=2000`, lqip: null, alt: null, ar: null,
      dims: h > 0 && w > 0 && h < 2000 && w < 2000 ? `${h} × ${w} cm` : null, dimsCm: h > 0 && w > 0 && h < 2000 && w < 2000 ? { h, w } : null,
      credit: coll && !isQid(coll) ? `Collection: ${coll}` : null, url: `https://www.wikidata.org/wiki/${id}`, onView: null, gallery: null, paras: [],
    });
  }
  return [...by.values()];
}
const WD_BROWSE = ["Impressionism", "Post-Impressionism", "Baroque", "Romanticism", "Realism", "Symbolism", "Expressionism", "Rococo",
  "Neoclassicism", "Art Nouveau", "Fauvism", "Cubism", "Futurism", "Pre-Raphaelite Brotherhood", "Mannerism", "Dutch Golden Age painting",
  "Hudson River School", "Vienna Secession", "Der Blaue Reiter", "Pointillism", "Academic art", "Barbizon school", "Tonalism", "Naturalism"];
async function searchWikidata(q, { limit = 24, browse = false } = {}) {
  const run = async (query, offset) => normalizeWikidata(((await getJSON(`${WD}?format=json&query=${encodeURIComponent(wdQuery(query, offset))}`, 20000)).results || {}).bindings);
  // Browse terms ("portrait", "harvest") aren't movement names here. A random deep slice of every painting is too slow
  // for Wikidata (it timed out in the live probe), so browsing picks a well-covered movement instead: fast and varied.
  if (!q || browse) {
    // Try two random movements at a random depth, then the start, then a movement that always has plenty.
    const picks = shuffle([...WD_BROWSE]).slice(0, 2).concat("Impressionism");
    for (const m of picks) {
      const offset = 60 * Math.floor(Math.random() * 4);
      let got = await run({ mode: "movement", text: m }, offset);
      if (!got.length && offset) got = await run({ mode: "movement", text: m }, 0);
      if (got.length) return shuffle(got).slice(0, limit);
    }
    return [];
  }
  let out = await run({ mode: "movement", text: q }, 0);
  if (!out.length) out = await run({ mode: "creator", text: q }, 0);
  return shuffle(out).slice(0, limit);
}

/* ---------- Victoria and Albert Museum ---------- */
const VAM = "https://api.vam.ac.uk/v2";
const flipName = (n) => { const m = String(n || "").match(/^([^,]+),\s*(.+)$/); return m ? `${m[2]} ${m[1]}` : (n || null); };
export function normalizeVAM(r) {
  const im = r && r._images;
  if (!im || !im._iiif_image_base_url) return null;
  const base = im._iiif_image_base_url.replace(/\/?$/, "/");
  const maker = r._primaryMaker && r._primaryMaker.name;
  const yr = String(r._primaryDate || "").match(/\d{3,4}/);
  const loc = r._currentLocation || {};
  const unknown = !maker || /^unknown/i.test(maker);
  return {
    uid: `vam:${r.systemNumber}`, src: "vam", museum: MUSEUMS.vam.name, id: r.systemNumber,
    title: clean(r._primaryTitle) || clean(r.objectType) || "Untitled", artist: unknown ? null : flipName(maker), artistBio: null,
    date: clean(r._primaryDate) || null, year: yr ? +yr[0] : null, place: clean(r._primaryPlace) || null,
    medium: null, mediumFamily: mediumFamily(r.objectType), kind: clean(r.objectType) || null, movement: null, subjects: [], color: null,
    image: `${base}full/!900,900/0/default.jpg`, imageLarge: `${base}full/!2000,2000/0/default.jpg`, lqip: null, alt: null, ar: null,
    dims: null, dimsCm: null, credit: null, url: `https://collections.vam.ac.uk/item/${r.systemNumber}/`,
    onView: !!loc.onDisplay, gallery: loc.onDisplay ? clean(loc.displayName) : null, paras: null,
  };
}
async function searchVAM(q, { limit = 24, browse = false } = {}) {
  const term = q || BROWSE_HINT[Math.floor(Math.random() * BROWSE_HINT.length)];
  const page = browse ? 1 + Math.floor(Math.random() * 8) : 1;
  const j = await getJSON(`${VAM}/objects/search?q=${encodeURIComponent(term)}&images_exist=1&page_size=${limit}&page=${page}`);
  return (j.records || []).map(normalizeVAM).filter(Boolean);
}
const BROWSE_HINT = ["painting", "oil painting", "watercolour", "miniature", "portrait", "landscape", "drawing", "tapestry", "woodblock print", "sculpture"];

/* ---------- SMK, National Gallery of Denmark ---------- */
const SMK = "https://api.smk.dk/api/v1";
const DA = { maleri: "Painting", tegning: "Drawing", akvarel: "Watercolor", grafik: "Print", skulptur: "Sculpture", fotografi: "Photograph",
  "olie på lærred": "Oil on canvas", "olie på træ": "Oil on wood", "olie på papir": "Oil on paper", "olie på kobber": "Oil on copper", "olie på pap": "Oil on cardboard" };
const NAT = { dansk: "Danish", fransk: "French", italiensk: "Italian", tysk: "German", nederlandsk: "Dutch", hollandsk: "Dutch", flamsk: "Flemish",
  engelsk: "British", britisk: "British", norsk: "Norwegian", svensk: "Swedish", spansk: "Spanish", amerikansk: "American", russisk: "Russian", østrigsk: "Austrian", schweizisk: "Swiss", belgisk: "Belgian" };
const da = (s) => { const t = clean(s); return DA[t.toLowerCase()] || t || null; };
export function normalizeSMK(r) {
  if (!r || !r.has_image || r.public_domain === false || !r.image_thumbnail) return null;
  const titles = r.titles || [];
  const title = (titles.find((t) => /engelsk|english/i.test(t.language || "")) || titles[0] || {}).title;
  const prod = (r.production || [])[0] || {};
  const artist = (r.artist || [])[0] || flipName(prod.creator) || null;
  const yr = (d) => (d ? new Date(d).getUTCFullYear() : null);
  const life = [yr(prod.creator_date_of_birth), yr(prod.creator_date_of_death)].filter(Boolean).join("–");
  const bio = [NAT[String(prod.creator_nationality || "").toLowerCase()] || clean(prod.creator_nationality), life].filter(Boolean).join(", ");
  const pd = (r.production_date || [])[0] || {};
  const dim = (type) => { const d = (r.dimensions || []).find((x) => x.type === type); if (!d) return null; const v = parseFloat(d.value); return d.unit === "millimeter" ? v / 10 : v; };
  const h = dim("højde"), w = dim("bredde");
  return {
    uid: `smk:${r.object_number}`, src: "smk", museum: MUSEUMS.smk.name, id: r.object_number, title: clean(title) || "Untitled",
    artist: /^ukendt/i.test(artist || "") ? null : artist, artistBio: bio || null,
    date: clean(pd.period) || null, year: yr(pd.start), place: NAT[String(prod.creator_nationality || "").toLowerCase()] || null,   // nationality stands in for place
    medium: da((r.techniques || [])[0]), mediumFamily: mediumFamily(da((r.techniques || [])[0]) || ""), kind: da(((r.object_names || [])[0] || {}).name),
    movement: null, subjects: [], color: null,
    image: r.image_thumbnail, imageLarge: r.image_iiif_id ? `${r.image_iiif_id}/full/!2000,2000/0/default.jpg` : r.image_thumbnail,
    lqip: null, alt: null, ar: r.image_width && r.image_height ? r.image_width / r.image_height : null,
    dims: h && w ? `${Math.round(h * 10) / 10} × ${Math.round(w * 10) / 10} cm` : null, dimsCm: h && w ? { h, w } : null,
    credit: null, url: r.frontend_url || `https://open.smk.dk/artwork/image/${r.object_number}`, onView: !!r.on_display, gallery: null, paras: [],
  };
}
async function searchSMK(q, { limit = 24, browse = false } = {}) {
  const keys = q || ["maleri", "portræt", "landskab", "*"][Math.floor(Math.random() * 4)];
  const offset = browse ? Math.floor(Math.random() * 400) : 0;
  const filters = encodeURIComponent("[has_image:true],[public_domain:true]");
  const j = await getJSON(`${SMK}/art/search/?keys=${encodeURIComponent(keys)}&offset=${offset}&rows=${limit}&filters=${filters}`);
  return (j.items || []).map(normalizeSMK).filter(Boolean);
}

const SEARCH = { aic: searchAIC, met: searchMet, nga: (q, o) => searchStatic("nga", q, o), cma: (q, o) => searchStatic("cma", q, o),
  wd: searchWikidata, vam: searchVAM, smk: searchSMK };

export function search(src, q, opts) {
  if (!SEARCH[src]) return Promise.resolve([]);
  return tracked(src, () => SEARCH[src](q, opts));
}

// Long-form text and live gallery status. Chicago needs a second request; the others arrive with the search.
const detailCache = new Map();
export async function details(item) {
  if (item.src === "vam") return vamDetails(item);
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

async function vamDetails(item) {
  if (detailCache.has(item.uid)) return detailCache.get(item.uid);
  const j = await getJSON(`${VAM}/object/${encodeURIComponent(item.id)}`);
  const r = j.record || j;
  const paras = [r.summaryDescription, r.physicalDescription, r.objectHistory].filter(Boolean).flatMap((h) => htmlToParas(h)).slice(0, 3);
  const dim = (name) => { const d = (r.dimensions || []).find((x) => new RegExp(name, "i").test(x.dimension || "")); if (!d) return null;
    const v = parseFloat(d.value); return d.unit === "mm" ? v / 10 : d.unit === "cm" ? v : null; };
  const h = dim("height"), w = dim("width");
  if (h && w && !item.dimsCm) { item.dimsCm = { h, w }; item.dims = `${h} × ${w} cm`; }
  if (r.materialsAndTechniques && !item.medium) item.medium = clean(r.materialsAndTechniques);
  if (r.creditLine && !item.credit) item.credit = clean(r.creditLine);
  const out = { paras };
  detailCache.set(item.uid, out);
  return out;
}
