// Keeps the feature inventory honest: every listed unit check exists, every feature has at least one check.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { FEATURES } from "./features.mjs";

const unitTitles = new Set(readdirSync(new URL(".", import.meta.url)).filter((f) => f.endsWith(".test.mjs"))
  .flatMap((f) => [...readFileSync(new URL(f, import.meta.url), "utf8").matchAll(/^test\("([^"]+)"/gm)].map((m) => m[1])));
const e2eIds = new Set([...readFileSync(new URL("./e2e.mjs", import.meta.url), "utf8").matchAll(/check\("([a-z.]+)"/g)].map((m) => m[1]));

test("every feature has a check and a unique id", () => {
  const ids = FEATURES.map((f) => f.id);
  assert.equal(ids.length, new Set(ids).size, "duplicate feature ids");
  for (const f of FEATURES) assert.ok(f.checks.length, `${f.id} has no checks`);
});
test("every unit check named in the inventory exists", () => {
  for (const f of FEATURES) for (const c of f.checks.filter((c) => c.startsWith("unit:")))
    assert.ok(unitTitles.has(c.slice(5)), `${f.id}: no unit test titled "${c.slice(5)}"`);
});
test("every browser check named in the inventory exists", () => {
  for (const f of FEATURES) for (const c of f.checks.filter((c) => c.startsWith("e2e:")))
    assert.ok(e2eIds.has(c.slice(4)), `${f.id}: tests/e2e.mjs has no check("${c.slice(4)}")`);
});
