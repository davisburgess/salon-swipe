// Nightly check against the REAL museum APIs, using the app's own adapters. Run on GitHub (the build workspace can't reach them).
// Fails loudly if a museum changes its data format or stops serving public-domain images.
import { search, details, health } from "../alpha/js/sources.js";
import { readFile } from "node:fs/promises";

// The static collections (National Gallery, Cleveland) load from alpha/data next to the app; Node's fetch can't read file:// URLs.
const netFetch = globalThis.fetch;
globalThis.fetch = (u, o) => String(u).startsWith("file:") ? readFile(new URL(String(u))).then((b) => new Response(b)) : netFetch(u, o);

const out = []; let failed = 0;
async function probe(src, q, opts) {
  const t0 = Date.now();
  try {
    const items = await search(src, q, opts);
    const good = items.filter((a) => a.uid && a.title && a.image && /^https:/.test(a.image) && a.url);
    if (good.length < 3) throw new Error(`only ${good.length} usable works (of ${items.length})`);
    const img = await fetch(good[0].image, { method: "GET" });
    if (!img.ok || !/image\//.test(img.headers.get("content-type") || "")) throw new Error(`image ${good[0].image} -> ${img.status}`);
    const withDims = good.filter((a) => a.dimsCm).length, withMovement = good.filter((a) => a.movement).length;
    out.push(`PASS ${src.padEnd(4)} "${q || "(browse)"}": ${good.length} works, ${withDims} with size, ${withMovement} with movement, ${Date.now() - t0} ms`);
    return good;
  } catch (e) { failed++; out.push(`FAIL ${src.padEnd(4)} "${q || "(browse)"}": ${e.message} (${health[src].last || ""})`); return []; }
}
const aic = await probe("aic", "Impressionism");
await probe("aic", "", { browse: true });
await probe("met", "Ukiyo-e");
await probe("met", "", { browse: true });
await probe("cma", "Egyptian");
await probe("cma", "", { browse: true });
await probe("nga", "Baroque");
await probe("nga", "", { browse: true });
await probe("wd", "Futurism");
await probe("wd", "portrait", { browse: true });
await probe("vam", "Mughal");
await probe("vam", "", { browse: true });
await probe("smk", "Eckersberg");
await probe("smk", "", { browse: true });
if (aic[0]) {
  try { const d = await details(aic[0]); out.push(`${d.paras.length ? "PASS" : "WARN"} aic  wall text: ${d.paras.length} paragraphs, on view: ${d.onView}`); }
  catch (e) { failed++; out.push(`FAIL aic  wall text: ${e.message}`); }
}
console.log(out.join("\n"));
// On GitHub, also post the results as one annotation so they're readable from the API without downloading logs.
if (process.env.GITHUB_ACTIONS) console.log(`::${failed ? "error" : "notice"} title=Live museum probe::${out.join("%0A")}`);
process.exit(failed ? 1 : 0);
