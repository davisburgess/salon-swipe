// Talks to the Picture Plane backend (a Cloudflare Worker). Everything here is optional:
// with no backend configured, the app works fully on this device.
//
// Identity is a random collection key, not an email or password. Whoever holds the key can read and write
// that collection, so it's shown only on request and shared only through a pairing link you send yourself.

import { mergeSwipes } from "./store.js";

let base = null;
export async function configure() {
  try {
    const r = await fetch("./api.json", { cache: "no-store" });
    if (r.ok) { const j = await r.json(); base = j && j.base ? String(j.base).replace(/\/$/, "") : null; }
  } catch (e) { base = null; }
  return base;
}
export const apiBase = () => base;

export function newKey() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export const validKey = (k) => typeof k === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(k);

async function call(path, key, body, method = "POST") {
  if (!base) throw new Error("No backend is connected yet.");
  const r = await fetch(base + path, {
    method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Server error ${r.status}`), { status: r.status });
  return j;
}

export async function health() {
  if (!base) return { ok: false, reason: "not configured" };
  try { return await call("/v1/health", null, null, "GET"); } catch (e) { return { ok: false, reason: e.message }; }
}

// Push what changed here, pull what changed elsewhere. Safe to call often.
export async function syncNow(state) {
  const key = state.sync.key;
  if (!validKey(key)) throw new Error("Sync isn't set up on this device.");
  const dirty = new Set(state.sync.dirty);
  const outgoing = state.swipes.filter((s) => dirty.has(s.uid));
  let cursor = state.sync.cursor || 0, pulled = 0;
  for (let i = 0; i < Math.max(1, Math.ceil(outgoing.length / 500)); i++) {
    const chunk = outgoing.slice(i * 500, (i + 1) * 500);
    const res = await call("/v1/sync", key, {
      cursor, swipes: chunk, removed: i === 0 ? (state.sync.removed || []) : [],
      meta: { later: state.later, settings: state.settings, seedIdx: state.seedIdx, notes: state.notes.slice(-30), badges: state.badges, museumDays: state.museumDays || {}, t: state.sync.metaT || 0 },
    });
    pulled += mergeSwipes(state, res.swipes || []);
    cursor = res.cursor ?? cursor;
    if (res.meta && (res.meta.t || 0) > (state.sync.metaT || 0)) {
      const m = res.meta;
      if (Array.isArray(m.later)) state.later = m.later.filter((l) => !state.seen[l.a.uid]);
      if (m.settings) state.settings = { ...state.settings, ...m.settings };
      if (Number.isFinite(m.seedIdx)) state.seedIdx = Math.max(state.seedIdx, m.seedIdx);
      if (Array.isArray(m.notes)) { const ids = new Set(state.notes.map((n) => n.id)); state.notes = state.notes.concat(m.notes.filter((n) => !ids.has(n.id))).sort((a, b) => a.t - b.t); }
      if (m.badges) state.badges = { ...m.badges, ...state.badges };
      if (m.museumDays) state.museumDays = { ...m.museumDays, ...(state.museumDays || {}) };
      state.sync.metaT = m.t;
    }
  }
  state.sync.dirty = []; state.sync.removed = []; state.sync.cursor = cursor; state.sync.lastSync = Date.now();
  return { pushed: outgoing.length, pulled };
}

export async function writeNote(state, facts, level) {
  return call("/v1/notes", state.sync.key, { facts, tone: state.settings.tone, level });
}

export async function deleteAccount(state) {
  return call("/v1/account", state.sync.key, null, "DELETE");
}
