// Picture Plane: app controller. Wires state, deck, model and views together.

import { esc, clamp, relTime, workKey } from "./util.js";
import { OPENING, TONES, WHY_CHIPS } from "./curation.js";
import { search, details, isAvailable, health as srcHealth, MUSEUMS } from "./sources.js";
import { TasteModel, features } from "./model.js";
import { Deck, MAX_DEFERS } from "./deck.js";
import { load, save, saveFailed, record, STORE_KEY, mergeSwipes, backupPayload, parseBackup, encodeCode, fromSalonSwipe, compact } from "./store.js";
import { stats, levelFor, LEVELS, profileFacts, templateNote } from "./rewards.js";
import { BADGES, FAMILIES, TIERS, badgeStats, award, unsealedAt, pinState, closest, eyeTitle, pinSVG, ensureDefs, tierName, byId as badgeById } from "./badges.js";
import * as api from "./sync.js";
import { analyze } from "./vision.js";
import { APP } from "./config.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- state ---------- */
const state = load();
const model = new TasteModel().fit(state.swipes);
const deck = new Deck({ state, model, search, isAvailable });
const undoStack = [];
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__pp = { state, model, deck, renderStage };   // test hook, local only
let syncTimer = null, syncing = false;

function touchMeta() { state.sync.metaT = Date.now(); }
function persist({ meta = false } = {}) {
  if (meta) touchMeta();
  save(state);
  if (state.sync.key && api.apiBase()) { clearTimeout(syncTimer); syncTimer = setTimeout(runSync, 4000); }
}
async function runSync(manual) {
  if (syncing || !state.sync.key || !api.apiBase()) return;
  syncing = true;
  try {
    const r = await api.syncNow(state);
    save(state);
    if (r.pulled) { model.fit(state.swipes); deck.rebuildKeys(); deck.queue = deck.queue.filter((a) => !state.seen[a.uid]); deck.topUp(); renderStage(); }
    if (manual) toast(r.pulled ? `Synced. ${r.pulled} new decisions arrived from your other devices.` : "Synced. Everything is up to date.");
  } catch (e) {
    if (manual) toast(`Sync failed: ${e.message}`);
  } finally { syncing = false; if (currentView === "settings") renderSettings(); }
}

/* ---------- small UI services ---------- */
const live = $("#live");
const say = (msg) => { live.textContent = ""; requestAnimationFrame(() => (live.textContent = msg)); };
let toastT;
function toast(msg, ms = 3400) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}
const museumShort = (src) => (MUSEUMS[src] || {}).short || "";

/* ---------- wall color ---------- */
// Curators paint walls to suit a hang. The wall here takes a quiet tint of each work's dominant hue.
function setWall(a) {
  const c = (a && (a.color || (a.vis && a.vis.hsl))) || null;
  const root = document.documentElement.style;
  if (!c) return;
  root.setProperty("--wh", c.h);
  root.setProperty("--ws", `${clamp(Math.round(c.s * 0.35), 4, 22)}%`);
}

/* ---------- views ---------- */
let currentView = "look";
function show(view) {
  currentView = view;
  for (const v of ["look", "taste", "kept", "settings"]) {
    $(`#view-${v}`).hidden = v !== view;
    const tab = $(`#tab-${v}`); tab.setAttribute("aria-current", v === view ? "page" : "false");
  }
  if (view === "taste") renderTaste();
  if (view === "kept") renderKept();
  if (view === "settings") renderSettings();
  if (view === "look") { renderStage(); }
  document.documentElement.dataset.view = view;
}
$$(".tabbar button").forEach((b) => (b.onclick = () => show(b.dataset.view)));

/* ---------- the stage ---------- */
const stage = $("#stage");

function cueFor(a) {
  if (a._look) return a._look >= MAX_DEFERS
    ? { k: "look", text: "Last look. Choosing Later again marks it undecided." }
    : { k: "look", text: "Second look. The wall text is open to help you decide." };
  if (a._why === "newstyle" && a._seed) return { k: "seed", text: `New style: ${a._seed.label}, ${a._seed.years}`, sub: a._seed.why };
  if (a._seed) { const i = OPENING.findIndex((o) => o.id === a._seed.id) + 1;
    return { k: "seed", text: `Opening hang ${i} of ${OPENING.length}: ${a._seed.label}, ${a._seed.years}`, sub: a._seed.why }; }
  if (!model.trained) return { k: "explore", text: "Still getting to know you." };
  const f = features(a), p = model.p(f), why = model.explain(f).filter((x) => x.dir === (p >= 0.5 ? "+" : "-"));
  a._p = p;
  const because = why.length ? `, mainly for ${why.map((x) => x.value).join(" and ")}` : "";
  if (a._why === "unsure") return { k: "unsure", text: `A test: we can't call this one (${Math.round(p * 100)}% chance you'll like it).` };
  if (a._why === "explore") return { k: "explore", text: `Something outside your usual. ${Math.round(p * 100)}% predicted.` };
  return { k: "match", text: `${Math.round(p * 100)}% predicted for you${because}.` };
}

function labelHTML(a) {
  const size = a.dimsCm ? `${fmtCm(a.dimsCm.h)} × ${fmtCm(a.dimsCm.w)} cm` : "";
  return `<p class="who">${esc(a.artist || "Unknown maker")}</p>
    ${a.artistBio ? `<p class="bio">${esc(a.artistBio)}</p>` : ""}
    <p class="what"><cite>${esc(a.title)}</cite>${a.date ? `, ${esc(a.date)}` : ""}</p>
    ${a.medium || size ? `<p class="med">${esc([a.medium, size].filter(Boolean).join("; "))}</p>` : ""}
    <p class="src">${esc(a.museum || "")}</p>`;
}
const fmtCm = (n) => (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

function cardEl(a, role) {
  const el = document.createElement("article");
  el.className = `card ${role}`;
  el.dataset.uid = a.uid;
  el.setAttribute("aria-label", `${a.title} by ${a.artist || "unknown maker"}`);
  const cue = role === "top" ? cueFor(a) : null;
  el.innerHTML = `
    <div class="hang"><img class="work" alt="${esc(a.alt || `${a.title}, ${a.artist || "unknown maker"}`)}" decoding="async" draggable="false"></div>
    <div class="plate">
      <div class="label">${labelHTML(a)}</div>
      ${cue ? `<div class="cue cue-${cue.k}"><p>${esc(cue.text)}</p>${cue.sub ? `<p class="sub">${esc(cue.sub)}</p>` : ""}</div>` : ""}
    </div>`;
  const img = $(".work", el);
  img.onload = () => { el.classList.add("loaded"); fitImage(el); };
  img.onerror = () => { el.dataset.broken = "1"; if (role === "top") dropBroken(a); };
  img.src = a.image;
  return el;
}

// Size the work to the largest it can hang at its true proportions, then pack the label up beneath it.
function fitImage(el) {
  const img = $(".work", el), box = $(".hang", el);
  if (!img || !img.naturalWidth) return;
  box.style.flex = ""; box.style.height = "";
  const W = box.clientWidth, H = box.clientHeight;
  if (!W || !H) return;
  const ar = img.naturalWidth / img.naturalHeight;
  let w = W, h = W / ar;
  if (h > H) { h = H; w = H * ar; }
  img.style.width = `${Math.floor(w)}px`; img.style.height = `${Math.floor(h)}px`;
  box.style.flex = `0 0 ${Math.floor(h)}px`;
}
addEventListener("resize", () => $$(".card", stage).forEach(fitImage));

function dropBroken(a) {
  if (deck.queue[0] !== a) return;
  state.seen[a.uid] = 1; deck.queue.shift(); deck.topUp(); persist(); renderStage();
}

function renderStage() {
  if (currentView !== "look") return;
  stage.innerHTML = "";
  const waiting = state.later.length;
  deck.releaseLater(); deck.topUp();
  if (state.later.length !== waiting) persist({ meta: true });
  const [a, b] = deck.queue;
  if (!a) {
    stage.innerHTML = `<div class="empty"><p>Hanging the next works…</p></div>`;
    deck.refill().then(() => {
      deck.topUp();
      if (deck.queue.length) return renderStage();
      stage.innerHTML = `<div class="empty"><p>The museums aren't answering right now. Check your connection, then try again.</p><button class="btn" id="retry">Try again</button></div>`;
      $("#retry").onclick = renderStage;
    });
    return;
  }
  if (b) stage.appendChild(cardEl(b, "next"));
  const top = cardEl(a, "top");
  stage.appendChild(top);
  setWall(a);
  bindDrag(top, a);
  if (!a.vis) analyze(a).then((v) => { if (v) { a.vis = v; if (deck.queue[0] === a && !a.color) setWall(a); } });
  if (b && !b.vis) analyze(b).then((v) => v && (b.vis = v));
  if (a._look === 2 && !a._autoOpened) { a._autoOpened = true; setTimeout(() => openSheet(a), 350); }
  if (deck.queue.length < 3 || deck.pool.length < 8) deck.refill().then(() => { deck.topUp(); if (!$(".card.next", stage) && deck.queue[1]) renderStage(); });
  $("#btnUndo").disabled = !undoStack.length;
}

/* ---------- gestures ---------- */
const edges = { keep: $("#edge-keep"), pass: $("#edge-pass"), love: $("#edge-love"), later: $("#edge-later") };
function setEdges(dx, dy) {
  edges.keep.style.opacity = clamp(dx / 120, 0, 1);
  edges.pass.style.opacity = clamp(-dx / 120, 0, 1);
  edges.love.style.opacity = clamp((-dy - Math.abs(dx)) / 110, 0, 1);
  edges.later.style.opacity = clamp((dy - Math.abs(dx)) / 110, 0, 1);
}
function bindDrag(el, a) {
  let sx = 0, sy = 0, dx = 0, dy = 0, t0 = 0, on = false, moved = false, oy = 0;
  const next = $(".card.next", stage);
  el.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    on = true; moved = false; sx = e.clientX; sy = e.clientY; t0 = performance.now();
    const r = el.getBoundingClientRect(); oy = (e.clientY - r.top) / r.height;
    el.setPointerCapture(e.pointerId); el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!on) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
    const rot = clamp(dx / 22, -14, 14) * (oy < 0.5 ? 1 : -1);
    el.style.transform = `translate(${dx}px, ${dy}px) rotate(${rot}deg)`;
    if (next) next.style.opacity = clamp((Math.abs(dx) + Math.abs(dy)) / 600, 0, 0.45);
    setEdges(dx, dy);
  });
  const end = () => {
    if (!on) return; on = false; el.classList.remove("dragging");
    const dt = Math.max(1, performance.now() - t0), vx = dx / dt, vy = dy / dt;
    const W = stage.clientWidth, H = stage.clientHeight;
    const horiz = Math.abs(dx) > Math.abs(dy);
    if (horiz && (Math.abs(dx) > W * 0.28 || (Math.abs(vx) > 0.6 && Math.abs(dx) > 40))) decide(dx > 0 ? 1 : -1, { vx, vy });
    else if (!horiz && dy < 0 && (-dy > H * 0.18 || (vy < -0.6 && -dy > 40))) decide(2, { vx, vy });
    else if (!horiz && dy > 0 && (dy > H * 0.18 || (vy > 0.6 && dy > 40))) later({ vx, vy });
    else {
      el.style.transform = ""; if (next) next.style.opacity = ""; setEdges(0, 0);
      if (!moved) openSheet(a);
    }
    dx = dy = 0;
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
}

function flyOut(el, kind, v = {}) {
  if (!el) return;
  const W = innerWidth, H = innerHeight;
  const to = { keep: [W * 1.3, (v.vy || 0) * 200], pass: [-W * 1.3, (v.vy || 0) * 200], love: [0, -H * 1.2], later: [0, H * 1.2], undecided: [0, H * 1.2] }[kind];
  el.classList.add("leaving");
  el.style.transition = reduceMotion ? "opacity .15s" : "transform .34s cubic-bezier(.3,.7,.2,1), opacity .34s";
  el.style.transform = reduceMotion ? "" : `translate(${to[0]}px, ${to[1]}px) rotate(${kind === "keep" ? 18 : kind === "pass" ? -18 : 0}deg)`;
  el.style.opacity = "0";
  const ed = edges[kind === "undecided" ? "later" : kind]; if (ed) { ed.style.opacity = 1; setTimeout(() => setEdges(0, 0), 260); }
  try { navigator.vibrate && navigator.vibrate(kind === "love" ? [6, 40, 10] : 8); } catch (e) {}
}

/* ---------- decisions ---------- */
const VERB = { 2: "Loved", 1: "Kept", "-1": "Passed", 0: "Marked undecided" };

function decide(v, vel) {
  const a = deck.queue[0]; if (!a) return;
  const top = $(".card.top", stage);
  const predicted = model.trained ? model.p(features(a)) : null;
  model.record(predicted, v);
  const rec = record(state, a, v);
  if (predicted != null && v !== 0) rec.p = Math.round(predicted * 100) / 100;   // for "Called it"
  if (a._look) rec.look = a._look;
  markSeedSeen(a);
  model.learn(rec.f, v);
  deck.markSeen(a); deck.queue.shift(); deck.releaseLater(); deck.topUp();
  undoStack.push({ type: "swipe", rec, card: a }); if (undoStack.length > 15) undoStack.shift();
  flyOut(top, v === 2 ? "love" : v === 1 ? "keep" : v === -1 ? "pass" : "undecided", vel);
  say(`${VERB[v]}: ${a.title}`);
  persist();
  setTimeout(() => { renderStage(); afterDecision(rec); }, reduceMotion ? 120 : 260);
  if (v === 2) showWhy(rec);
  else hideWhy();
}

// The opening hang only advances when you've actually seen a work, so leaving the app never skips traditions.
function markSeedSeen(a) {
  if (!a._seed || a._why === "newstyle") return;
  const i = OPENING.findIndex((o) => o.id === a._seed.id);
  if (i >= 0) state.seedIdx = Math.max(state.seedIdx, i + 1);
}

function later(vel) {
  const a = deck.queue[0]; if (!a) return;
  markSeedSeen(a);
  const res = deck.defer(a);
  if (res.undecided) { toast("Marked undecided. It won't come back."); return decide(0, vel); }
  undoStack.push({ type: "defer", entry: res.entry, card: a });
  flyOut($(".card.top", stage), "later", vel);
  say(`Saved for later: ${a.title}`);
  hideWhy();
  persist({ meta: true });
  setTimeout(renderStage, reduceMotion ? 120 : 260);
}

function undo() {
  const h = undoStack.pop(); if (!h) return;
  hideWhy();
  if (h.type === "skip") {
    const i = deck.queue.indexOf(h.shown);
    if (i >= 0) { deck.queue.splice(i, 1); deck.pool.push(h.shown); }
    deck.pool = deck.pool.filter((x) => x !== h.card);
    state.later = state.later.filter((l) => l.a.uid !== h.card.uid);
    deck.queue.unshift(h.card);
  } else if (h.type === "defer") {
    state.later = state.later.filter((l) => l !== h.entry);
    deck.queue.unshift(h.card); persist({ meta: true });
  } else {
    const i = state.swipes.lastIndexOf(h.rec); if (i >= 0) state.swipes.splice(i, 1);
    delete state.seen[h.rec.uid];
    state.sync.dirty = state.sync.dirty.filter((u) => u !== h.rec.uid);
    (state.sync.removed = state.sync.removed || []).push(h.rec.uid);
    model.fit(state.swipes); deck.rebuildKeys();
    state.counters = state.counters || {}; state.counters.undo = (state.counters.undo || 0) + 1;
    deck.queue.unshift(h.card); persist();
  }
  say(`Undone. ${h.card.title} is back.`);
  renderStage();
}

$("#btnPass").onclick = () => decide(-1);
$("#btnKeep").onclick = () => decide(1);
$("#btnLove").onclick = () => decide(2);
$("#btnLater").onclick = () => later();
$("#btnUndo").onclick = undo;
$("#btnInfo").onclick = () => deck.queue[0] && openSheet(deck.queue[0]);
$("#btnNewStyle").onclick = async (e) => {
  const b = e.currentTarget; b.disabled = true; b.textContent = "Finding one…";
  try {
    const res = await deck.newStyle();
    if (!res) { toast("Couldn't find a new style just now. Try again in a moment."); return; }
    if (res.skipped) {
      undoStack.push({ type: "skip", card: res.skipped, shown: deck.queue[0] });
      // A skipped second look goes back to Later rather than being lost.
      if (res.skipped._look) state.later.push({ a: res.skipped, n: res.skipped._look - 1, due: state.swipes.length + 3 });
    }
    flyOut($(".card.top", stage), "later");
    say(`New style: ${res.seed.label}`);
    hideWhy();
    setTimeout(renderStage, reduceMotion ? 120 : 260);
  } finally { b.disabled = false; b.textContent = "New style"; }
};
addEventListener("keydown", (e) => {
  if (e.key === "Escape") { closeSheet(); closeZoom(); hideWhy(); closeModal(); return; }
  if (currentView !== "look" || !$("#modal").hidden || e.target.closest("input,textarea,select")) return;
  // Deciding while the wall text is open closes it and acts on the work you were reading about.
  if (!$("#sheet").hidden) { if (!/^Arrow/.test(e.key)) return; closeSheet(); }
  const k = { ArrowRight: () => decide(1), ArrowLeft: () => decide(-1), ArrowUp: () => decide(2), ArrowDown: () => later(), Backspace: undo, i: () => deck.queue[0] && openSheet(deck.queue[0]) }[e.key];
  if (k) { e.preventDefault(); k(); }
});

/* ---------- why chips ---------- */
let whyRec = null, whyT = null;
function showWhy(rec) {
  whyRec = rec;
  const tray = $("#why");
  tray.innerHTML = `<p>What drew you in?</p><div class="chips">${WHY_CHIPS.map((c) => `<button type="button" class="chip" aria-pressed="false" data-c="${c}">${c}</button>`).join("")}</div>`;
  tray.hidden = false;
  $$(".chip", tray).forEach((b) => (b.onclick = () => {
    const on = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", on);
    const set = new Set(whyRec.why || []); on ? set.add(b.dataset.c) : set.delete(b.dataset.c);
    whyRec.why = [...set]; if (!whyRec.why.length) delete whyRec.why;
    state.sync.dirty.push(whyRec.uid); persist();
    clearTimeout(whyT); whyT = setTimeout(hideWhy, 5000);
  }));
  clearTimeout(whyT); whyT = setTimeout(hideWhy, 6000);
}
function hideWhy() { $("#why").hidden = true; whyRec = null; clearTimeout(whyT); }

/* ---------- progress ---------- */
async function afterDecision(rec) {
  const st = stats(state, model), lv = levelFor(st);
  renderLevelChip(lv);
  const leveled = lv.level > (state.level || 0);
  if (leveled) state.level = lv.level;
  const fresh = award(state, badgeStats(state, model), currentLevel());
  if (fresh.length || leveled) persist({ meta: true });
  if (fresh.length && !leveled) toast(pinNews(fresh), 4200);
  if (leveled) {
    const opened = unsealedAt(state, lv.level);
    const note = await makeNote(LEVELS[lv.level].name);
    openModal(`<p class="kicker">New level</p><h2 class="display">${esc(LEVELS[lv.level].name)}</h2>
      ${opened.length ? `<div class="unsealed"><p class="kicker">Seals broken</p><div class="pinrow">${opened.map(({ b, tier }) => `<figure>${pinSVG(b, tier)}<figcaption>${esc(b.name)}<br><small>${tierName(b, tier)}</small></figcaption></figure>`).join("")}</div></div>` : ""}
      <article class="note"><h3>${esc(note.title)}</h3><p>${esc(note.text)}</p></article>
      <button class="btn primary" id="modalOk">Keep looking</button>`);
    $("#modalOk").onclick = closeModal;
  }
  if (state.swipes.length - (state.backupCount || 0) >= 75 && !state.sync.key) $("#nudge").hidden = false;
}
// Your level for seals never goes down, even if accuracy dips.
function currentLevel() { return Math.max(state.level || 0, levelFor(stats(state, model)).level); }
function pinNews(fresh) {
  const open = fresh.filter((f) => !f.sealed), sealed = fresh.filter((f) => f.sealed);
  const label = ({ b, tier }) => `${b.fam === "secret" ? "Secret pin: " : ""}${b.name}${b.tiers ? ` (${tierName(b, tier).toLowerCase()})` : ""}`;
  const parts = [];
  if (open.length) parts.push(open.length === 1 ? `Pin earned: ${label(open[0])}` : `${open.length} pins earned: ${open.slice(0, 3).map(label).join(", ")}${open.length > 3 ? "…" : ""}`);
  if (sealed.length) { const f = sealed[0]; parts.push(`${tierName(f.b, f.tier)} ${f.b.name} earned. It unseals at ${LEVELS[TIERS[f.tier].level].name}.`); }
  return parts.join(" · ");
}

// First run of the cabinet: your history earns its pins in one moment instead of a stream of pop-ups.
function openCabinet() {
  if (state.badges["pin:_init"]) return;
  const fresh = award(state, badgeStats(state, model), currentLevel());
  state.badges["pin:_init"] = Date.now(); persist({ meta: true });
  if (!state.onboarded || !fresh.length) return;
  const open = fresh.filter((f) => !f.sealed), sealed = fresh.filter((f) => f.sealed);
  const best = new Map(); open.forEach((f) => { if (!best.has(f.b.id) || best.get(f.b.id).tier < f.tier) best.set(f.b.id, f); });
  const shown = [...best.values()];
  openModal(`<p class="kicker">New in ${esc(APP.name)}</p><h2 class="display small">Your cabinet is open</h2>
    <p>Your ${state.swipes.length} decisions so far earned <b>${shown.length} ${shown.length === 1 ? "pin" : "pins"}</b>${sealed.length ? `, plus ${sealed.length} higher ${sealed.length === 1 ? "tier" : "tiers"} sealed until you level up` : ""}.</p>
    <div class="pinrow ceremony">${shown.map(({ b, tier }, i) => `<figure style="--i:${i}">${pinSVG(b, tier)}<figcaption>${esc(b.name)}</figcaption></figure>`).join("")}</div>
    <button class="btn primary" id="modalOk">See them in Taste</button><button class="btn" id="modalLater">Later</button>`);
  $("#modalOk").onclick = () => { closeModal(); show("taste"); setTimeout(() => jumpTo("t-badges"), 60); };
  $("#modalLater").onclick = closeModal;
}

async function makeNote(levelName) {
  const facts = profileFacts(state, model);
  let note = null;
  if (api.apiBase() && state.sync.key) {
    try { const r = await api.writeNote(state, facts, levelName); if (r && r.text) note = { title: r.title, text: r.text, ai: true }; } catch (e) { /* fall back */ }
  }
  if (!note) {
    const avoid = state.notes.slice(-3).flatMap((n) => n.angles || []);
    note = { ...templateNote(facts, levelName, { tone: state.settings.tone, avoid }), ai: false };
  }
  note = { ...note, id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, level: levelName, tone: note.tone || state.settings.tone, t: Date.now() };
  state.notes.push(note); persist({ meta: true });
  return note;
}

function renderLevelChip(lv = levelFor(stats(state, model))) {
  const chip = $("#levelChip");
  const done = lv.next ? lv.next.needs.reduce((t, n) => t + Math.min(1, n.have / n.need), 0) / lv.next.needs.length : 1;
  chip.innerHTML = `<svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" class="ring-bg"/><circle cx="18" cy="18" r="15" class="ring" style="stroke-dasharray:${(done * 94.25).toFixed(1)} 94.25"/></svg><span>${esc(lv.name)}</span>`;
  chip.setAttribute("aria-label", `Level: ${lv.name}${lv.next ? `. ${Math.round(done * 100)}% of the way to ${lv.next.name}` : ""}. Open your taste profile.`);
}
$("#levelChip").onclick = () => show("taste");

/* ---------- Tell me more ---------- */
const sheet = $("#sheet"), scrim = $("#scrim");
function scaleSVG(d) {
  if (!d) return "";
  const person = 170, maxH = Math.max(person, d.h), maxW = d.w + 70;
  const k = Math.min(150 / maxH, 280 / maxW), base = 160;
  const pw = 42 * k, ph = person * k, ax = 20 + pw + 24, aw = d.w * k, ah = d.h * k;
  const ay = base - ah - Math.max(0, (90 * k));   // works hang with their centre near eye level
  const y = Math.max(4, Math.min(ay, base - ah));
  return `<figure class="scale"><svg viewBox="0 0 ${Math.max(320, ax + aw + 20)} 172" role="img" aria-label="Size compared with a person 170 centimetres tall">
    <line x1="0" y1="${base}" x2="100%" y2="${base}" class="floor"/>
    <g class="person" transform="translate(20 ${base - ph})"><circle cx="${pw / 2}" cy="${ph * 0.07}" r="${ph * 0.07}"/><rect x="${pw * 0.18}" y="${ph * 0.16}" width="${pw * 0.64}" height="${ph * 0.84}" rx="${pw * 0.3}"/></g>
    <rect x="${ax}" y="${y}" width="${Math.max(2, aw)}" height="${Math.max(2, ah)}" class="art"/>
  </svg><figcaption>${fmtCm(d.h)} × ${fmtCm(d.w)} cm, next to a 170 cm person</figcaption></figure>`;
}
let sheetForDeck = false;
function openSheet(a) {
  // Opened on the work you're judging: decide right from the wall text, by button or by swiping the panel.
  sheetForDeck = currentView === "look" && deck.queue[0] === a;
  $("#sheetActions").hidden = !sheetForDeck;
  $("#sheetHint").hidden = (state.sheetDecisions || 0) >= 3;
  const f = features(a), why = model.trained ? model.explain(f, 3) : [];
  const facts = [["Date", a.date], ["Medium", a.medium], ["Size", a.dims], ["Made in", a.place], ["Movement", a.movement], ["Type", a.kind], ["Credit", a.credit]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  const reasons = why.length ? `<section class="reasons"><h3>Why you're seeing this</h3><ul>${why.map((x) => `<li><span class="${x.dir === "+" ? "up" : "down"}">${x.dir === "+" ? "Draws you" : "Puts you off"}</span> ${esc(x.dimLabel)}: ${esc(x.value)}</li>`).join("")}</ul></section>` : "";
  $("#sheetBody").innerHTML = `
    <button class="zoomBtn" id="zoomBtn" aria-label="View full size"><img src="${esc(a.image)}" alt="" draggable="false"></button>
    <h2 class="sheet-title"><cite>${esc(a.title)}</cite></h2>
    <p class="sheet-who">${esc(a.artist || "Unknown maker")}${a.artistBio ? `<br><span>${esc(a.artistBio)}</span>` : ""}</p>
    <div id="sheetText" class="prose">${(a.paras && a.paras.length) ? a.paras.map((p) => `<p>${esc(p)}</p>`).join("") : `<p class="muted">Reading the wall text…</p>`}</div>
    ${(() => { const r = state.swipes.find((s) => s.uid === a.uid); return r && r.v > 0 ? `<p class="sheet-love">${loveBtn(r)}<span>${r.v === 2 ? "Loved" : "Kept. Tap the star to love it."}</span></p>` : ""; })()}
    <p class="onview ${a.onView ? "yes" : ""}" id="onview" ${a.onView == null ? "hidden" : ""}>${a.onView ? `On view now${a.gallery ? `: ${esc(a.gallery)}` : ""}, ${esc(museumShort(a.src))}` : `In storage at ${esc(a.museum || "the museum")}`}</p>
    ${scaleSVG(a.dimsCm)}
    <dl class="facts">${facts}</dl>
    ${reasons}
    <p><a class="out" href="${esc(a.url)}" target="_blank" rel="noopener">See it on the ${esc(a.museum || "museum")} website</a></p>`;
  $("#zoomBtn").onclick = () => openZoom(a);
  const refreshLove = (rec) => {
    const wrap = $(".sheet-love", $("#sheetBody"));
    if (wrap) { wrap.innerHTML = `${loveBtn(rec)}<span>${rec.v === 2 ? "Loved" : "Kept. Tap the star to love it."}</span>`; bindLoveBtns(wrap, refreshLove); }
    if (currentView === "kept") renderKept();
  };
  bindLoveBtns($("#sheetBody"), refreshLove);
  sheet.hidden = scrim.hidden = false; sheet.scrollTop = 0;
  requestAnimationFrame(() => sheet.classList.add("open"));
  $("#sheetDone").focus({ preventScroll: true });
  details(a).then((d) => {
    if (sheet.hidden) return;
    const box = $("#sheetText");
    box.innerHTML = d.paras && d.paras.length ? d.paras.map((p) => `<p>${esc(p)}</p>`).join("")
      : `<p class="muted">The museum hasn't published a description for this work. Look closely and decide for yourself.</p>`;
    if (d.onView != null) { a.onView = d.onView; a.gallery = d.gallery || a.gallery;
      $("#onview").className = `onview ${a.onView ? "yes" : ""}`; $("#onview").hidden = false;
      $("#onview").textContent = a.onView ? `On view now${a.gallery ? `: ${a.gallery}` : ""}, ${museumShort(a.src)}` : `In storage at ${a.museum}`; }
  }).catch(() => { const box = $("#sheetText"); if (box) box.innerHTML = `<p class="muted">Couldn't reach the museum for the wall text. Try again in a moment.</p>`; });
}
function closeSheet() { if (sheet.hidden) return; sheet.classList.remove("open", "dragging"); sheet.style.transform = ""; sheet.hidden = scrim.hidden = true; setEdges(0, 0); }
function decideFromSheet(act, vel) {
  if (!sheetForDeck) return;
  closeSheet();
  state.sheetDecisions = (state.sheetDecisions || 0) + 1;
  if (act === "later") later(vel); else decide(act === "keep" ? 1 : act === "pass" ? -1 : 2, vel);
}
$$("#sheetActions [data-act]").forEach((b) => (b.onclick = () => decideFromSheet(b.dataset.act)));
// Horizontal drag on the panel: same thresholds as the card. Vertical movement is left to native scrolling.
(() => {
  let sx = 0, sy = 0, dx = 0, t0 = 0, mode = null, id = null;
  sheet.addEventListener("pointerdown", (e) => {
    if (!sheetForDeck || e.button > 0 || e.target.closest("a, select, input, textarea")) return;
    sx = e.clientX; sy = e.clientY; dx = 0; t0 = performance.now(); mode = null; id = e.pointerId;
  });
  sheet.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!mode && Math.abs(mx) + Math.abs(my) > 10) {
      mode = Math.abs(mx) > Math.abs(my) * 1.4 ? "x" : "y";
      if (mode === "x") try { sheet.setPointerCapture(e.pointerId); } catch (err) {}   // keep tracking past the screen edge
    }
    if (mode !== "x") return;
    dx = mx; sheet.classList.add("dragging");
    sheet.style.transform = `translateX(${dx}px) rotate(${clamp(dx / 40, -6, 6)}deg)`;
    setEdges(dx, 0);
  });
  const end = (e) => {
    if (e.pointerId !== id) return; id = null;
    if (mode !== "x") { mode = null; return; }
    const vx = dx / Math.max(1, performance.now() - t0), W = innerWidth;
    sheet.classList.remove("dragging");
    if (Math.abs(dx) > W * 0.3 || (Math.abs(vx) > 0.6 && Math.abs(dx) > 50)) decideFromSheet(dx > 0 ? "keep" : "pass", { vx, vy: 0 });
    else { sheet.style.transform = ""; setEdges(0, 0); }
    mode = null;
  };
  sheet.addEventListener("pointerup", end); sheet.addEventListener("pointercancel", end);
  // A horizontal drag shouldn't also count as a tap on whatever was under the finger.
  sheet.addEventListener("click", (e) => { if (Math.abs(dx) > 10 && !e.target.closest("[data-act]")) { e.stopPropagation(); e.preventDefault(); } dx = 0; }, true);
})();
scrim.onclick = closeSheet; $("#sheetDone").onclick = closeSheet;
(() => { let y0 = null;
  sheet.addEventListener("touchstart", (e) => { y0 = sheet.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sheet.addEventListener("touchend", (e) => { if (y0 != null && e.changedTouches[0].clientY - y0 > 90) closeSheet(); y0 = null; });
})();
const zoom = $("#zoom");
function openZoom(a) { $("#zoomImg").src = a.imageLarge || a.image; zoom.classList.remove("big"); zoom.hidden = false; }
function closeZoom() { zoom.hidden = true; }
$("#zoomImg").onclick = () => zoom.classList.toggle("big");
$("#zoomClose").onclick = closeZoom;

/* ---------- modal ---------- */
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; }

/* ---------- Taste ---------- */
const bar = (w, max) => { const pct = clamp(Math.abs(w) / max, 0, 1) * 50; return `<span class="bar"><i class="${w >= 0 ? "pos" : "neg"}" style="${w >= 0 ? `left:50%;width:${pct}%` : `left:${50 - pct}%;width:${pct}%`}"></i></span>`; };
function renderTaste() {
  ensureDefs();
  const st = stats(state, model), lv = levelFor(st), level = currentLevel();
  const bst = badgeStats(state, model);
  const latest = state.notes[state.notes.length - 1];
  const scroller = $("#view-taste"), keepScroll = scroller.scrollTop;

  // Portrait: your eye as a title, its traits, level, accuracy, notes.
  const eye = eyeTitle(bst, model);
  if (eye) { state.titles = state.titles || []; const last = state.titles[state.titles.length - 1];
    if (!last || last.title !== eye.title) { state.titles.push({ title: eye.title, t: Date.now() }); state.titles = state.titles.slice(-12); persist({ meta: true }); } }
  const earlier = (state.titles || []).slice(0, -1).reverse().find((x) => !eye || x.title !== eye.title);
  const traitPin = (tok) => BADGES.find((b) => b.tok === tok);
  const called = state.swipes.filter((x) => x.v !== 0 && typeof x.p === "number").slice(-10).map((x) => (x.p >= 0.5) === (x.v > 0));
  const portrait = `<section id="t-portrait" class="tsec">
    <p class="kicker">${eye ? "Your eye right now" : "Your eye"}</p>
    <h1 class="display">${esc(eye ? eye.title : "Still looking")}</h1>
    ${eye && eye.traits.length ? `<div class="traits">${eye.traits.map((tok) => { const b = traitPin(tok); return b ? `<button type="button" class="trait" data-pin="${b.id}">${pinSVG(b, 1, state.badges[`pin:${b.id}:1`] ? "earned" : "locked")}<span>${esc(b.name)}</span></button>` : ""; }).join("")}</div>` : ""}
    ${!eye ? `<p class="muted">Your eye gets a name after 25 decisions.</p>` : earlier ? `<p class="muted small">Before: ${esc(earlier.title)}</p>` : ""}
    <div class="level">
      <p class="kicker">Level: <b>${esc(LEVELS[level].name)}</b></p>
      ${lv.next ? `<p class="small muted">To become a ${esc(lv.next.name)}:</p><ul class="needs">${lv.next.needs.map((n) => `<li class="${n.done ? "done" : ""}"><span>${n.done ? `Done: ${n.pct ? `${n.need}%+` : n.need} ${esc(n.label)}` : `${n.pct ? `${n.have}% of ${n.need}%` : `${n.have} of ${n.need}`} ${esc(n.label)}`}</span><span class="meter"><i style="width:${Math.round(clamp(n.have / n.need, 0, 1) * 100)}%"></i></span></li>`).join("")}</ul>` : `<p class="small muted">The top of the ladder. Keep looking; the notes keep coming.</p>`}
    </div>
    <div class="tiles"><div><b>${st.decided}</b><span>judged</span></div><div><b>${Math.round(st.keepRate * 100)}%</b><span>kept</span></div><div><b>${st.accuracy == null ? "–" : Math.round(st.accuracy * 100) + "%"}</b><span>predicted right</span></div></div>
    ${called.length >= 5 ? `<p class="kicker">Called it: ${called.filter(Boolean).length} of your last ${called.length}</p><div class="callit" aria-hidden="true">${called.map((ok) => `<i class="${ok ? "hit" : ""}"></i>`).join("")}</div>` : ""}
    <div class="notes">
      <div class="notes-head"><h2>Curator's notes</h2>
        <label class="tone">Tone <select id="toneSel">${Object.entries(TONES).map(([k, t]) => `<option value="${k}" ${state.settings.tone === k ? "selected" : ""}>${t.label}</option>`).join("")}</select></label></div>
      ${latest ? `<article class="note"><h3>${esc(latest.title)}</h3><p>${esc(latest.text)}</p><p class="note-meta">${relTime(latest.t)}${latest.ai ? "" : ", written offline"}</p></article>` : `<p class="muted">Your first note arrives when you reach Docent.</p>`}
      <button class="btn" id="noteNow" ${st.decided < 15 ? "disabled" : ""}>Write a new note</button>
      ${!api.apiBase() ? `<p class="muted small">Notes are written on this device in the dry voice. Connect the backend for fuller notes in any tone.</p>` : ""}
      ${state.notes.length > 1 ? `<details class="past"><summary>Earlier notes (${state.notes.length - 1})</summary>${state.notes.slice(0, -1).reverse().map((n) => `<article class="note small"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p><p class="note-meta">${relTime(n.t)}</p></article>`).join("")}</details>` : ""}
    </div></section>`;

  // Badges: closest next, then the cabinet by family.
  const states = BADGES.map((b) => ({ b, ps: pinState(state, b, bst, level) }));
  const earnedN = states.filter((x) => x.ps.tier).length, waiting = states.filter((x) => x.ps.sealed).length;
  const near = closest(state, bst, level);
  const pinBtn = ({ b, ps }) => {
    const mode = ps.secretHidden ? "secret" : !ps.tier ? "locked" : ps.sealed && !ps.shown ? "sealed" : "earned";
    const tier = ps.secretHidden ? 1 : ps.sealed && !ps.shown ? ps.sealed : (ps.shown || 1);
    const label = ps.secretHidden ? "Secret pin, not yet earned" : `${b.name}${ps.tier ? (b.tiers ? `, ${tierName(b, ps.shown || ps.sealed).toLowerCase()}` : ", earned") : ", not yet earned"}${ps.sealed ? `, ${tierName(b, ps.sealed).toLowerCase()} sealed` : ""}`;
    return `<button type="button" class="pin ${mode}" data-pin="${b.id}" aria-label="${esc(label)}">${pinSVG(b, tier, mode)}<span>${ps.secretHidden ? "?" : esc(b.name)}</span>${ps.sealed && ps.shown ? `<i class="sealdot" title="A higher tier is sealed"></i>` : ""}</button>`;
  };
  const fams = Object.keys(FAMILIES).map((f) => {
    const list = states.filter((x) => x.b.fam === f);
    return `<div class="family"><h3>${esc(FAMILIES[f].name)} <small>${list.filter((x) => x.ps.tier).length} of ${list.length}</small></h3><p class="small muted">${esc(FAMILIES[f].blurb)}</p>
      <div class="cabinet">${list.map(pinBtn).join("")}</div></div>`;
  }).join("");
  const badges = `<section id="t-badges" class="tsec">
    <h2 class="sech">Badges</h2>
    <p class="small muted">${earnedN} of ${BADGES.length} pins${waiting ? ` · ${waiting} higher ${waiting === 1 ? "tier" : "tiers"} sealed until you level up` : ""}. Tap any pin.</p>
    ${near.length ? `<p class="kicker">Closest next</p><div class="nextup">${near.map(({ b, ps }) => `<button type="button" class="next" data-pin="${b.id}">${pinSVG(b, ps.next.tier, "locked")}<span><b>${esc(b.name)}${b.tiers ? ` · ${tierName(b, ps.next.tier).toLowerCase()}` : ""}</b>
      <small>${esc(ps.next.hint || `${ps.next.have} of ${ps.next.need} ${b.unit || ""}`.trim())}</small><span class="meter"><i style="width:${Math.round(clamp(ps.next.have / ps.next.need, 0, 1) * 100)}%"></i></span></span></button>`).join("")}</div>` : ""}
    ${fams}</section>`;

  // Leanings: what the model has learned, reasons, undecided.
  const dims = [["style", "Movements"], ["artist", "Artists"], ["place", "Places"], ["med", "Media"], ["era", "Eras"], ["light", "Light"], ["sat", "Color intensity"], ["warm", "Temperature"], ["busy", "Detail"], ["subject", "Subjects"]];
  const leanHTML = dims.map(([d, label]) => {
    const rows = model.leaning(d, 6, 2); if (!rows.length) return "";
    const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.weight)));
    return `<section class="dim"><h3>${label}</h3>${rows.map((r) => `<div class="row"><span class="n">${esc(r.value)}</span>${bar(r.weight, max)}<span class="c">${r.seen}</span></div>`).join("")}</section>`;
  }).join("");
  const whyTotal = Object.values(st.why).reduce((a, b) => a + b, 0);
  const whyHTML = whyTotal ? `<section class="dim"><h3>Why you love what you love</h3>${Object.entries(st.why).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div class="row"><span class="n">${esc(k)}</span><span class="bar"><i class="pos" style="left:0;width:${Math.round((n / whyTotal) * 100)}%"></i></span><span class="c">${Math.round((n / whyTotal) * 100)}%</span></div>`).join("")}</section>` : "";
  const und = state.swipes.filter((x) => x.v === 0).slice(-6).reverse();
  const leanings = `<section id="t-leanings" class="tsec"><h2 class="sech">What you respond to</h2>
    ${leanHTML || `<p class="muted">Patterns appear after a couple of dozen decisions.</p>`}
    ${whyHTML}
    ${und.length ? `<section class="dim"><h3>Left you undecided</h3><ul class="plain">${und.map((x) => `<li><cite>${esc(x.a.title)}</cite>, ${esc(x.a.artist || "unknown maker")}</li>`).join("")}</ul></section>` : ""}</section>`;

  scroller.innerHTML = `<nav class="jump" aria-label="Taste sections">${[["t-portrait", "Portrait"], ["t-badges", "Badges"], ["t-leanings", "Leanings"]].map(([id, l], i) => `<a href="#${id}" data-jump="${id}" ${i === 0 ? 'aria-current="true"' : ""}>${l}</a>`).join("")}</nav>
    <div class="page">${portrait}${badges}${leanings}</div>`;
  scroller.scrollTop = keepScroll;

  $$("[data-jump]", scroller).forEach((a) => (a.onclick = (e) => { e.preventDefault(); jumpTo(a.dataset.jump); }));
  $$("[data-pin]", scroller).forEach((el) => (el.onclick = () => openPin(el.dataset.pin)));
  scroller.onscroll = spyTaste; spyTaste();
  $("#toneSel").onchange = (e) => { state.settings.tone = e.target.value; persist({ meta: true }); };
  $("#noteNow").onclick = async (e) => {
    const last = state.notes[state.notes.length - 1];
    const since = last ? state.swipes.filter((x) => x.t > last.t).length : Infinity;
    if (since < 5 && last && last.tone === state.settings.tone) { toast(`Judge ${5 - since} more ${5 - since === 1 ? "work" : "works"} first, or switch the tone for a new take.`); return; }
    e.currentTarget.disabled = true; e.currentTarget.textContent = "Writing…";
    await makeNote(null); renderTaste();
  };
}
function jumpTo(id) {
  const sc = $("#view-taste"), el = document.getElementById(id); if (!el) return;
  const nav = $(".jump", sc), off = nav ? nav.offsetHeight + 4 : 0;
  sc.scrollTo({ top: el.offsetTop - off, behavior: reduceMotion ? "auto" : "smooth" });
}
// Highlight the section you're reading.
function spyTaste() {
  const sc = $("#view-taste"), nav = $(".jump", sc); if (!nav) return;
  const y = sc.scrollTop + nav.offsetHeight + 40;
  let cur = "t-portrait";
  for (const id of ["t-portrait", "t-badges", "t-leanings"]) { const el = document.getElementById(id); if (el && el.offsetTop <= y) cur = id; }
  if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) cur = "t-leanings";
  $$("[data-jump]", nav).forEach((a) => (a.dataset.jump === cur ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
}
function openPin(id) {
  const b = badgeById[id]; if (!b) return;
  const bst = badgeStats(state, model), level = currentLevel(), ps = pinState(state, b, bst, level);
  if (ps.secretHidden) {
    openModal(`<div class="pinhead">${pinSVG(b, 1, "secret")}</div><h2>A secret pin</h2><p>Some pins only reveal themselves once you've earned them. Keep looking.</p><button class="btn primary" id="modalOk">Close</button>`);
    $("#modalOk").onclick = closeModal; return;
  }
  const mode = !ps.tier ? "locked" : ps.sealed && !ps.shown ? "sealed" : "earned";
  const tier = ps.sealed && !ps.shown ? ps.sealed : (ps.shown || (ps.next ? ps.next.tier : 1));
  const ladder = b.tiers ? `<ol class="ladder">${b.tiers.map((need, i) => { const t = i + 1, got = ps.tier >= t, sealedT = got && !(TIERS[t].level <= level);
    return `<li class="${got ? (sealedT ? "sealed" : "got") : ""}"><b>${TIERS[t].name}</b><span>${need} ${esc(b.unit || "")}</span><span>${got ? (sealedT ? `Sealed until ${LEVELS[TIERS[t].level].name}` : "Earned") : TIERS[t].level > 0 ? `Opens at ${LEVELS[TIERS[t].level].name}` : ""}</span></li>`; }).join("")}</ol>` : "";
  const prog = ps.next && ps.next.need ? `<p class="small">${esc(ps.next.hint || `${ps.next.have} of ${ps.next.need} ${b.unit || ""}`.trim())}</p><span class="meter"><i style="width:${Math.round(clamp(ps.next.have / ps.next.need, 0, 1) * 100)}%"></i></span>` : "";
  openModal(`<div class="pinhead">${pinSVG(b, tier, mode)}</div>
    <p class="kicker">${esc(FAMILIES[b.fam].name)}${ps.tier ? ` · earned ${relTime(state.badges[`pin:${b.id}:1`])}` : ""}</p>
    <h2>${esc(b.name)}</h2>
    <p>${esc(b.how)}</p>${ladder}${prog}
    <p class="walllabel">${esc(b.fact)}</p>
    <button class="btn primary" id="modalOk">Close</button>`);
  $("#modalOk").onclick = closeModal;
}

/* ---------- Kept ---------- */
let keptFilter = "all";
// Kept tiles load smaller images where the server can resize (IIIF and Commons).
function thumb(a) { return (a.image || "").replace("/full/843,/", "/full/400,/").replace("/full/!900,900/", "/full/!400,400/").replace(/\?width=900$/, "?width=400") || null; }
function renderKept() {
  const all = state.swipes.filter((s) => s.v > 0).slice().reverse();
  const list = keptFilter === "loved" ? all.filter((s) => s.v === 2) : keptFilter === "chicago" ? all.filter((s) => s.a.src === "aic" && s.a.onView) : all;
  $("#view-kept").innerHTML = `<div class="page">
    <h1 class="display small">Kept</h1>
    <div class="filters" role="group" aria-label="Filter">
      ${[["all", `All (${all.length})`], ["loved", `Loved (${all.filter((s) => s.v === 2).length})`], ["chicago", "On view in Chicago"]].map(([k, l]) => `<button class="chip" aria-pressed="${keptFilter === k}" data-f="${k}">${l}</button>`).join("")}
    </div>
    ${keptFilter === "chicago" ? `<p class="muted small">On view when you saw it. Galleries change, so check the museum site before a visit.</p>` : ""}
    ${list.length ? `<ul class="grid">${list.map((s, i) => `<li class="tile-wrap"><button class="tile" data-i="${i}"><img loading="lazy" src="${esc(thumb(s.a))}" alt=""><span class="t"><cite>${esc(s.a.title)}</cite></span><span class="a">${esc(s.a.artist || "Unknown maker")}</span></button>${loveBtn(s)}</li>`).join("")}</ul>`
      : `<p class="muted">Nothing here yet. Swipe right on a work to keep it.</p>`}
  </div>`;
  $$(".filters .chip").forEach((b) => (b.onclick = () => { keptFilter = b.dataset.f; renderKept(); }));
  $$(".tile").forEach((b) => (b.onclick = () => openSheet(list[+b.dataset.i].a)));
  bindLoveBtns($("#view-kept"), () => renderKept());
}

/* ---------- Loved (favorites) from Kept and the wall text ---------- */
const loveBtn = (s) => `<button type="button" class="lovebtn" data-uid="${esc(s.uid)}" aria-pressed="${s.v === 2}" aria-label="${s.v === 2 ? "Loved. Tap to keep it as a regular keep" : "Mark as loved"}: ${esc(s.a.title)}">
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.6l-5.2 2.8 1-5.9L3.5 9.4l5.9-.8z"/></svg></button>`;
// Changing your mind later is a real signal: the record is updated, timestamped, synced, and the model retrains.
function setLoved(uid, on) {
  const rec = state.swipes.find((s) => s.uid === uid);
  if (!rec || rec.v <= 0) return null;
  rec.v = on ? 2 : 1; rec.t = Date.now();
  state.sync.dirty.push(uid);
  model.fit(state.swipes);
  persist();
  afterDecision(rec);
  say(on ? `Loved: ${rec.a.title}` : `Kept, no longer loved: ${rec.a.title}`);
  return rec;
}
function bindLoveBtns(root, rerender) {
  $$(".lovebtn", root).forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    const rec = setLoved(b.dataset.uid, b.getAttribute("aria-pressed") !== "true");
    if (rec) rerender(rec);
  }));
}

/* ---------- Settings ---------- */
function renderSettings() {
  const sync = state.sync, connected = !!api.apiBase();
  const srcRows = Object.entries(MUSEUMS).map(([k, m]) => {
    const h = srcHealth[k], benched = !isAvailable(k), on = state.settings.sources[k] !== false;
    const status = !on ? "Off" : benched ? "Resting after errors" : h.last ? `Last error: ${h.last}` : h.ok ? "Working" : "Not used yet";
    return `<label class="toggle"><input type="checkbox" data-src="${k}" ${on ? "checked" : ""}><span><b>${esc(m.name)}</b><small>${esc(status)}${m.note ? `. ${esc(m.note)}` : ""}</small></span></label>`;
  }).join("");
  const salon = readSalon();
  $("#view-settings").innerHTML = `<div class="page settings">
    <h1 class="display small">Settings</h1>
    <section><h2>Discovery</h2>
      <label class="range" for="explore">How adventurous should the picks be?</label>
      <input id="explore" type="range" min="0.1" max="0.9" step="0.05" value="${state.settings.explore}">
      <div class="ends"><span>Mostly my taste</span><span>Show me anything</span></div>
    </section>
    <section><h2>Museums</h2>${srcRows}<p class="muted small">Only public-domain works with open images are shown. A museum that keeps failing rests for ten minutes, then comes back on its own.</p></section>
    <section><h2>Sync and backup</h2>
      ${connected ? (sync.key
        ? `<p>Sync is on. ${sync.lastSync ? `Last synced ${relTime(sync.lastSync)}.` : "Not synced yet."}</p>
           <div class="btns"><button class="btn" id="syncNow">Sync now</button><button class="btn" id="pairLink">Link another device</button></div>
           <div id="pairBox" hidden><p class="small">Open this link on your other device. Anyone with it can see and change your collection, so send it only to yourself.</p><textarea id="pairText" readonly></textarea></div>`
        : `<p>Keep your collection in step across your phone and computer.</p><button class="btn primary" id="syncOn">Turn on sync</button>`)
        : `<p class="muted">Sync isn't connected yet. Your collection is saved on this device.</p>`}
      <div class="btns"><button class="btn" id="bkSave">Save backup file</button><button class="btn" id="bkRestore">Restore from backup</button></div>
      <div id="restoreBox" hidden><p class="small">Choose a Picture Plane or Salon Swipe backup file, or paste a backup code. It merges with what's here.</p>
        <input type="file" id="bkFile" accept=".json,application/json,text/plain"><textarea id="bkText" placeholder="Paste a backup code"></textarea><button class="btn" id="bkGo">Restore</button></div>
      ${salon.count ? `<div class="btns"><button class="btn" id="salonImport">Bring over ${salon.count} decisions from Salon Swipe</button></div>` : ""}
    </section>
    <section><h2>About</h2>
      <p>${esc(APP.name)} ${esc(APP.version)}. Images and data come from the open-access programs of the Art Institute of Chicago, The Metropolitan Museum of Art, the National Gallery of Art, the Cleveland Museum of Art, the Victoria and Albert Museum and SMK (National Gallery of Denmark), and from Wikidata and Wikimedia Commons. ${esc(APP.name)} is independent and not affiliated with or endorsed by any museum.</p>
      <p><a href="./privacy.html">Privacy</a></p>
      <details><summary>Diagnostics</summary><pre class="diag">${esc(JSON.stringify({ version: APP.version, swipes: state.swipes.length, later: state.later.length, pool: deck.pool.length, queue: deck.queue.length, api: api.apiBase(), sources: srcHealth, saveFailed: saveFailed() }, null, 2))}</pre></details>
    </section>
    <section class="danger"><h2>Start over</h2><p class="small">Erases your decisions on this device${sync.key ? " and turns off sync here. Your synced copy stays on the server until you delete it below" : ""}.</p>
      <div class="btns"><button class="btn warn" id="resetAsk">Erase this device</button>${sync.key ? `<button class="btn warn" id="delServer">Delete my synced data</button>` : ""}</div><div id="confirmBox"></div></section>
  </div>`;
  $("#explore").oninput = (e) => { state.settings.explore = +e.target.value; persist({ meta: true }); };
  $$("[data-src]").forEach((c) => (c.onchange = () => { state.settings.sources[c.dataset.src] = c.checked; persist({ meta: true }); renderSettings(); }));
  const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  on("#syncNow", () => runSync(true));
  on("#syncOn", async () => { state.sync.key = api.newKey(); state.sync.dirty = state.swipes.map((s) => s.uid); touchMeta(); save(state); await runSync(true); renderSettings(); });
  on("#pairLink", () => { const box = $("#pairBox"); box.hidden = false; const t = $("#pairText"); t.value = `${location.origin}${location.pathname}#pair=${state.sync.key}`; t.focus(); t.select(); });
  on("#bkSave", saveBackupFile);
  on("#bkRestore", () => ($("#restoreBox").hidden = false));
  const fileIn = $("#bkFile"); if (fileIn) fileIn.onchange = (e) => e.target.files[0] && e.target.files[0].text().then((t) => ($("#bkText").value = t));
  on("#bkGo", () => { try { restoreFrom($("#bkText").value); } catch (e) { toast("That isn't a Picture Plane or Salon Swipe backup. Check that the whole file or code is there."); } });
  on("#salonImport", () => importSalon());
  on("#resetAsk", () => confirmBox("Erase every decision on this device?", "Erase", () => { const keep = state.settings; Object.assign(state, load({ getItem: () => null })); state.settings = keep; save(state); location.reload(); }));
  on("#delServer", () => confirmBox("Delete your synced collection from the server? Other linked devices keep their own copies.", "Delete", async () => {
    try { await api.deleteAccount(state); state.sync = { key: null, cursor: 0, lastSync: 0, dirty: [] }; save(state); toast("Deleted from the server. Sync is off."); renderSettings(); }
    catch (e) { toast(`Couldn't delete: ${e.message}`); }
  }));
}
function confirmBox(q, verb, fn) {
  $("#confirmBox").innerHTML = `<p>${esc(q)}</p><div class="btns"><button class="btn warn" id="cYes">${esc(verb)}</button><button class="btn" id="cNo">Cancel</button></div>`;
  $("#cYes").onclick = fn; $("#cNo").onclick = () => ($("#confirmBox").innerHTML = "");
}

/* ---------- backup, restore, import ---------- */
function backupName() {
  const d = new Date(), z = (x) => String(x).padStart(2, "0");
  return `picture-plane-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}-${state.swipes.length}decisions.json`;
}
async function saveBackupFile() {
  const data = JSON.stringify(backupPayload(state));
  const file = new File([data], backupName(), { type: "application/json" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] }) && matchMedia("(pointer: coarse)").matches) await navigator.share({ files: [file], title: "Picture Plane backup" });
    else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
    state.lastBackup = Date.now(); state.backupCount = state.swipes.length; save(state); $("#nudge").hidden = true;
    toast("Backup saved.");
  } catch (e) { if (!e || e.name !== "AbortError") toast("Couldn't save the file. Try again, or turn on sync."); }
}
function absorb(d) {
  const added = mergeSwipes(state, d.swipes || []);
  for (const l of d.later || []) if (l && l.a && !state.seen[l.a.uid] && !state.later.some((x) => x.a.uid === l.a.uid)) state.later.push({ ...l, due: Math.min(l.due || 0, state.swipes.length + 5) });
  if (Number.isFinite(d.seedIdx)) state.seedIdx = Math.max(state.seedIdx, d.seedIdx);
  if (Array.isArray(d.notes)) { const ids = new Set(state.notes.map((n) => n.id)); state.notes = state.notes.concat(d.notes.filter((n) => n && !ids.has(n.id))); }
  if (d.badges) state.badges = { ...d.badges, ...state.badges };
  state.sync.dirty.push(...(d.swipes || []).map((s) => s.uid));
  model.fit(state.swipes); deck.rebuildKeys();
  deck.queue = deck.queue.filter((a) => !state.seen[a.uid]); deck.pool = deck.pool.filter((a) => !state.seen[a.uid]);
  state.level = levelFor(stats(state, model)).level;
  persist({ meta: true });
  return added;
}
function restoreFrom(text) {
  const d = parseBackup(text);
  const added = absorb(d);
  state.backupCount = state.swipes.length; save(state);
  toast(`Restored. ${added} new decisions merged; ${state.swipes.length} in total.`);
  renderSettings(); renderLevelChip();
}
function readSalon() {
  let best = null;
  for (const k of ["salon-swipe-v1", "salon-swipe-beta"]) {
    try { const d = JSON.parse(localStorage.getItem(k) || "null"); if (d && Array.isArray(d.swipes) && (!best || d.swipes.length > best.swipes.length)) best = d; } catch (e) {}
  }
  if (!best) return { count: 0 };
  const conv = fromSalonSwipe(best);
  const fresh = conv.swipes.filter((s) => !state.seen[s.uid]);
  return { count: fresh.length, data: conv };
}
function importSalon() {
  const s = readSalon(); if (!s.count) return toast("Nothing new to bring over.");
  const added = absorb({ swipes: s.data.swipes, later: s.data.later });
  state.imported.salon = Date.now(); save(state);
  toast(`Brought over ${added} decisions from Salon Swipe.`);
  renderLevelChip(); if (currentView === "settings") renderSettings();
}
$("#nudgeGo").onclick = () => { $("#nudge").hidden = true; show("settings"); };

/* ---------- first run ---------- */
function onboarding() {
  if (state.onboarded) return;
  const salon = readSalon();
  openModal(`<h2 class="display">${esc(APP.name)}</h2>
    <p class="lede">Look at art. Decide quickly. ${esc(APP.name)} learns what you respond to and shows you more of it, plus a few things to stretch you.</p>
    <ul class="gestures">
      <li><b>Right</b> to keep</li><li><b>Left</b> to pass</li><li><b>Up</b> to love</li><li><b>Down</b> to decide later</li><li><b>Tap</b> for the wall text</li>
    </ul>
    <p class="muted small">We start with an opening hang: one work from each of ${OPENING.length} traditions, so your taste has room to show itself.</p>
    ${salon.count ? `<button class="btn" id="obImport">Bring over ${salon.count} decisions from Salon Swipe</button>` : ""}
    <button class="btn primary" id="obGo">Start looking</button>`);
  const imp = $("#obImport"); if (imp) imp.onclick = () => { importSalon(); imp.remove(); };
  $("#obGo").onclick = () => { state.onboarded = true; save(state); closeModal(); };
}

/* ---------- pairing from a link ---------- */
function handlePairLink() {
  const m = location.hash.match(/^#pair=([A-Za-z0-9_-]{20,64})$/);
  if (!m) return false;
  window.history.replaceState(null, "", location.pathname);
  if (state.sync.key === m[1]) return false;
  openModal(`<h2>Link this device?</h2><p>This device will join the collection on your other device. Decisions made here so far are merged in, not lost.</p>
    <button class="btn primary" id="pairYes">Link this device</button><button class="btn" id="pairNo">Cancel</button>`);
  $("#pairYes").onclick = async () => { state.sync.key = m[1]; state.sync.cursor = 0; state.sync.dirty = state.swipes.map((s) => s.uid); state.onboarded = true; save(state); closeModal(); await runSync(true); renderLevelChip(); };
  $("#pairNo").onclick = closeModal;
  return true;
}

/* ---------- boot ---------- */
(async function boot() {
  document.title = APP.name;
  renderLevelChip();
  show("look");
  if (!handlePairLink()) onboarding();
  if (state.onboarded && $("#modal").hidden) openCabinet(); else if (!state.badges["pin:_init"]) { award(state, badgeStats(state, model), currentLevel()); state.badges["pin:_init"] = Date.now(); persist({ meta: true }); }
  await api.configure();
  if (state.sync.key) runSync();
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) navigator.serviceWorker.register("./sw.js").catch(() => {});
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  // Every change is saved the moment it happens, so leaving the page only needs to kick off a sync.
  // (Saving again here could overwrite newer data written by another tab.)
  addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && state.sync.key) runSync(); });
  // Another tab changed your collection: reload so this tab never writes over it with stale data.
  addEventListener("storage", (e) => { if (e.key === STORE_KEY && e.newValue) location.reload(); });
})();
