// Slideshow: your Kept works, full screen, looping until you stop it. Built for a TV across the room:
// large images, an optional label beside the art, no clutter, and the screen kept awake.
// Controls appear when you move the mouse or tap, then fade: previous, pause, next, label, close.
// Keys: ← → to step, Space to pause, I for the label, Esc to close.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const big = (a) => a.imageLarge || a.image;

export const SHOW_SECONDS = [10, 20, 30, 60, 120, 300, 600];
export const SHOW_DEFAULTS = { sec: 30, order: "shuffle", info: true };
export const secLabel = (s) => (s < 60 ? `${s} seconds` : s === 60 ? "1 minute" : `${s / 60} minutes`);

const ICON = {
  prev: '<path d="M15 5 8 12l7 7"/>', next: '<path d="m9 5 7 7-7 7"/>', close: '<path d="M6 6l12 12M18 6 6 18"/>',
  pause: '<path d="M9 5v14M15 5v14"/>', play: '<path d="M8 5v14l11-7z" fill="currentColor"/>', info: '<path d="M5 4h14v16H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

export function startShow(works, opts = {}, hooks = {}) {
  const o = { ...SHOW_DEFAULTS, ...opts };
  const base = works.filter((a) => a && big(a));
  if (!base.length) return null;
  const order = () => (o.order === "shuffle" ? shuffle(base.slice()) : base.slice());
  let list = order(), i = 0, timer = null, uiT = null, paused = false, front = 0, lock = null, wentFull = false, closed = false, token = 0, fails = 0;

  const el = document.createElement("div");
  el.className = `show${o.info ? "" : " noinfo"}`;
  el.setAttribute("role", "dialog"); el.setAttribute("aria-label", "Slideshow");
  el.innerHTML = `<div class="show-stage"><img class="show-img" alt=""><img class="show-img" alt=""></div>
    <aside class="show-info" aria-live="polite"></aside>
    <div class="show-bar" role="toolbar" aria-label="Slideshow controls">
      <button type="button" data-k="prev" aria-label="Previous work">${svg("prev")}</button>
      <button type="button" data-k="pause" aria-label="Pause">${svg("pause")}</button>
      <button type="button" data-k="next" aria-label="Next work">${svg("next")}</button>
      <span class="show-count"></span>
      <button type="button" data-k="info" aria-pressed="${o.info}" aria-label="Show the label">${svg("info")}</button>
      <button type="button" data-k="close" aria-label="Close slideshow">${svg("close")}</button>
    </div>`;
  document.body.appendChild(el);
  const imgs = [...el.querySelectorAll(".show-img")], info = el.querySelector(".show-info"), count = el.querySelector(".show-count");

  const label = (a) => `<p class="who">${esc(a.artist || "Unknown maker")}</p>${a.artistBio ? `<p class="bio">${esc(a.artistBio)}</p>` : ""}
    <p class="what"><cite>${esc(a.title)}</cite>${a.date ? `, ${esc(a.date)}` : ""}</p>
    ${a.medium ? `<p class="med">${esc(a.medium)}</p>` : ""}<p class="src">${esc(a.museum || "")}</p>`;

  // Load the next image fully before showing it, then cross-fade. A work whose image won't load is skipped.
  function go(n) {
    clearTimeout(timer);
    if (n >= list.length) { const last = list[list.length - 1]; list = order(); if (list.length > 1 && list[0] === last) list.push(list.shift()); n = 0; }
    if (n < 0) n = list.length - 1;
    i = n; const a = list[i], my = ++token, im = new Image();
    im.onload = () => {
      if (my !== token || closed) return;
      fails = 0; const next = imgs[1 - front];
      next.src = im.src; next.alt = `${a.title}, ${a.artist || "unknown maker"}`;
      next.classList.add("front"); imgs[front].classList.remove("front"); front = 1 - front;
      info.innerHTML = label(a); count.textContent = `${i + 1} of ${list.length}`;
      hang(im.naturalWidth / im.naturalHeight);
      el.dataset.uid = a.uid;
      const pre = list[(i + 1) % list.length]; if (pre) new Image().src = big(pre);   // ready before it's needed
      schedule();
    };
    im.onerror = () => { if (my !== token || closed) return; if (++fails >= list.length) return close(); go(i + 1); };
    im.src = big(a);
  }
  // Hang the label beside the work like a museum label: the art sits against the label column, its bottom edge
  // lines up with the work's, and the pair is centred on the screen. Portrait screens stack instead (CSS).
  let ar = 1;
  function hang(r) {
    if (r) ar = r;
    const stage = el.querySelector(".show-stage"), side = o.info && getComputedStyle(el).gridTemplateColumns.split(" ").length > 1;
    el.classList.toggle("beside", side);
    if (!side) { el.style.removeProperty("--shift"); info.style.removeProperty("padding-bottom"); return; }
    const W = stage.clientWidth, H = stage.clientHeight, w = Math.min(W, H * ar), h = Math.min(H, W / ar);
    const left = stage.offsetLeft + (W - w), right = el.clientWidth - (info.offsetLeft + info.offsetWidth) + parseFloat(getComputedStyle(info).paddingRight);
    el.style.setProperty("--shift", `${Math.max(0, (left - right) / 2)}px`);
    info.style.paddingBottom = `${el.clientHeight - (stage.offsetTop + H) + (H - h) / 2}px`;
  }
  const onResize = () => hang();
  addEventListener("resize", onResize);
  function schedule() { clearTimeout(timer); if (!paused) timer = setTimeout(() => go(i + 1), o.sec * 1000); }
  function setPaused(p) {
    paused = p; const b = el.querySelector('[data-k="pause"]');
    b.innerHTML = svg(p ? "play" : "pause"); b.setAttribute("aria-label", p ? "Play" : "Pause");
    el.classList.toggle("paused", p); p ? clearTimeout(timer) : schedule();
  }
  function setInfo(on) {
    o.info = on; el.classList.toggle("noinfo", !on); hang();
    el.querySelector('[data-k="info"]').setAttribute("aria-pressed", on);
    hooks.onChange && hooks.onChange({ info: on });
  }
  function ui() { el.classList.add("ui"); clearTimeout(uiT); uiT = setTimeout(() => el.classList.remove("ui"), 3000); }

  const act = { prev: () => go(i - 1), next: () => go(i + 1), pause: () => setPaused(!paused), info: () => setInfo(!o.info), close: () => close() };
  el.querySelectorAll(".show-bar button").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); act[b.dataset.k](); ui(); }));
  el.addEventListener("pointermove", ui); el.addEventListener("pointerdown", ui);
  const keys = (e) => {
    const k = { ArrowRight: act.next, ArrowLeft: act.prev, " ": act.pause, i: act.info, I: act.info, Escape: act.close }[e.key];
    e.stopImmediatePropagation();   // the deck behind never sees these
    if (k) { e.preventDefault(); k(); if (e.key !== "Escape") ui(); }
  };
  addEventListener("keydown", keys, true);

  // Keep the screen awake for as long as the show runs (re-taken if the tab was hidden).
  const wake = async () => { try { if (navigator.wakeLock && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen"); } catch (e) { /* not supported */ } };
  const vis = () => { if (document.visibilityState === "visible" && !closed) wake(); };
  document.addEventListener("visibilitychange", vis); wake();
  // Full screen when the browser allows it (must start from the tap that opened the show). Leaving full screen ends the show.
  const fs = () => { if (wentFull && !document.fullscreenElement) close(); };
  document.addEventListener("fullscreenchange", fs);
  try { const r = el.requestFullscreen && el.requestFullscreen({ navigationUI: "hide" }); if (r && r.then) r.then(() => (wentFull = true)).catch(() => {}); } catch (e) { /* stays a full-window overlay */ }

  function close() {
    if (closed) return; closed = true;
    clearTimeout(timer); clearTimeout(uiT);
    removeEventListener("keydown", keys, true); removeEventListener("resize", onResize);
    document.removeEventListener("visibilitychange", vis); document.removeEventListener("fullscreenchange", fs);
    try { lock && lock.release(); } catch (e) {}
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    el.remove(); hooks.onClose && hooks.onClose();
  }

  go(0); ui();
  return { close, next: act.next, prev: act.prev, setSec: (s) => { o.sec = s; schedule(); }, get index() { return i; }, get uid() { return el.dataset.uid; }, el };
}
