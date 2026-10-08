// Builds alpha/data/digest.json: for every work in the on-device collections, the few facts quests filter on
// (country, continent, school, type, movement, year), stored as columns of small numbers. With it the app can count
// exactly how many works fit a quest before recommending it, and fetch exactly those works during the quest.
// Uses the app's own code (normalizeStatic, quests.facts), so counts match what quests accept.
// Usage: node tools/build_digest.mjs   (run after the collection builders)
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { normalizeStatic } from "../alpha/js/sources.js";
import { facts } from "../alpha/js/quests.js";

const dicts = { iso: [], cont: [], school: [], type: [], mov: [] }, idx = { iso: new Map(), cont: new Map(), school: new Map(), type: new Map(), mov: new Map() };
const code = (k, v) => { if (v == null) return -1; let i = idx[k].get(v); if (i == null) { i = dicts[k].length; dicts[k].push(v); idx[k].set(v, i); } return i; };
const out = { version: 1, built: new Date().toISOString().slice(0, 10), dicts, srcs: {} };
for (const src of ["nga", "cma"]) {
  const dir = new URL(`../alpha/data/${src}/`, import.meta.url);
  const index = JSON.parse(readFileSync(new URL("index.json", dir)));
  const cols = { iso: [], cont: [], school: [], type: [], mov: [], year: [] };
  for (let n = 0; n < index.shards; n++) {
    const recs = JSON.parse(readFileSync(new URL(`shard-${String(n).padStart(3, "0")}.json`, dir)));
    if (n < index.shards - 1 && recs.length !== index.shardSize) throw new Error(`${src} shard ${n} has ${recs.length} records, expected ${index.shardSize}`);
    for (const r of recs) {
      const a = normalizeStatic(src, r) || {}, f = facts(a);
      cols.iso.push(code("iso", f.iso)); cols.cont.push(code("cont", f.cont)); cols.school.push(code("school", f.school));
      cols.type.push(code("type", f.type)); cols.mov.push(code("mov", f.movement)); cols.year.push(f.year == null ? null : f.year);
    }
  }
  out.srcs[src] = { count: cols.iso.length, shardSize: index.shardSize, shards: index.shards, cols };
  console.log(src, cols.iso.length, "works");
}
writeFileSync(new URL("../alpha/data/digest.json", import.meta.url), JSON.stringify(out));
console.log("digest.json", (JSON.stringify(out).length / 1024).toFixed(0), "KB");
