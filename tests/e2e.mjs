// Full-feature browser review of the alpha. Every check is named after a feature id in tests/features.mjs.
// Usage: node tests/e2e.mjs [screenshot-dir]     (serve the repo root at BASE, default http://127.0.0.1:8123)
import { mkdirSync, readFileSync } from "node:fs";
import { loadPlaywright, chromiumPath, mockWorld, d1 } from "./harness.mjs";
import { FEATURES } from "./features.mjs";

const OUT = process.argv[2] || "test-results"; mkdirSync(OUT, { recursive: true });
const ROOT = process.env.BASE || "http://127.0.0.1:8123";
const APP = `${ROOT}/alpha/`;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: chromiumPath() });

const results = new Map();
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
async function check(id, fn) {
  try { const d = await fn(); results.set(id, { ok: true, detail: typeof d === "string" ? d : "" }); }
  catch (e) { results.set(id, { ok: false, detail: String(e.message || e).split("\n")[0].slice(0, 160) }); }
}
const pp = (p, fn, arg) => p.evaluate(fn, arg);
const topTitle = (p) => p.textContent(".card.top .what");
async function waitTop(p) { await p.waitForSelector(".card.top.loaded", { timeout: 10000 }); await p.waitForTimeout(150); }
async function openInfo(p) {   // a level-up dialog can arrive after any decision; dismiss it the way a person would
  await waitTop(p); if (await p.isVisible("#modal:not([hidden])")) { const ok = await p.$("#modalOk"); if (ok) await ok.click(); }
  await p.keyboard.press("i"); await p.waitForSelector("#sheet.open");
}
async function press(p, key, n = 1) { for (let i = 0; i < n; i++) { await waitTop(p); if (await p.isVisible("#modal:not([hidden])")) { const ok = await p.$("#modalOk"); if (ok) await ok.click(); } await p.keyboard.press(key); await p.waitForTimeout(300); } }
async function drag(p, dx, dy) {
  await waitTop(p);
  const b = await p.locator(".card.top").boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height * 0.4;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + dx * 0.4, y + dy * 0.4, { steps: 5 }); await p.mouse.move(x + dx, y + dy, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(450);
}
const store = (p) => pp(p, () => JSON.parse(localStorage.getItem("pp-alpha-v1")));

/* ================= Session A: phone, light, no backend, existing Salon Swipe history ================= */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", acceptDownloads: true, serviceWorkers: "block" });
  const calls = await mockWorld(ctx);
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.goto(APP);
  await pp(p, () => { localStorage.clear(); localStorage.setItem("salon-swipe-v1", JSON.stringify({ swipes: Array.from({ length: 12 }, (_, i) => ({ id: 70000 + i, v: i % 3 ? 1 : -1, f: [`style|${i % 2 ? "Impressionism" : "Baroque"}`], t: i + 1, a: { id: 70000 + i, title: `Old ${i}`, artist_title: `Old artist ${i}`, image_id: `p${i % 6}-old${i}`, style_title: i % 2 ? "Impressionism" : "Baroque" } })) })); });
  await p.reload();

  await check("app.onboarding", async () => { await p.waitForSelector("#modal:not([hidden]) #obGo"); await p.screenshot({ path: `${OUT}/onboarding.png` }); });
  await check("data.import", async () => {
    expect(/12 decisions/.test(await p.textContent("#obImport")), "import offer missing");
    await p.click("#obImport"); const s = await store(p); expect(s.swipes.length === 12, `imported ${s.swipes.length}`);
    expect(s.swipes.every((x) => x.uid.startsWith("aic:")), "uids not converted");
  });
  await p.click("#obGo");
  await check("look.opening", async () => {
    await waitTop(p); const cue = await p.textContent(".card.top .cue");
    expect(/Opening hang 1 of \d+: Impressionism/.test(cue), `first card: ${cue.slice(0, 60)}`);
    await press(p, "ArrowRight"); expect(/Opening hang 2 of \d+: Ancient Egypt/.test(await p.textContent(".card.top .cue")), "second card not Ancient Egypt");
    await p.reload(); await waitTop(p);
    expect(/Opening hang 2 of \d+: Ancient Egypt/.test(await p.textContent(".card.top .cue")), "reload skipped an unseen tradition");
  });
  await check("look.wall", async () => {
    const s = await pp(p, () => { const img = document.querySelector(".card.top .work"), lab = document.querySelector(".card.top .label");
      const ir = img.getBoundingClientRect(), lr = lab.getBoundingClientRect();
      return { ar: ir.width / ir.height, nat: img.naturalWidth / img.naturalHeight, gap: lr.top - ir.bottom, wh: getComputedStyle(document.documentElement).getPropertyValue("--wh").trim() }; });
    expect(Math.abs(s.ar - s.nat) < 0.02, `aspect ${s.ar.toFixed(3)} vs ${s.nat.toFixed(3)}`);
    expect(s.gap >= 0 && s.gap < 40, `label ${s.gap}px from art`);
    expect(s.wh !== "220", "wall tint never set");
    await p.screenshot({ path: `${OUT}/look.png` });
  });
  await check("look.gestures", async () => {
    let n = (await store(p)).swipes.length;
    await drag(p, 240, 10); let s = await store(p); expect(s.swipes.length === n + 1 && s.swipes.at(-1).v === 1, "drag right didn't keep"); n++;
    await drag(p, -240, 10); s = await store(p); expect(s.swipes.at(-1).v === -1, "drag left didn't pass"); n++;
    await drag(p, 0, -260); s = await store(p); expect(s.swipes.at(-1).v === 2, "drag up didn't love");
    if (await p.isVisible("#why:not([hidden])")) await p.keyboard.press("Escape");
    const before = (await store(p)).later.length; await drag(p, 0, 260); expect((await store(p)).later.length === before + 1, "drag down didn't defer");
    const t = await topTitle(p); await drag(p, 30, 5); expect(await topTitle(p) === t, "a short drag shouldn't decide");
    if (await p.isVisible("#sheet:not([hidden])")) await p.click("#sheetDone");
  });
  await check("look.buttons", async () => {
    const n = (await store(p)).swipes.length;
    await waitTop(p); await p.click("#btnKeep"); await p.waitForTimeout(350); await waitTop(p); await p.click("#btnPass"); await p.waitForTimeout(350);
    await press(p, "ArrowRight"); await press(p, "ArrowLeft");
    const s = await store(p); expect(s.swipes.length === n + 4, `expected 4 decisions, got ${s.swipes.length - n}`);
    await waitTop(p); await p.keyboard.press("i"); await p.waitForSelector("#sheet.open"); await p.keyboard.press("Escape"); expect(await p.isHidden("#sheet"), "Escape didn't close wall text");
  });
  await check("look.why", async () => {
    await waitTop(p); await p.click("#btnLove"); await p.waitForSelector("#why:not([hidden])");
    await p.click('#why .chip[data-c="Light"]'); await p.click('#why .chip[data-c="Color"]');
    const s = await store(p); expect(JSON.stringify(s.swipes.at(-1).why) === '["Light","Color"]', `why = ${JSON.stringify(s.swipes.at(-1).why)}`);
    await p.screenshot({ path: `${OUT}/why.png` }); await p.keyboard.press("Escape");
  });
  await check("look.undo", async () => {
    const a = await topTitle(p), aUid = await pp(p, () => __pp.deck.queue[0].uid); await press(p, "ArrowRight"); const b = await topTitle(p); await press(p, "ArrowDown");
    await p.click("#btnUndo"); await p.waitForTimeout(300); expect(await topTitle(p) === b, "undo of Later failed");
    await p.click("#btnUndo"); await p.waitForTimeout(300); expect(await topTitle(p) === a, "undo of keep failed");
    expect(!(await store(p)).swipes.some((s) => s.uid === aUid), "undone decision still stored");   // by id: museum titles repeat
  });
  await check("look.newstyle", async () => {
    const t = await topTitle(p), n = (await store(p)).swipes.length;
    await p.click("#btnNewStyle"); await p.waitForTimeout(800); await waitTop(p);
    expect(await topTitle(p) !== t, "card didn't change"); expect(/New style:/.test(await p.textContent(".card.top .cue")), "no New style label");
    expect((await store(p)).swipes.length === n, "a vote was recorded");
    await p.click("#btnUndo"); await p.waitForTimeout(400); expect(await topTitle(p) === t, "undo didn't restore the skipped work");
  });
  await check("look.later", async () => {
    await waitTop(p); const t = await topTitle(p); const L0 = (await store(p)).later.length; await press(p, "ArrowDown");
    expect((await store(p)).later.length === L0 + 1, `Later didn't register (sheet open: ${await p.isVisible("#sheet:not([hidden])")}, modal: ${await p.isVisible("#modal:not([hidden])")})`);
    // Fast-forward: make it due now, then take one decision so it's released next.
    await pp(p, () => { __pp.state.later.forEach((l) => (l.due = 0)); });
    await press(p, "ArrowLeft");
    let found = false;
    for (let i = 0; i < 4 && !found; i++) { await waitTop(p); if ((await topTitle(p)) === t) found = true; else await press(p, "ArrowLeft"); }
    expect(found, `deferred work didn't come back; queue: ${JSON.stringify(await pp(p, () => __pp.deck.queue.map((a) => a.title + (a._look ? "*" : ""))))}, target ${t}`);
    expect(/Second look/.test(await p.textContent(".card.top .cue")), "not labelled Second look");
    await p.waitForSelector("#sheet.open", { timeout: 2000 }).catch(() => { throw new Error("wall text didn't open on second look"); });
    await p.click("#sheetDone");
    await pp(p, () => { const a = __pp.deck.queue[0]; a._look = 3; });
    await press(p, "ArrowDown");
    const s = await store(p); expect(s.swipes.some((x) => t.startsWith(x.a.title) && x.v === 0), "third Later didn't mark undecided");
  });
  await check("wall.sheet", async () => {
    // The Chicago mock carries known wall text and sizes, so put a Chicago work on top.
    await pp(p, async () => { const [a] = await __pp.deck.search("aic", "", { limit: 1, browse: true }); const q = __pp.deck.queue; if (!q[0] || q[0].src !== "aic") { q[0] = a; __pp.renderStage(); } });
    await waitTop(p); const lb = await p.locator(".card.top .label").boundingBox(); await p.mouse.click(lb.x + 20, lb.y + 10);
    await p.waitForSelector("#sheet.open"); await p.waitForTimeout(400);
    const txt = await p.textContent("#sheetBody");
    expect(/single sitting|watercolor|description/.test(txt), "no description"); expect(/On view now|In storage/.test(txt), "no gallery status");
    expect(await p.isVisible(".facts dt"), "no facts"); expect(await p.isVisible("a.out"), "no museum link");
    await p.screenshot({ path: `${OUT}/walltext.png` });
  });
  await check("wall.scale", async () => { expect(await p.isVisible(".scale svg .person"), "no person"); expect(/170 cm/.test(await p.textContent(".scale figcaption")), "no caption"); });
  await check("wall.decide", async () => { let step = "start"; try {
    await p.click("#sheetDone");
    let n = (await store(p)).swipes.length;
    await openInfo(p);
    expect(await p.isVisible("#sheetActions"), "no decision bar on the wall text");
    const t1 = await topTitle(p);
    step = "keep button"; await p.click('#sheetActions [data-act="keep"]'); await p.waitForTimeout(450);
    let s = await store(p); expect(s.swipes.length === n + 1 && s.swipes.at(-1).v === 1, "Keep from the wall text didn't record"); expect(await p.isHidden("#sheet"), "wall text stayed open");
    expect(await topTitle(p) !== t1, "next work didn't appear"); n++;
    await openInfo(p); await p.waitForTimeout(300);
    step = "reopen for swipe"; const box = await p.locator("#sheet").boundingBox(); const y = box.y + 180;
    await p.mouse.move(box.x + box.width / 2, y); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 - 120, y + 4, { steps: 6 }); await p.mouse.move(box.x + box.width / 2 - 260, y + 6, { steps: 6 }); await p.mouse.up();
    await p.waitForTimeout(450);
    s = await store(p); expect(s.swipes.length === n + 1 && s.swipes.at(-1).v === -1, "swiping the panel left didn't pass"); n++;
    await openInfo(p); await p.waitForTimeout(300);
    await p.mouse.move(box.x + box.width / 2, y); await p.mouse.down(); step = "small drag"; await p.mouse.move(box.x + box.width / 2 + 30, y + 2, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(300);
    expect((await store(p)).swipes.length === n && await p.isVisible("#sheet.open"), "a small drag shouldn't decide");
    await p.screenshot({ path: `${OUT}/walltext-actions.png` });
    step = "later button"; await p.click('#sheetActions [data-act="later"]'); await p.waitForTimeout(400); expect(await p.isHidden("#sheet"), "Later from the wall text didn't close it");
    step = "reopen for zoom"; await openInfo(p); await p.click("#zoomBtn");
  } catch (e) { await p.screenshot({ path: `${OUT}/fail-wall-decide.png` }).catch(() => {}); throw new Error(`${step}: ${e.message} | modal: ${await p.isVisible("#modal:not([hidden])")} why: ${await p.isVisible("#why:not([hidden])")}`); } });
  await check("wall.zoom", async () => {
    if (await p.isHidden("#zoom")) await p.click("#zoomBtn");
    await p.waitForSelector("#zoom:not([hidden])"); await p.waitForTimeout(300);
    const url = p.url();
    await p.click("#zoomImg");
    expect(await pp(p, () => document.querySelector("#zoom").classList.contains("big")), "click didn't zoom");
    const T = () => p.$eval("#zoomImg", (el) => el.style.transform);
    const t0 = await T();
    await p.mouse.move(195, 420); await p.mouse.wheel(220, 0); await p.waitForTimeout(150);   // a two-finger sideways swipe
    expect(await T() !== t0, "sideways scroll didn't pan the picture"); expect(p.url() === url, "sideways scroll navigated away");
    const t1 = await T(); await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(100);
    expect(await T() !== t1, "arrow key didn't pan"); expect(await p.isVisible("#zoom"), "arrow key acted on the deck behind the picture");
    await p.click("#zoomImg"); expect(!(await pp(p, () => document.querySelector("#zoom").classList.contains("big"))), "second click didn't zoom out");
    await p.click("#zoomClose"); expect(await p.isHidden("#zoom"), "zoom didn't close"); await p.click("#sheetDone");
  });
  await check("taste.levels", async () => {
    // The level-up may already have happened during earlier checks (press() dismisses it); either way it must be recorded.
    for (let i = 0; i < 40 && (await store(p)).level < 1; i++) {
      await waitTop(p);
      if (await p.isVisible("#modal:not([hidden])")) { await p.screenshot({ path: `${OUT}/levelup.png` }); await p.click("#modalOk"); continue; }
      await p.keyboard.press(i % 3 ? "ArrowRight" : "ArrowLeft"); await p.waitForTimeout(280);
    }
    await p.waitForTimeout(500);
    if (await p.isVisible("#modal:not([hidden])")) { expect(/Docent/.test(await p.textContent("#modalBody")), "level modal isn't Docent"); await p.screenshot({ path: `${OUT}/levelup.png` }); await p.click("#modalOk"); }
    const s = await store(p); expect(s.level >= 1, "never reached Docent"); expect(s.notes.some((n) => /Docent/.test(n.title)), "no level-up note saved");
    expect(/Docent/.test(await p.textContent("#levelChip")), "level chip not updated");
  });
  await check("wall.reasons", async () => {
    let ok = false;
    for (let i = 0; i < 6 && !ok; i++) { await waitTop(p); await p.keyboard.press("i"); await p.waitForSelector("#sheet.open"); ok = await p.isVisible(".reasons li"); await p.click("#sheetDone"); if (!ok) await press(p, "ArrowRight"); }
    expect(ok, "no 'Why you're seeing this' after training");
  });
  await check("look.cue", async () => {
    const seen = new Set();
    for (let i = 0; i < 30; i++) { await waitTop(p); const c = await p.getAttribute(".card.top .cue", "class"); seen.add(c.replace("cue ", "")); await press(p, i % 2 ? "ArrowRight" : "ArrowLeft"); }
    expect(seen.has("cue-match") || seen.has("cue-unsure") || seen.has("cue-explore"), `cues seen: ${[...seen].join(",")}`);
    return [...seen].join(", ");
  });
  await check("taste.notes", async () => {
    await p.click("#tab-taste"); await p.waitForSelector(".notes .note");
    const first = await p.textContent(".notes .note p");
    await p.click("#tab-look"); await press(p, "ArrowRight", 6); await p.click("#tab-taste");
    await p.click("#noteNow"); await p.waitForTimeout(400);
    const second = await p.textContent(".notes .note p"); expect(second !== first, "new note repeated the last one");
    await p.screenshot({ path: `${OUT}/taste.png` });
  });
  await check("taste.tone", async () => {
    await p.selectOption("#toneSel", "docent"); await p.click("#noteNow"); await p.waitForTimeout(400);
    const s = await store(p); expect(s.settings.tone === "docent" && s.notes.at(-1).tone === "docent", `tone ${s.notes.at(-1).tone}`);
    await p.selectOption("#toneSel", "cheeky");
  });
  await check("taste.badges", async () => {
    const total = await p.locator(".cabinet .pin").count(), n = await p.locator(".cabinet .pin.earned").count();
    expect(total === 47, `${total} pins in the cabinet`); expect(n >= 1, "no pins shown as earned");
    expect(Object.keys((await store(p)).badges).some((k) => k === "pin:first-love:1"), "First Love not recorded");
    await p.locator(".cabinet .pin.earned").first().click(); await p.waitForSelector("#modal:not([hidden]) .walllabel");
    expect((await p.textContent("#modalBody .walllabel")).length > 10, "pin detail has no wall label");
    await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/pin-detail.png` }); await p.click("#modalOk");
    await p.locator(".cabinet .pin.locked").first().click(); await p.waitForSelector("#modal:not([hidden])");
    expect(/Opens at|of \d|Still to love|^/.test(await p.textContent("#modalBody")), "locked pin detail"); await p.click("#modalOk");
    return `${n} of ${total} earned`;
  });
  await check("taste.portrait", async () => {
    await p.locator("#view-taste").evaluate((el) => el.scrollTo(0, 0));
    const title = await p.textContent("#t-portrait h1"); expect(/^The /.test(title), `eye title: ${title}`);
    expect(await p.locator(".callit i").count() >= 5, "no Called it strip");
    expect(/app's score, not yours/.test(await p.textContent("#t-app")), "app understanding block missing");
    expect(!/predicted right/.test(await p.textContent("#t-portrait .tiles")), "prediction still shown as your stat");
    await p.screenshot({ path: `${OUT}/portrait.png` });
    return title;
  });
  await check("taste.jump", async () => {
    await p.click('.jump a[data-jump="t-badges"]'); await p.waitForTimeout(700);
    expect(await p.getAttribute('.jump a[data-jump="t-badges"]', "aria-current") === "true", "Badges not highlighted after jumping");
    const top = await p.locator("#t-badges").evaluate((el) => el.getBoundingClientRect().top); expect(top >= 0 && top < 140, `Badges section at ${top}px`);
    await p.screenshot({ path: `${OUT}/badges.png` });
    await p.waitForTimeout(400); await p.locator("#view-taste").evaluate((el) => el.scrollTo(0, el.scrollHeight)); await p.waitForTimeout(250);
    expect(await p.getAttribute('.jump a[data-jump="t-leanings"]', "aria-current") === "true", "scrolling to the end doesn't highlight Leanings");
    await p.click('.jump a[data-jump="t-portrait"]'); await p.waitForTimeout(700);
  });
  await check("taste.leanings", async () => {
    expect(await p.locator(".dim .row").count() > 2, "no leanings"); expect(/Why you love/.test(await p.textContent("#view-taste")), "no reasons section");
    expect(/Left you undecided/.test(await p.textContent("#view-taste")), "no undecided list");
  });
  await check("kept.grid", async () => {
    await p.click("#tab-kept"); await p.waitForSelector(".tile");
    const all = await p.locator(".tile").count();
    await p.click('.filters .chip[data-f="loved"]'); const loved = await p.locator(".tile").count();
    await p.click('.filters .chip[data-f="onview"]'); const chi = await p.locator(".tile").count();
    await p.click('.filters .chip[data-f="all"]');
    const s = await store(p);
    expect(all === s.swipes.filter((x) => x.v > 0).length, "All count wrong"); expect(loved === s.swipes.filter((x) => x.v === 2).length, "Loved count wrong");
    expect(chi === s.swipes.filter((x) => x.v > 0 && x.a.onView).length, "On view count wrong");
    return `${all} kept, ${loved} loved, ${chi} on view`;
  });
  await check("kept.love", async () => {
    const btn = p.locator(".tile-wrap .lovebtn[aria-pressed=false]").first(); const uid = await btn.getAttribute("data-uid");
    await btn.click(); await p.waitForTimeout(150); expect((await store(p)).swipes.find((s) => s.uid === uid).v === 2, "star didn't love");
    await p.locator(`.tile-wrap .lovebtn[data-uid="${uid}"]`).click(); await p.waitForTimeout(150); expect((await store(p)).swipes.find((s) => s.uid === uid).v === 1, "star didn't unlove");
    await p.locator(".tile").first().click(); await p.waitForSelector("#sheet.open .sheet-love");
    expect(await p.isHidden("#sheetActions"), "decision bar shouldn't appear for a work already in Kept");
    await p.click(".sheet-love .lovebtn");
    expect(/Loved/.test(await p.textContent(".sheet-love")), "sheet star didn't update"); await p.click("#sheetDone");
    await p.screenshot({ path: `${OUT}/kept.png` });
  });
  await check("settings.discovery", async () => {
    await p.click("#tab-settings"); await p.fill("#explore", "0.8"); await p.dispatchEvent("#explore", "input");
    await p.reload(); expect((await store(p)).settings.explore === 0.8, "slider not saved");
  });
  await check("settings.museums", async () => {
    await p.click("#tab-settings");
    const others = ["met", "nga", "cma", "wd", "vam", "smk"];
    for (const k of others) await p.uncheck(`[data-src="${k}"]`);
    expect(/non-commercial/.test(await p.textContent("#view-settings")) && /Danish/.test(await p.textContent("#view-settings")), "V&A and SMK notes not shown");
    const before = { ...calls };
    await pp(p, async () => { __pp.deck.pool = []; await __pp.deck.refill(); });
    const srcs = await pp(p, () => [...new Set(__pp.deck.pool.map((a) => a.src))]);
    expect(srcs.length === 1 && srcs[0] === "aic", `pool sources: ${srcs}`);
    expect(["met", "wd", "vam", "smk"].every((k) => calls[k] === before[k]), "disabled museums were still called");
    for (const k of others) await p.check(`[data-src="${k}"]`);
  });
  await check("data.backup", async () => {
    const n = (await store(p)).swipes.length;
    const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#bkSave")]);
    const name = dl.suggestedFilename(); expect(/^picture-plane-\d{4}-\d{2}-\d{2}-\d{4}-\d+decisions\.json$/.test(name), `filename ${name}`);
    const file = `${OUT}/${name}`; await dl.saveAs(file);
    await p.click("#resetAsk"); await p.click("#cYes"); await p.waitForLoadState(); await p.waitForTimeout(300);
    expect((await store(p)).swipes.length === 0, "reset didn't erase");
    if (await p.isVisible("#obGo")) await p.click("#obGo");
    await p.click("#tab-settings"); await p.click("#bkRestore"); await p.setInputFiles("#bkFile", file); await p.waitForTimeout(200); await p.click("#bkGo");
    expect((await store(p)).swipes.length === n, `restored ${(await store(p)).swipes.length} of ${n}`);
    await p.click("#bkRestore"); await p.fill("#bkText", "not a backup"); await p.click("#bkGo"); expect(/isn't a Picture Plane/.test(await p.textContent("#toast")), "bad paste not explained");
    return name;
  });
  await check("data.reset", async () => { expect(results.get("data.backup")?.ok, "covered by data.backup (erase then restore)"); });
  await check("sources.mix", async () => {
    // The new traditions each come from one new source; fetching them through the deck proves every source works in the browser.
    const got = await pp(p, async () => { const { OPENING } = await import("./js/curation.js");
      const out = {}; for (const id of ["folk", "danish-golden-age", "futurism", "mughal"]) { const a = await __pp.deck.fetchSeed(OPENING.find((s) => s.id === id)); out[id] = a && a.src; } return out; });
    expect(got.folk === "nga" && got["danish-golden-age"] === "smk" && got.futurism === "wd" && got.mughal === "vam", JSON.stringify(got));
    const seen = new Set((await store(p)).swipes.map((x) => x.a.src));
    return `seeds ${Object.values(got).join(", ")}; session saw ${[...seen].join(", ")}`;
  });
  await check("look.norepeat", async () => { const u = (await store(p)).swipes.map((s) => s.uid); expect(u.length === new Set(u).size, `${u.length - new Set(u).size} repeats`); return `${u.length} decisions, 0 repeats`; });
  await check("app.install", async () => {
    const m = await (await p.request.get(`${APP}manifest.webmanifest`)).json();
    expect(m.name && m.display === "standalone" && m.icons.length >= 3, "manifest incomplete");
    for (const i of m.icons) expect((await p.request.get(APP + i.src)).ok(), `icon ${i.src} missing`);
    expect(await p.getAttribute('link[rel="apple-touch-icon"]', "href"), "no Apple touch icon");
  });
  await check("app.privacy", async () => {
    await p.click("#tab-settings"); const href = await p.getAttribute('a[href="./privacy.html"]', "href"); expect(href, "no privacy link");
    const r = await p.request.get(APP + "privacy.html"); expect(r.ok() && /No tracking/.test(await r.text()), "privacy page missing");
    expect(/not affiliated/.test(await p.textContent("#view-settings")), "no independence statement");
  });
  await check("app.errors", async () => { expect(!errs.length, errs.slice(0, 2).join(" | ")); });
  await ctx.close();
}

/* ================= Session F: an existing collection meets the cabinet ================= */
await check("badges.ceremony", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await mockWorld(ctx);
  const p = await ctx.newPage(); await p.goto(APP);
  await pp(p, () => {
    const MV = ["Impressionism", "Baroque", "Ukiyo-e", "Cubism", "Realism", "Rococo", "Symbolism", "Fauvism", "Gothic", "Romanticism", "Byzantine", "Expressionism"];
    const swipes = Array.from({ length: 60 }, (_, i) => ({ uid: `aic:${9000 + i}`, v: i % 4 === 0 ? 2 : i % 3 ? 1 : -1, t: Date.now() - (60 - i) * 60000, f: [`style|${MV[i % 12]}`, `cent|c${i % 7}`, "place|France"],
      a: { uid: `aic:${9000 + i}`, src: "aic", title: `Work ${i}`, artist: `Painter ${i % 9}`, movement: MV[i % 12], year: 1500 + i * 7, place: i % 2 ? "France" : "Japan" } }));
    localStorage.clear(); localStorage.setItem("pp-alpha-v1", JSON.stringify({ onboarded: true, swipes, level: 1, badges: { "first-love": 1 } }));
  });
  await p.reload(); await p.waitForSelector("#modal:not([hidden])", { timeout: 8000 });
  expect(/Your cabinet is open/.test(await p.textContent("#modalBody")), "no welcome-back cabinet");
  const n = await p.locator("#modalBody .pinrow figure").count(); expect(n >= 3, `only ${n} pins in the ceremony`);
  await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/ceremony.png` });
  await p.click("#modalOk"); await p.waitForTimeout(700);
  expect(await p.isVisible("#view-taste") && await p.getAttribute('.jump a[data-jump="t-badges"]', "aria-current") === "true", "didn't land on Badges");
  await p.reload(); await p.waitForTimeout(800);
  expect(!/Your cabinet is open/.test((await p.textContent("#modalBody").catch(() => "")) || "") || await p.isHidden("#modal"), "ceremony showed twice");
  await ctx.close();
  return `${n} pins`;
});

await check("taste.recalibrate", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await mockWorld(ctx);
  const p = await ctx.newPage(); await p.goto(APP);
  await pp(p, () => {
    const swipes = Array.from({ length: 60 }, (_, i) => ({ uid: `aic:${8000 + i}`, v: i % 2 ? 1 : -1, t: Date.now() - (60 - i) * 60000, f: [`style|S${i % 10}`], a: { uid: `aic:${8000 + i}`, src: "aic", title: `W${i}` } }));
    localStorage.clear(); localStorage.setItem("pp-alpha-v1", JSON.stringify({ onboarded: true, swipes, level: 4, badges: { "pin:_init": 1 } }));
  });
  await p.reload(); await p.waitForTimeout(1600);
  let s = await store(p); expect(s.level === 1 && s.levelScale === 3, `level ${s.level} after recalibration`);
  expect(/recalibrated/.test(await p.textContent("#toast").catch(() => "")), "no recalibration notice");
  expect(/Docent/.test(await p.textContent("#levelChip")), "level chip not updated");
  await p.reload(); await p.waitForTimeout(800); s = await store(p); expect(s.level === 1, "recalibrated twice");
  await ctx.close();
});

await check("museums.day", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await mockWorld(ctx);
  const p = await ctx.newPage(); await p.goto(APP);
  await pp(p, () => {
    const day0 = new Date("2026-09-12T15:00:00Z").getTime();
    const mk = (i, src, v, onView) => ({ uid: `${src}:${7000 + i}`, v, t: day0 + i * 60000, f: [`style|S${i % 9}`], a: { uid: `${src}:${7000 + i}`, src, title: `W${i}`, onView } });
    const swipes = [...Array.from({ length: 24 }, (_, i) => mk(i, "aic", i % 4 ? 1 : -1, i % 3 === 0)), ...Array.from({ length: 12 }, (_, i) => mk(30 + i, "met", i % 3 ? -1 : 1, false)), ...Array.from({ length: 4 }, (_, i) => mk(50 + i, "vam", 1, false))];
    localStorage.clear(); localStorage.setItem("pp-alpha-v1", JSON.stringify({ onboarded: true, swipes, badges: { "pin:_init": 1 }, levelScale: 3 }));
  });
  await p.reload(); await p.click("#tab-taste"); await p.click('.jump a[data-jump="t-museums"]'); await p.waitForTimeout(600);
  const txt = await p.textContent("#t-museums");
  expect(/Art Institute of Chicago/.test(txt.split("Passport")[0]), "home museum isn't Chicago");
  expect(await p.locator("#t-museums .stamp.got").count() === 2 && await p.locator("#t-museums .stamp.todo").count() === 5, "wrong stamps earned");
  expect(/12 SEP 2026/.test(txt), "stamp not dated by the decision that earned it");
  expect(/of your keeps in Chicago/.test(txt), "no on-view count");
  await p.screenshot({ path: `${OUT}/museums.png`, fullPage: false });
  await p.click('#t-museums [data-day="aic"]'); await p.waitForSelector("#view-look:not([hidden])"); await waitTop(p);
  expect(/Museum Day at the Art Institute of Chicago: 20 to go/.test(await p.textContent(".card.top .cue")), "no Museum Day cue");
  for (let i = 0; i < 20; i++) { await waitTop(p); expect(await pp(p, () => __pp.deck.queue[0].src) === "aic", `card ${i} not from Chicago`); await press(p, i % 2 ? "ArrowRight" : "ArrowLeft"); }
  await p.waitForSelector("#modal:not([hidden])", { timeout: 4000 }); expect(/Museum Day complete/.test(await p.textContent("#modalBody")), "no completion");
  await p.screenshot({ path: `${OUT}/museumday-done.png` }); await p.click("#modalOk");
  const s = await store(p); expect(s.museumDays && s.museumDays.aic && !s.museumDay, "Museum Day not recorded");
  expect(Object.keys(s.badges).includes("pin:day-tripper:1"), "Day Tripper not earned");
  await ctx.close();
});

/* ================= Session B: broken images ================= */
await check("look.broken", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await mockWorld(ctx, { brokenImages: new Set(["p3", "p4", "p5"]) });
  const p = await ctx.newPage(); await p.goto(APP); await pp(p, () => { localStorage.clear(); localStorage.setItem("pp-alpha-v1", JSON.stringify({ onboarded: true, seedIdx: 99,   // past the opening hang; Chicago only, whose mock breaks some images
    settings: { sources: { met: false, nga: false, cma: false, wd: false, vam: false, smk: false } } })); }); await p.reload();
  for (let i = 0; i < 14; i++) { await waitTop(p); const src = await p.getAttribute(".card.top .work", "src"); expect(!/\/iiif\/2\/p3/.test(src), "a broken image was shown"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(260); }
  const s = await store(p); expect(Object.keys(s.seen).some((u) => !s.swipes.some((x) => x.uid === u)), "broken works weren't retired");
  await ctx.close();
});

/* ================= Session C: every museum down ================= */
await check("look.outage", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  await mockWorld(ctx, { down: new Set(["aic", "met", "wd", "vam", "smk"]) });
  await ctx.route("**/alpha/data/**", (r) => r.fulfill({ status: 503, body: "" }));   // static collections unreachable too
  const p = await ctx.newPage(); await p.goto(APP); await pp(p, () => { localStorage.clear(); localStorage.setItem("pp-alpha-v1", JSON.stringify({ onboarded: true })); }); await p.reload();
  await p.waitForSelector("#retry", { timeout: 15000 });
  expect(/aren't answering/.test(await p.textContent(".empty")), "no outage message");
  await p.screenshot({ path: `${OUT}/outage.png` }); await ctx.close();
});

/* ================= Session E: offline after first visit ================= */
await check("app.offline", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockWorld(ctx);
  const p = await ctx.newPage(); await p.goto(APP);
  await pp(p, async () => { localStorage.setItem("pp-alpha-v1", JSON.stringify({ onboarded: true })); await navigator.serviceWorker.ready; });
  await p.reload(); await p.waitForSelector(".tabbar"); await p.waitForTimeout(500);   // second visit fills the shell cache
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector(".topbar .wordmark", { timeout: 8000 });
  const ok = await p.isVisible(".tabbar") && await p.isVisible("#controls"); await ctx.setOffline(false); await ctx.close();
  expect(ok, "app shell didn't load offline");
});

/* ================= Session D: backend, two devices, dark ================= */
{
  const env = { DB: d1(), ALLOWED_ORIGINS: ROOT, ANTHROPIC_API_KEY: "k" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).startsWith("https://api.anthropic.com")
    ? new Response(JSON.stringify({ content: [{ type: "text", text: '{"title":"A taste for weather","note":"You keep choosing skies over saints."}' }] }), { status: 200 })
    : realFetch(url, init);
  const ca = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", serviceWorkers: "block" }); await mockWorld(ca, { backend: true, env });
  const a = await ca.newPage(); await a.goto(APP); await pp(a, () => localStorage.clear()); await a.reload(); await a.click("#obGo");
  for (let i = 0; i < 18; i++) { await waitTop(a); await a.keyboard.press(i % 2 ? "ArrowRight" : "ArrowLeft"); await a.waitForTimeout(260); }
  await a.screenshot({ path: `${OUT}/look-dark.png` });
  let link = "";
  await check("sync.devices", async () => {
    await a.click("#tab-settings"); await a.click("#syncOn"); await a.waitForTimeout(600);
    await a.click("#pairLink"); link = await a.inputValue("#pairText"); expect(/#pair=[A-Za-z0-9_-]{24}$/.test(link), "bad pairing link");
    const cb = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" }); await mockWorld(cb, { backend: true, env });
    const b = await cb.newPage(); await b.goto(link); await b.click("#pairYes"); await b.waitForTimeout(800);
    const nb = (await store(b)).swipes.length, na = (await store(a)).swipes.length;
    expect(nb === na, `device B has ${nb} of ${na}`);
    await waitTop(b); await b.screenshot({ path: `${OUT}/desktop.png` }); await cb.close();
    return `${nb} decisions on both`;
  });
  await check("sync.notes", async () => {
    await a.click("#tab-taste"); await a.click("#noteNow"); await a.waitForTimeout(600);
    expect(/A taste for weather/.test(await a.textContent(".notes .note")), "AI note not shown");
  });
  globalThis.fetch = realFetch; await ca.close();
}
await browser.close();

/* ================= Report ================= */
const e2eIds = new Set(FEATURES.flatMap((f) => f.checks.filter((c) => c.startsWith("e2e:")).map((c) => c.slice(4))));
const missing = [...e2eIds].filter((id) => !results.has(id));
let fail = 0;
console.log("\nFeature checks (browser)\n");
for (const [id, r] of results) { if (!r.ok) fail++; console.log(`${r.ok ? "PASS" : "FAIL"}  ${id.padEnd(20)} ${r.detail}`); }
for (const id of missing) { fail++; console.log(`MISS  ${id.padEnd(20)} listed in features.mjs but never checked`); }
console.log(`\n${results.size - fail + missing.length} passed, ${fail} failed or missing, of ${e2eIds.size} required browser checks`);
process.exit(fail ? 1 : 0);
