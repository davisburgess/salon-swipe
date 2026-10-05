// End-to-end run of the alpha in headless Chromium with all three museums mocked
// and the real Worker code serving the API in-process. Usage: node tests/e2e.mjs <screenshot dir>
import { chromium } from "/opt/npm-tools/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/src/index.js";

const OUT = process.argv[2] || ".";
const IMG = process.env.IMGDIR;
const imgs = [0, 1, 2, 3, 4, 5].map((i) => readFileSync(`${IMG}/p${i}.jpg`));
const STYLES = ["Impressionism", "Baroque", "Ukiyo-e", "Realism", "Cubism", "Romanticism", "Symbolism", "Rococo", "Expressionism", "Renaissance", "Post-Impressionism", "Fauvism"];
let n = 1000;
const aicItem = (q) => { n++; const st = q && STYLES.includes(q) ? q : STYLES[n % STYLES.length];
  return { id: n, title: `${["Morning", "Harbor", "Portrait of a Lady", "Still Life with Pears", "The Bridge", "Evening Fields"][n % 6]} ${n}`,
    artist_title: `Painter ${n % 17}`, artist_display: `Painter ${n % 17}\nFrench, 1840–1910`, date_display: `${1700 + (n % 220)}`, date_start: 1700 + (n % 220),
    style_title: st, classification_title: "painting", place_of_origin: ["France", "Japan", "Netherlands", "Italy"][n % 4],
    medium_display: n % 3 ? "Oil on canvas" : "Color woodblock print", image_id: `p${n % 6}-${n}`, color: { h: (n * 47) % 360, s: 40, l: 45 },
    thumbnail: { lqip: null, width: 900, height: 700, alt_text: "A painting" }, subject_titles: ["landscapes", "water"],
    dimensions: `${50 + (n % 80)} × ${60 + (n % 70)} cm`, dimensions_detail: [{ height: 50 + (n % 80), width: 60 + (n % 70) }],
    credit_line: "Mr. and Mrs. Martin A. Ryerson Collection", is_on_view: n % 2 === 0, gallery_title: "Gallery 243", is_public_domain: true }; };

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => { const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => +m[1] - 1); const vals = order.map((i) => args[i]);
    const s = db.prepare(sql.replace(/\?(\d+)/g, "?"));
    return { bind: (...a) => stmt(sql, a), run: async () => s.run(...vals), first: async () => s.get(...vals) ?? null, all: async () => ({ results: s.all(...vals) }), _exec: () => s.run(...vals) }; };
  return { prepare: (sql) => stmt(sql), batch: async (l) => { db.exec("BEGIN"); l.forEach((x) => x._exec()); db.exec("COMMIT"); } };
}

async function setup(ctx, { backend = false, env } = {}) {
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("https://api.artic.edu/api/v1/artworks/search**", (r) => { const q = new URL(r.request().url()).searchParams.get("q");
    r.fulfill({ json: { pagination: { total_pages: 30 }, data: Array.from({ length: 12 }, () => aicItem(q)) } }); });
  await ctx.route(/api\.artic\.edu\/api\/v1\/artworks\/\d+\?/, (r) => r.fulfill({ json: { data: { description: "<p>Painted outdoors in a single sitting, the canvas records <em>one</em> moment of light.</p><p>The artist returned to this motif many times.</p>", is_on_view: true, gallery_title: "Gallery 243" } } }));
  await ctx.route("https://www.artic.edu/iiif/**", (r) => { const id = r.request().url().split("/iiif/2/")[1].split("/")[0]; const k = +id[1] || 0;
    r.fulfill({ status: 200, contentType: "image/jpeg", body: imgs[k], headers: { "access-control-allow-origin": "*" } }); });
  await ctx.route("https://collectionapi.metmuseum.org/**", (r) => { const u = r.request().url();
    if (u.includes("/search")) return r.fulfill({ json: { total: 40, objectIDs: Array.from({ length: 40 }, (_, i) => 5000 + i) } });
    const id = +u.split("/objects/")[1];
    r.fulfill({ json: { objectID: id, isPublicDomain: true, primaryImageSmall: `https://images.metmuseum.org/fake/p${id % 6}.jpg`, primaryImage: `https://images.metmuseum.org/fake/p${id % 6}.jpg`,
      title: `Met work ${id}`, artistDisplayName: `Met artist ${id % 9}`, artistDisplayBio: "Dutch, 1600–1660", objectDate: "1650", objectBeginDate: 1650, medium: "Oil on wood",
      dimensions: "40 × 32 cm", creditLine: "Bequest of Benjamin Altman, 1913", classification: "Paintings", tags: [{ term: "Interiors" }], objectURL: `https://www.metmuseum.org/art/collection/search/${id}`, GalleryNumber: "" } }); });
  await ctx.route("https://openaccess-api.clevelandart.org/**", (r) => r.fulfill({ json: { data: Array.from({ length: 10 }, (_, i) => { const id = 9000 + n++;
    return { id, accession_number: `1915.${id}`, title: `Cleveland work ${id}`, creation_date: "c. 1880", creation_date_earliest: 1880, culture: ["America"], technique: "watercolor", type: "Drawing",
      measurements: "Sheet: 35 x 50 cm", creators: [{ description: `Cleveland artist ${id % 7} (American, 1850–1920)` }], share_license_status: "CC0",
      images: { web: { url: `https://openaccess-cdn.clevelandart.org/fake/p${id % 6}.jpg`, width: "900", height: "700" } }, wall_description: "A quick study in watercolor.", url: "https://www.clevelandart.org/art/x", current_location: null }; }) } }));
  await ctx.route(/(images\.metmuseum\.org|openaccess-cdn\.clevelandart\.org)\/fake\//, (r) => { const k = +(r.request().url().match(/p(\d)\.jpg/) || [0, 0])[1];
    r.fulfill({ status: 200, contentType: "image/jpeg", body: imgs[k] }); });
  if (backend) {
    await ctx.route("**/alpha/api.json", (r) => r.fulfill({ json: { base: "https://api.test" } }));
    await ctx.route("https://api.test/**", async (r) => {
      const q = r.request();
      const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ["GET", "HEAD", "OPTIONS"].includes(q.method()) ? undefined : q.postData() }), env);
      r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    });
  } else await ctx.route("**/alpha/api.json", (r) => r.fulfill({ status: 404, body: "" }));
}

const log = (...a) => console.log(...a);
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

/* ---------- Run 1: offline-only, light theme, phone ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "light", hasTouch: false });
  await setup(ctx);
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && !/api\.json/.test(m.text()) && errs.push(m.text()));
  // Salon Swipe history on the same origin
  await p.goto("http://127.0.0.1:8123/alpha/");
  await p.evaluate(() => { localStorage.clear(); localStorage.setItem("salon-swipe-v1", JSON.stringify({ swipes: Array.from({ length: 12 }, (_, i) => ({ id: 70000 + i, v: i % 3 ? 1 : -1, f: [`style|${i % 2 ? "Impressionism" : "Baroque"}`], t: i + 1, a: { id: 70000 + i, title: `Old ${i}`, artist_title: `Old artist ${i}`, image_id: `p${i % 6}-old${i}`, style_title: i % 2 ? "Impressionism" : "Baroque" } })) })); });
  await p.reload(); await p.waitForSelector("#modal:not([hidden])");
  log("onboarding import button:", await p.textContent("#obImport"));
  await p.screenshot({ path: `${OUT}/01-onboarding.png` });
  await p.click("#obImport"); log("toast:", await p.textContent("#toast"));
  await p.click("#obGo");
  await p.waitForSelector(".card.top.loaded", { timeout: 8000 });
  await p.waitForTimeout(600);
  log("first cue:", (await p.textContent(".card.top .cue")).trim().replace(/\s+/g, " "));
  await p.screenshot({ path: `${OUT}/02-look.png` });
  // Drag right with the mouse
  const box = await p.locator(".card.top").boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + 200); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 90, box.y + 210, { steps: 6 });
  await p.screenshot({ path: `${OUT}/03-dragging.png` });
  await p.mouse.move(box.x + box.width / 2 + 220, box.y + 220, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(450);
  // Love with the button -> why tray
  await p.click("#btnLove"); await p.waitForSelector("#why:not([hidden])"); await p.click('#why .chip[data-c="Light"]');
  await p.screenshot({ path: `${OUT}/04-why.png` });
  await p.waitForTimeout(300);
  // Tap the label -> wall text
  await p.waitForSelector(".card.top.loaded");
  const lb = await p.locator(".card.top .label").boundingBox(); await p.mouse.click(lb.x + 20, lb.y + 10);
  await p.waitForSelector("#sheet.open"); await p.waitForTimeout(500);
  log("sheet text:", (await p.textContent("#sheetText")).trim().slice(0, 60), "| scale figure:", await p.isVisible(".scale"));
  await p.screenshot({ path: `${OUT}/05-walltext.png` });
  await p.click("#sheetDone");
  // Later via keyboard, then undo
  const before = await p.textContent(".card.top .what"); await p.keyboard.press("ArrowDown"); await p.waitForTimeout(350);
  await p.click("#btnUndo"); await p.waitForTimeout(300); log("undo restored later card:", (await p.textContent(".card.top .what")) === before);
  // New style
  { const beforeTitle = await p.textContent(".card.top .what"), beforeN = await p.evaluate(() => __pp.state.swipes.length);
    await p.click("#btnNewStyle"); await p.waitForTimeout(700);
    log("new style: card changed:", (await p.textContent(".card.top .what")) !== beforeTitle, "| cue:", (await p.textContent(".card.top .cue p")).trim(),
      "| no vote recorded:", (await p.evaluate(() => __pp.state.swipes.length)) === beforeN);
    await p.click("#btnUndo"); await p.waitForTimeout(400);
    log("undo after new style restores card:", (await p.textContent(".card.top .what")) === beforeTitle); }
  // Swipe until Docent
  for (let i = 0; i < 40; i++) { await p.waitForSelector(".card.top", { timeout: 8000 }); if (await p.isVisible("#modal:not([hidden])")) break; await p.keyboard.press(i % 3 ? "ArrowRight" : "ArrowLeft"); await p.waitForTimeout(280); }
  await p.waitForSelector("#modal:not([hidden])", { timeout: 5000 }).catch(() => {});
  log("level modal:", (await p.textContent("#modalBody").catch(() => "none")).replace(/\s+/g, " ").slice(0, 200));
  await p.screenshot({ path: `${OUT}/06-levelup.png` });
  if (await p.isVisible("#modalOk")) await p.click("#modalOk");
  await p.click("#tab-taste"); await p.waitForTimeout(200); await p.screenshot({ path: `${OUT}/07-taste.png`, fullPage: false });
  await p.evaluate(() => document.querySelector("#view-taste").scrollTo(0, 900)); await p.screenshot({ path: `${OUT}/07b-taste-lower.png` });
  await p.click("#tab-kept"); await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/08-kept.png` });
  await p.click("#tab-settings"); await p.waitForTimeout(200); await p.screenshot({ path: `${OUT}/09-settings.png` });
  const st = await p.evaluate(() => JSON.parse(localStorage.getItem("pp-alpha-v1")));
  log("stored:", { swipes: st.swipes.length, level: st.level, notes: st.notes.length, badges: Object.keys(st.badges), later: st.later.length, whyOnLove: st.swipes.filter((s) => s.why).length });
  const uids = st.swipes.map((s) => s.uid); log("duplicate decisions:", uids.length - new Set(uids).size);
  log("errors run 1:", errs);
  await ctx.close();
}

/* ---------- Run 2: dark theme, backend connected, two devices ---------- */
{
  const env = { DB: d1(), ALLOWED_ORIGINS: "http://127.0.0.1:8123", ANTHROPIC_API_KEY: "k" };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).startsWith("https://api.anthropic.com")
    ? new Response(JSON.stringify({ content: [{ type: "text", text: '{"title":"A taste for weather","note":"You keep choosing skies over saints. Bright, loose, outdoors. The Baroque keeps knocking and you keep not answering. Try a Turner storm next."}' }] }), { status: 200 })
    : realFetch(url, init);
  const ctxA = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await setup(ctxA, { backend: true, env });
  const a = await ctxA.newPage(); const errs = []; a.on("pageerror", (e) => errs.push(e.message));
  await a.goto("http://127.0.0.1:8123/alpha/"); await a.evaluate(() => localStorage.clear()); await a.reload();
  await a.click("#obGo"); await a.waitForSelector(".card.top.loaded"); await a.waitForTimeout(500);
  await a.screenshot({ path: `${OUT}/10-look-dark.png` });
  for (let i = 0; i < 18; i++) { await a.keyboard.press(i % 2 ? "ArrowRight" : "ArrowUp"); await a.waitForTimeout(260); if (await a.isVisible("#why:not([hidden])")) await a.keyboard.press("Escape"); }
  await a.click("#tab-settings"); await a.click("#syncOn"); await a.waitForTimeout(600);
  log("sync toast:", await a.textContent("#toast"));
  await a.click("#pairLink"); const link = await a.inputValue("#pairText"); log("pair link ok:", /#pair=[A-Za-z0-9_-]{24}$/.test(link));
  await a.click("#tab-taste"); await a.click("#noteNow"); await a.waitForTimeout(600);
  log("AI note:", (await a.textContent(".notes .note")).replace(/\s+/g, " ").slice(0, 120));
  await a.screenshot({ path: `${OUT}/11-taste-dark.png` });
  // Device B opens the pairing link
  const ctxB = await b.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: "light" });
  await setup(ctxB, { backend: true, env });
  const bp = await ctxB.newPage();
  await bp.goto(link.replace("127.0.0.1:8123", "127.0.0.1:8123")); await bp.waitForSelector("#pairYes"); await bp.click("#pairYes"); await bp.waitForTimeout(800);
  const stB = await bp.evaluate(() => JSON.parse(localStorage.getItem("pp-alpha-v1")));
  log("device B received decisions:", stB.swipes.length, "| notes:", stB.notes.length);
  await bp.waitForSelector(".card.top.loaded"); await bp.waitForTimeout(500);
  await bp.screenshot({ path: `${OUT}/12-desktop.png` });
  log("errors run 2:", errs);
  globalThis.fetch = realFetch;
}
await b.close();
