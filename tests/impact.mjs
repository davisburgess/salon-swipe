// Which features does a release touch? Usage: node tests/impact.mjs [base-ref]   (default: HEAD~1)
// Prints a markdown checklist: impacted features, the automated checks that cover them, and what to eyeball on a phone.
import { execSync } from "node:child_process";
import { FEATURES } from "./features.mjs";

const base = process.argv[2] || "HEAD~1";
const sh = (c) => execSync(c, { encoding: "utf8" });
const files = sh(`git diff --name-only ${base} -- alpha worker`).split("\n").filter(Boolean);

// Map changed lines in app.js to its named sections.
function appSections() {
  if (!files.includes("alpha/js/app.js")) return new Set();
  const src = sh("cat alpha/js/app.js").split("\n");
  const marks = [];
  src.forEach((l, i) => { const m = l.match(/^\/\* ---------- (.+?) ---------- \*\//); if (m) marks.push({ line: i + 1, name: m[1] }); });
  const sectionAt = (n) => { let s = "state"; for (const m of marks) if (m.line <= n) s = m.name; return s; };
  const hunks = sh(`git diff -U0 ${base} -- alpha/js/app.js`).split("\n").filter((l) => l.startsWith("@@"));
  const out = new Set();
  for (const h of hunks) {
    const m = h.match(/\+(\d+)(?:,(\d+))?/); if (!m) continue;
    const start = +m[1], len = m[2] === undefined ? 1 : +m[2];
    for (let n = start; n <= start + Math.max(0, len - 1); n++) out.add(sectionAt(n));
  }
  return out;
}
const sections = appSections();
const touched = (w) => w.startsWith("app.js#") ? sections.has(w.slice(7)) : files.some((f) => f === w || (w.endsWith("/") && f.startsWith(w)));
const hit = FEATURES.filter((f) => f.where.some(touched));

console.log(`## Impact of changes since ${base}\n`);
console.log(`Files: ${files.join(", ") || "none"}${sections.size ? `\napp.js sections: ${[...sections].join(", ")}` : ""}\n`);
if (!hit.length) { console.log("No user-facing features touched."); process.exit(0); }
console.log(`### Features to re-verify (${hit.length} of ${FEATURES.length})`);
for (const f of hit) console.log(`- **${f.name}** (${f.id}): ${f.checks.join("; ")}`);
const phone = hit.filter((f) => f.phone);
if (phone.length) { console.log(`\n### On your phone`); for (const f of phone) console.log(`- ${f.phone}`); }
