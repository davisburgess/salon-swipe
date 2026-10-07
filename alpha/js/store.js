// Everything the app remembers, in one object, saved to this browser.
// Sync (sync.js) and backups move this same shape between devices.

import { features } from "./model.js";

export const STORE_KEY = "pp-alpha-v1";
export const SCHEMA = 1;

export const blank = () => ({
  ver: SCHEMA,
  swipes: [],            // { uid, v: 2 love | 1 keep | -1 pass | 0 undecided, f: tokens, t, why?: [], a: compact work }
  seen: {},              // uid -> 1
  later: [],             // { a, n: times deferred, due: decision count when it returns }
  seedIdx: 0,
  notes: [],             // Curator's Notes { id, level, title, text, tone, ai, t }
  badges: {},            // id -> time earned
  level: 0,
  settings: { explore: 0.35, tone: "cheeky", sources: { aic: true, met: true, nga: true, cma: true, wd: true, vam: true, smk: true } },
  lastBackup: 0, backupCount: 0,
  sync: { key: null, cursor: 0, lastSync: 0, dirty: [] },
  imported: {}, welcomeDismissed: false, onboarded: false,
});

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(STORE_KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw), b = blank();
    return { ...b, ...s, settings: { ...b.settings, ...(s.settings || {}), sources: { ...b.settings.sources, ...((s.settings || {}).sources || {}) } },
      sync: { ...b.sync, ...(s.sync || {}) } };
  } catch (e) { return blank(); }
}

let failed = false;
export function save(state, storage = globalThis.localStorage) {
  try { storage.setItem(STORE_KEY, JSON.stringify(state)); failed = false; } catch (e) { failed = true; }
  return !failed;
}
export const saveFailed = () => failed;

// What we keep about a work after you've judged it: enough to show it in your collection and retrain the model.
export function compact(a) {
  const keep = ["uid", "src", "museum", "id", "title", "artist", "date", "year", "place", "kind", "medium", "mediumFamily",
    "movement", "subjects", "color", "image", "imageLarge", "ar", "dims", "dimsCm", "credit", "url", "onView", "gallery", "vis"];
  const o = {};
  for (const k of keep) if (a[k] != null && !(Array.isArray(a[k]) && !a[k].length)) o[k] = a[k];
  return o;
}

export function record(state, a, v, why) {
  const rec = { uid: a.uid, v, f: features(a), t: Date.now(), a: compact(a) };
  if (why && why.length) rec.why = why;
  state.swipes.push(rec);
  state.seen[a.uid] = 1;
  state.sync.dirty.push(a.uid);
  return rec;
}

/* ---------- Salon Swipe import ---------- */
// Salon Swipe stored Chicago works under numeric ids with its own field names. Its feature tokens
// use the same "dim|value" scheme, so its history trains this model directly.
const AIC_IIIF = "https://www.artic.edu/iiif/2";
function fromSalonWork(a) {
  if (!a || a.id == null) return null;
  return {
    uid: `aic:${a.id}`, src: "aic", museum: "Art Institute of Chicago", id: a.id, title: a.title || "Untitled",
    artist: a.artist_title || null, date: a.date_display || null, movement: a.style_title || null,
    kind: a.classification_title || null, place: a.place_of_origin || null, year: a.date_start ?? null,
    color: a.color || null, subjects: a.subject_titles || [],
    image: a.image_id ? `${AIC_IIIF}/${a.image_id}/full/843,/0/default.jpg` : null,
    imageLarge: a.image_id ? `${AIC_IIIF}/${a.image_id}/full/1686,/0/default.jpg` : null,
    url: `https://www.artic.edu/artworks/${a.id}`,
  };
}
export function fromSalonSwipe(data) {
  const swipes = [], later = [];
  for (const s of (data && data.swipes) || []) {
    const a = fromSalonWork(s.a || { id: s.id });
    if (!a || !Array.isArray(s.f)) continue;
    swipes.push({ uid: a.uid, v: s.v, f: s.f, t: s.t || 0, a: compact(a) });
  }
  for (const l of (data && data.later) || []) {
    const a = fromSalonWork(l.a);
    if (a && a.image) later.push({ a, n: l.n || 1, due: 0 });
  }
  return { swipes, later };
}

/* ---------- merge (backups, imports, sync) ---------- */
export function mergeSwipes(state, incoming) {
  const by = new Map(state.swipes.map((s) => [s.uid, s]));
  let added = 0;
  for (const s of incoming || []) {
    if (!s || !s.uid || !Array.isArray(s.f)) continue;
    const cur = by.get(s.uid);
    if (!cur) { by.set(s.uid, s); added++; }
    else if ((s.t || 0) > (cur.t || 0)) by.set(s.uid, s);
  }
  state.swipes = [...by.values()].sort((x, y) => (x.t || 0) - (y.t || 0));
  for (const s of state.swipes) state.seen[s.uid] = 1;
  state.later = (state.later || []).filter((l) => !state.seen[l.a.uid]);
  return added;
}

export function backupPayload(state) {
  return { app: "picture-plane", ver: SCHEMA, exported: new Date().toISOString(), swipes: state.swipes, later: state.later,
    seedIdx: state.seedIdx, notes: state.notes, badges: state.badges, settings: state.settings };
}

// Accepts a Picture Plane backup, a Salon Swipe backup (file or SALON1: code), or a PP1: code.
export function parseBackup(text) {
  text = String(text || "").trim();
  const decode = (b64) => decodeURIComponent(escape(atob(b64)));
  let d;
  if (text.startsWith("PP1:")) d = JSON.parse(decode(text.slice(4)));
  else if (text.startsWith("SALON1:")) d = JSON.parse(decode(text.slice(7)));
  else d = JSON.parse(text);
  if (!d || !Array.isArray(d.swipes)) throw new Error("not a backup");
  if (d.app === "picture-plane") return d;
  const conv = fromSalonSwipe(d);
  return { app: "salon-swipe", swipes: conv.swipes, later: conv.later, seedIdx: 0 };
}
export const encodeCode = (obj) => "PP1:" + btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
