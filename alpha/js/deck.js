// The deck decides what you see next. Three stages:
//   1. Opening hang: one work per tradition in OPENING, in order.
//   2. A pool of fetched candidates from all available museums.
//   3. A picker that mixes three intents: works it predicts you'll like ("match"),
//      works it's least sure about ("unsure", the fastest way to learn), and pure discovery ("explore").
// Guardrails: never repeat a work or a copy of it, keep an artist at least ARTIST_GAP cards apart,
// and bring deferred cards back LATER_MIN–LATER_MAX decisions on.

import { OPENING, BROWSE_TERMS } from "./curation.js";
import { features } from "./model.js";
import { workKey, norm, shuffle } from "./util.js";
import { matches as questMatches, queries as questQueries, digestCan, digestMatches } from "./quests.js";
import { choose, retrieve, planQuery } from "./recommend.js";

export const ARTIST_GAP = 6, LATER_MIN = 15, LATER_MAX = 25, MAX_DEFERS = 3, POOL_TARGET = 24;
const SRC_WEIGHT = { aic: 0.2, nga: 0.2, met: 0.12, cma: 0.12, wd: 0.14, smk: 0.12, vam: 0.1 };

export class Deck {   // options: { state, model, search, isAvailable, sampleLocal? }
  constructor({ state, model, search, isAvailable, sampleLocal = null, catalog = null, rand = Math.random }) {
    Object.assign(this, { state, model, search, isAvailable, sampleLocal, catalog, rand });
    this.queue = []; this.pool = []; this.seedBuf = []; this.loading = null;
    this.seedCursor = state.seedIdx || 0;   // how far we've fetched; state.seedIdx is how far you've seen
    this.rebuildKeys();
  }

  rebuildKeys() { this.seenKeys = new Set(this.state.swipes.map((s) => workKey(s.a)).filter(Boolean)); }

  /* ---------- exclusion ---------- */
  inPlay(a) {
    const k = workKey(a);
    const hit = (x) => x.uid === a.uid || (k && workKey(x) === k);
    return this.queue.some(hit) || this.pool.some(hit) || this.seedBuf.some(hit) || (this.state.later || []).some((l) => hit(l.a));
  }
  usable(a) {
    if (!a || !a.image) return false;
    if (this.state.seen[a.uid]) return false;
    const k = workKey(a);
    if (k && this.seenKeys.has(k)) return false;
    return !this.inPlay(a);
  }
  dedupe(list) {
    const uids = new Set(), keys = new Set(), out = [];
    for (const a of list) {
      if (!this.usable(a) || uids.has(a.uid)) continue;
      const k = workKey(a);
      if (k && keys.has(k)) continue;
      uids.add(a.uid); if (k) keys.add(k); out.push(a);
    }
    return out;
  }
  markSeen(a) {
    this.state.seen[a.uid] = 1;
    const k = workKey(a); if (k) this.seenKeys.add(k);
  }

  /* ---------- sources ---------- */
  sources() {
    const on = this.state.settings.sources || {};
    const q = this.quest();   // a quest for one museum (Museum Day) uses only that museum, while it's reachable
    if (q && q.crit.src && this.isAvailable(q.crit.src)) return [q.crit.src];
    return Object.keys(SRC_WEIGHT).filter((s) => on[s] !== false && this.isAvailable(s));
  }
  pickSource() {
    const av = this.sources(); if (!av.length) return null;
    const tot = av.reduce((t, s) => t + SRC_WEIGHT[s], 0);
    let r = this.rand() * tot;
    for (const s of av) { r -= SRC_WEIGHT[s]; if (r <= 0) return s; }
    return av[av.length - 1];
  }
  favourites() {
    const top = (dim, k) => this.model.leaning(dim, 12, 2).filter((x) => x.weight > 0.15).slice(0, k).map((x) => x.value);
    return [...top("style", 4), ...top("artist", 3), ...top("subject", 3), ...top("place", 2)];
  }
  plan() {
    const src = this.pickSource(); if (!src) return null;
    const q = planQuery(this.model, { explore: this.state.settings.explore, rand: this.rand });
    if (q && q.q) return { src, q: q.q, browse: false, why: q.why };
    if (src === "aic") return { src, q: "", browse: true, why: "browse" };
    return { src, q: BROWSE_TERMS[Math.floor(this.rand() * BROWSE_TERMS.length)], browse: true, why: "browse" };
  }

  async fetchSeed(seed) {
    for (const src of seed.src) {
      if (!this.sources().includes(src)) continue;
      try {
        const got = this.dedupe(await this.search(src, seed.q, { limit: 12 }));
        const pick = shuffle(got.slice(0, 6), this.rand)[0];
        if (pick) { pick.movement = pick.movement || seed.label; pick._seed = seed; return pick; }
      } catch (e) { /* try the next museum */ }
    }
    return null;
  }

  async refill() {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      this.seedCursor = Math.max(this.seedCursor, this.state.seedIdx || 0);
      const onDay = this.focused();   // the opening hang waits during a quest
      if (!onDay && this.seedCursor < OPENING.length) {
        const seeds = OPENING.slice(this.seedCursor, this.seedCursor + 3);
        this.seedCursor += seeds.length;
        const got = await Promise.all(seeds.map((s) => this.fetchSeed(s)));
        this.seedBuf.push(...this.dedupe(got.filter(Boolean)));
      }
      const quest = this.quest();
      if (quest && Object.keys(quest.crit).some((k) => k !== "src")) {
        // A quest: look in the on-device collections and ask each museum, keep only works that count.
        const fits = (a) => questMatches(quest, a);
        let found = 0;
        // On-device works first, fetched exactly from the digest, so a quest we started can always be filled.
        const local = this.sources().filter((s) => s === "nga" || s === "cma");
        if (this.catalog && local.length && digestCan(quest.crit)) {
          try {
            const d = await this.catalog.loadDigest();
            if (!this._qc || this._qc.id !== quest.id) this._qc = { id: quest.id, list: shuffle(digestMatches(d, quest, local), this.rand), at: 0 };
            const take = this._qc.list.slice(this._qc.at, this._qc.at + 60); this._qc.at += take.length;
            const by = {}; for (const [src, i] of take) (by[src] ||= []).push(i);
            const recs = (await Promise.all(Object.entries(by).map(([src, pos]) => this.catalog.loadStaticAt(src, pos)))).flat();
            const fresh = this.dedupe(recs.filter(fits));
            const best = this.model.trained ? retrieve(fresh, this.model, { k: 14, rand: this.rand }) : fresh.slice(0, 14);
            this.pool.push(...best); found += best.length;
          } catch (e) { /* collection unreachable; fall through to live museums */ }
        }
        for (const src of shuffle(this.sources().filter((s) => s !== "nga" && s !== "cma"), this.rand)) {
          if (this.pool.length >= 16) break;
          const qs = questQueries(quest.crit, src), term = qs.length ? qs[Math.floor(this.rand() * qs.length)] : (src === "aic" ? "" : BROWSE_TERMS[Math.floor(this.rand() * BROWSE_TERMS.length)]);
          try { const got = this.dedupe((await this.search(src, term, { limit: 24, browse: !qs.length })).filter(fits)); this.pool.push(...got); found += got.length; }
          catch (e) { /* next museum */ }
        }
        this.questFound = found;
        return;
      }
      // Score a slice of the on-device collections and keep the few worth showing (recommend.js retrieve).
      if (this.sampleLocal && this.model.trained) {
        const local = this.sources().filter((s) => s === "nga" || s === "cma");
        if (local.length) {
          const src = local[Math.floor(this.rand() * local.length)];
          try { const recs = this.dedupe(await this.sampleLocal(src, { shards: 2 })); this.pool.push(...retrieve(recs, this.model, { k: 8, rand: this.rand })); } catch (e) { /* collection unreachable */ }
        }
      }
      let tries = 0;
      while (this.pool.length < POOL_TARGET && tries++ < 3) {
        const pl = this.plan(); if (!pl) break;
        try {
          const got = await this.search(pl.src, pl.q, { limit: pl.src === "met" ? 10 : 24, browse: pl.browse });
          this.pool.push(...this.dedupe(got));
        } catch (e) { /* source health is tracked in sources.js */ }
      }
    })().finally(() => { this.loading = null; });
    return this.loading;
  }

  /* ---------- picking ---------- */
  recentArtists() {
    const hist = this.state.swipes.slice(-(ARTIST_GAP - 1)).map((s) => norm(s.a && s.a.artist));
    return hist.concat(this.queue.map((a) => norm(a.artist))).slice(-(ARTIST_GAP - 1)).filter(Boolean);
  }
  pickFromPool() {
    if (!this.pool.length) return null;
    const recent = new Set(this.recentArtists());
    let cands = this.pool.filter((a) => !a.artist || !recent.has(norm(a.artist)));
    if (!cands.length) cands = this.pool;
    const shown = this.state.swipes.slice(-6).map((s) => s.a).concat(this.queue);
    const res = choose(cands, { model: this.model, explore: this.state.settings.explore, rand: this.rand, recent: shown });
    const pick = res.pick;
    this.pool.splice(this.pool.indexOf(pick), 1);
    pick._why = res.why;
    return pick;
  }
  topUp(n = 3) {
    while (this.queue.length < n) {
      const nxt = (this.focused() ? null : this.seedBuf.shift()) || this.pickFromPool();
      if (!nxt) break;
      this.queue.push(nxt);
    }
  }

  /* ---------- Later ---------- */
  releaseLater() {
    const done = this.state.swipes.length, later = this.state.later || [];
    // During a quest, works set aside for Later that don't count wait until it's over.
    const q = this.quest(), ok = (l) => l.due <= done && (!q || questMatches(q, l.a));
    const due = later.filter(ok);
    if (!due.length) return;
    this.state.later = later.filter((l) => !ok(l));
    this.queue.splice(Math.min(1, this.queue.length), 0, ...due.map((l) => ({ ...l.a, _look: l.n + 1 })));
  }
  defer(card) {
    const n = card._look || 1;
    if (n >= MAX_DEFERS) return { undecided: true };
    const a = { ...card }; delete a._look; delete a._seed; delete a._why; delete a._p;
    const entry = { a, n, due: this.state.swipes.length + LATER_MIN + Math.floor(this.rand() * (LATER_MAX - LATER_MIN + 1)) };
    this.state.later = (this.state.later || []).concat(entry);
    this.queue.shift();
    return { entry };
  }

  /* ---------- New style ---------- */
  unseenSeeds() {
    const seenStyles = new Set(this.state.swipes.flatMap((s) => (s.f || []).filter((t) => t.startsWith("style|")).map((t) => norm(t.slice(6)))));
    return OPENING.filter((s) => !seenStyles.has(norm(s.label)));
  }
  async newStyle() {
    const opts = shuffle(this.unseenSeeds().slice(), this.rand);
    const list = opts.length ? opts : shuffle(OPENING.slice(), this.rand);
    for (const seed of list.slice(0, 4)) {
      const a = await this.fetchSeed(seed);
      if (a) {
        // Replace the work on screen without judging it; it goes back into the pool and may return later.
        a._why = "newstyle";
        const skipped = this.queue.shift();
        if (skipped && !skipped._look) { delete skipped._why; this.pool.push(skipped); }
        this.queue.unshift(a);
        return { seed, skipped };
      }
    }
    return null;
  }
}

Deck.prototype.quest = function () { const q = this.state.quest; return q && q.left > 0 ? q : null; };
Deck.prototype.focused = function () { return !!this.quest(); };
// Start a quest: drop queued works that don't count, so the next card does.
Deck.prototype.focusQuest = function () {
  const q = this.quest(); if (!q) return;
  const fits = (a) => questMatches(q, a);
  this.queue = this.queue.filter(fits); this.pool = this.pool.filter(fits);
};

// Ask the live museums for works that fit a quest, up to `need`. Used to check supply before a quest is offered or
// started, and the works found open the quest.
Deck.prototype.probe = async function (quest, need, { timeout = 9000 } = {}) {
  const fits = (a) => questMatches(quest, a), found = [], seen = new Set();
  const remote = this.sources().filter((s) => s !== "nga" && s !== "cma");
  const jobs = remote.flatMap((src) => questQueries(quest.crit, src).slice(0, 2).map((q) => [src, q]));
  const run = Promise.all(jobs.map(async ([src, q]) => {
    try { for (const a of await this.search(src, q, { limit: 24 })) if (fits(a) && this.usable(a) && !this.inPlay(a) && !seen.has(a.uid)) { seen.add(a.uid); found.push(a); } } catch (e) { /* skip */ }
  }));
  await Promise.race([run, new Promise((r) => setTimeout(r, timeout))]);
  return found.slice(0, Math.max(need, found.length));
};
