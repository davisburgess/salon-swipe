// Nightly check against the REAL museum APIs, using the app's own adapters. Run on GitHub (the build workspace can't reach them).
// Fails loudly if a museum changes its data format or stops serving public-domain images.
import { search, details, health } from "../alpha/js/sources.js";

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
await probe("cma", "Impressionism");
await probe("cma", "", { browse: true });
if (aic[0]) {
  try { const d = await details(aic[0]); out.push(`${d.paras.length ? "PASS" : "WARN"} aic  wall text: ${d.paras.length} paragraphs, on view: ${d.onView}`); }
  catch (e) { failed++; out.push(`FAIL aic  wall text: ${e.message}`); }
}
console.log(out.join("\n"));
process.exit(failed ? 1 : 0);
