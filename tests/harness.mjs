// Shared test harness: mocked museums, stand-in images, and the real Worker served in-process over SQLite.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/src/index.js";

export async function loadPlaywright() {
  try { return await import("playwright"); } catch (e) { return await import("/opt/npm-tools/node_modules/playwright/index.mjs"); }
}
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try { readFileSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome"); return "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"; } catch (e) { return undefined; }
}

const imgs = [0, 1, 2, 3, 4, 5].map((i) => readFileSync(new URL(`./fixtures/img/p${i}.jpg`, import.meta.url)));
const STYLES = ["Impressionism", "Baroque", "Ukiyo-e", "Realism", "Cubism", "Romanticism", "Symbolism", "Rococo", "Expressionism", "Renaissance", "Post-Impressionism", "Fauvism"];
let n = 1000;
export const aicItem = (q) => { n++; const st = q && STYLES.includes(q) ? q : STYLES[n % STYLES.length];
  return { id: n, title: `${["Morning", "Harbor", "Portrait of a Lady", "Still Life with Pears", "The Bridge", "Evening Fields"][n % 6]} ${n}`,
    artist_title: `Painter ${n % 17}`, artist_display: `Painter ${n % 17}\nFrench, 1840–1910`, date_display: `${1700 + (n % 220)}`, date_start: 1700 + (n % 220),
    style_title: st, classification_title: "painting", place_of_origin: ["France", "Japan", "Netherlands", "Italy"][n % 4],
    medium_display: n % 3 ? "Oil on canvas" : "Color woodblock print", image_id: `p${n % 6}-${n}`, color: { h: (n * 47) % 360, s: 40, l: 45 },
    thumbnail: { lqip: null, width: 900, height: 700, alt_text: "A painting" }, subject_titles: ["landscapes", "water"],
    dimensions: `${50 + (n % 80)} × ${60 + (n % 70)} cm`, dimensions_detail: [{ height: 50 + (n % 80), width: 60 + (n % 70) }],
    credit_line: "Mr. and Mrs. Martin A. Ryerson Collection", is_on_view: n % 2 === 0, gallery_title: "Gallery 243", is_public_domain: true }; };

export function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  const stmt = (sql, args = []) => { const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => +m[1] - 1); const vals = order.map((i) => args[i]);
    const s = db.prepare(sql.replace(/\?(\d+)/g, "?"));
    return { bind: (...a) => stmt(sql, a), run: async () => s.run(...vals), first: async () => s.get(...vals) ?? null, all: async () => ({ results: s.all(...vals) }), _exec: () => s.run(...vals) }; };
  return { prepare: (sql) => stmt(sql), batch: async (l) => { db.exec("BEGIN"); try { l.forEach((x) => x._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
}

// opts: { backend, env, down: Set of museums that fail, brokenImages: Set of AIC image ids that 404 }
export async function mockWorld(ctx, opts = {}) {
  const down = opts.down || new Set(), broken = opts.brokenImages || new Set(), calls = { aic: 0, met: 0, cma: 0 };
  await ctx.route("https://fonts.googleapis.com/**", (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await ctx.route("https://api.artic.edu/api/v1/artworks/search**", (r) => { calls.aic++; if (down.has("aic")) return r.fulfill({ status: 503, body: "" });
    const q = new URL(r.request().url()).searchParams.get("q");
    r.fulfill({ json: { pagination: { total_pages: 30 }, data: Array.from({ length: 12 }, () => aicItem(q)) } }); });
  await ctx.route(/api\.artic\.edu\/api\/v1\/artworks\/\d+\?/, (r) => r.fulfill({ json: { data: { description: "<p>Painted outdoors in a single sitting, the canvas records <em>one</em> moment of light.</p><p>The artist returned to this motif many times.</p>", is_on_view: true, gallery_title: "Gallery 243" } } }));
  await ctx.route("https://www.artic.edu/iiif/**", (r) => { const id = r.request().url().split("/iiif/2/")[1].split("/")[0];
    if ([...broken].some((b) => id.startsWith(b))) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ status: 200, contentType: "image/jpeg", body: imgs[+id[1] || 0], headers: { "access-control-allow-origin": "*" } }); });
  await ctx.route("https://collectionapi.metmuseum.org/**", (r) => { calls.met++; if (down.has("met")) return r.fulfill({ status: 503, body: "" });
    const u = r.request().url();
    if (u.includes("/search")) return r.fulfill({ json: { total: 40, objectIDs: Array.from({ length: 40 }, (_, i) => 5000 + i) } });
    const id = +u.split("/objects/")[1];
    r.fulfill({ json: { objectID: id, isPublicDomain: true, primaryImageSmall: `https://images.metmuseum.org/fake/p${id % 6}.jpg`, primaryImage: `https://images.metmuseum.org/fake/p${id % 6}.jpg`,
      title: `Met work ${id}`, artistDisplayName: `Met artist ${id % 9}`, artistDisplayBio: "Dutch, 1600–1660", objectDate: "1650", objectBeginDate: 1650, medium: "Oil on wood",
      dimensions: "40 × 32 cm", creditLine: "Bequest of Benjamin Altman, 1913", classification: "Paintings", tags: [{ term: "Interiors" }], objectURL: `https://www.metmuseum.org/art/collection/search/${id}`, GalleryNumber: "" } }); });
  await ctx.route("https://openaccess-api.clevelandart.org/**", (r) => { calls.cma++; if (down.has("cma")) return r.fulfill({ status: 503, body: "" });
    r.fulfill({ json: { data: Array.from({ length: 10 }, () => { const id = 9000 + n++;
      return { id, accession_number: `1915.${id}`, title: `Cleveland work ${id}`, creation_date: "c. 1880", creation_date_earliest: 1880, culture: ["America"], technique: "watercolor", type: "Drawing",
        measurements: "Sheet: 35 x 50 cm", creators: [{ description: `Cleveland artist ${id % 7} (American, 1850–1920)` }], share_license_status: "CC0",
        images: { web: { url: `https://openaccess-cdn.clevelandart.org/fake/p${id % 6}.jpg`, width: "900", height: "700" } }, wall_description: "A quick study in watercolor.", url: "https://www.clevelandart.org/art/x", current_location: null }; }) } }); });
  await ctx.route(/(images\.metmuseum\.org|openaccess-cdn\.clevelandart\.org)\/fake\//, (r) => r.fulfill({ status: 200, contentType: "image/jpeg", body: imgs[+(r.request().url().match(/p(\d)\.jpg/) || [0, 0])[1]] }));
  if (opts.backend) {
    await ctx.route("**/alpha/api.json", (r) => r.fulfill({ json: { base: "https://api.test" } }));
    await ctx.route("https://api.test/**", async (r) => {
      const q = r.request();
      const res = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: ["GET", "HEAD", "OPTIONS"].includes(q.method()) ? undefined : q.postData() }), opts.env);
      r.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    });
  } else await ctx.route("**/alpha/api.json", (r) => r.fulfill({ json: { base: null } }));
  return calls;
}
