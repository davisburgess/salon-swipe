// Runs the real Worker code against a real SQLite database with the production schema,
// through a thin adapter that mimics Cloudflare D1's API. Claude API calls are stubbed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../worker/src/index.js";

function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("../worker/schema.sql", import.meta.url), "utf8"));
  const fix = (sql) => sql.replace(/\?(\d+)/g, "?");   // D1 numbered params -> positional
  const stmt = (sql, args = []) => {
    // Expand numbered params to positional order
    const order = [...sql.matchAll(/\?(\d+)/g)].map((m) => +m[1] - 1);
    const vals = order.length ? order.map((i) => args[i]) : args;
    const s = db.prepare(fix(sql));
    return {
      bind: (...a) => stmt(sql, a),
      run: async () => s.run(...vals),
      first: async () => s.get(...vals) ?? null,
      all: async () => ({ results: s.all(...vals) }),
      _exec: () => s.run(...vals),
    };
  };
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { list.forEach((x) => x._exec()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } }, raw: db };
}

const ORIGIN = "https://davisburgess.github.io";
const env = (extra = {}) => ({ DB: d1(), ALLOWED_ORIGINS: `${ORIGIN},http://localhost:8123`, ...extra });
const KEY = "abcdefghijklmnopqrstuvwx", KEY2 = "zyxwvutsrqponmlkjihgfedc";
const req = (path, { method = "POST", key = KEY, body, origin = ORIGIN } = {}) => new Request(`https://api.test${path}`, {
  method, headers: { "content-type": "application/json", origin, ...(key ? { authorization: `Bearer ${key}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const sw = (uid, v, t) => ({ uid, v, t, f: ["style|Realism"], a: { uid, title: uid } });

test("health is public and reports whether notes are configured", async () => {
  const r = await worker.fetch(req("/v1/health", { method: "GET", key: null }), env());
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, notes: false });
  assert.equal(r.headers.get("access-control-allow-origin"), ORIGIN);
});

test("CORS is limited to the app's own origins", async () => {
  const r = await worker.fetch(req("/v1/health", { method: "GET", origin: "https://evil.example" }), env());
  assert.equal(r.headers.get("access-control-allow-origin"), null);
  const pre = await worker.fetch(new Request("https://api.test/v1/sync", { method: "OPTIONS", headers: { origin: ORIGIN } }), env());
  assert.equal(pre.status, 204); assert.match(pre.headers.get("access-control-allow-headers"), /authorization/);
});

test("sync requires a well-formed key", async () => {
  const e = env();
  assert.equal((await worker.fetch(req("/v1/sync", { key: null, body: {} }), e)).status, 401);
  assert.equal((await worker.fetch(req("/v1/sync", { key: "short", body: {} }), e)).status, 401);
});

test("two devices converge; newest decision wins; other keys see nothing", async () => {
  const e = env();
  // Phone pushes two decisions
  let r = await (await worker.fetch(req("/v1/sync", { body: { cursor: 0, swipes: [sw("aic:1", 1, 100), sw("aic:2", -1, 100)] } }), e)).json();
  assert.equal(r.swipes.length, 2); const phoneCursor = r.cursor;
  // Laptop joins with the same key and one decision of its own, plus a newer verdict on aic:2
  r = await (await worker.fetch(req("/v1/sync", { body: { cursor: 0, swipes: [sw("aic:3", 2, 150), sw("aic:2", 2, 200)] } }), e)).json();
  const byUid = Object.fromEntries(r.swipes.map((s) => [s.uid, s]));
  assert.deepEqual(Object.keys(byUid).sort(), ["aic:1", "aic:2", "aic:3"]);
  assert.equal(byUid["aic:2"].v, 2);
  // An older verdict can't overwrite a newer one
  await worker.fetch(req("/v1/sync", { body: { cursor: 0, swipes: [sw("aic:2", -1, 50)] } }), e);
  // Phone pulls only what changed since its cursor
  r = await (await worker.fetch(req("/v1/sync", { body: { cursor: phoneCursor, swipes: [] } }), e)).json();
  const got = Object.fromEntries(r.swipes.map((s) => [s.uid, s.v]));
  assert.equal(got["aic:2"], 2); assert.equal(got["aic:3"], 2); assert.ok(!("aic:1" in got));
  // A different key is a different collection
  r = await (await worker.fetch(req("/v1/sync", { key: KEY2, body: { cursor: 0, swipes: [] } }), e)).json();
  assert.equal(r.swipes.length, 0);
});

test("meta is last-writer-wins by timestamp, and removals delete", async () => {
  const e = env();
  await worker.fetch(req("/v1/sync", { body: { cursor: 0, swipes: [sw("aic:9", 1, 1)], meta: { t: 10, settings: { tone: "critic" } } } }), e);
  let r = await (await worker.fetch(req("/v1/sync", { body: { cursor: 0, meta: { t: 5, settings: { tone: "friend" } } } }), e)).json();
  assert.equal(r.meta.settings.tone, "critic");
  r = await (await worker.fetch(req("/v1/sync", { body: { cursor: 0, removed: ["aic:9"] } }), e)).json();
  assert.equal(r.swipes.length, 0);
});

test("oversized pushes are refused", async () => {
  const e = env();
  const many = Array.from({ length: 601 }, (_, i) => sw(`aic:${i}`, 1, 1));
  assert.equal((await worker.fetch(req("/v1/sync", { body: { cursor: 0, swipes: many } }), e)).status, 413);
});

test("notes call Claude with the taste summary, parse JSON, and are rate limited", async () => {
  const e = env({ ANTHROPIC_API_KEY: "test-key", NOTES_MODEL: "claude-sonnet-5-5" });
  const realFetch = globalThis.fetch; let sent = null;
  globalThis.fetch = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ content: [{ type: "text", text: '{"title":"Light first","note":"You chase light."}' }] }), { status: 200 });
  };
  try {
    const r = await worker.fetch(req("/v1/notes", { body: { facts: { likes: { Movement: [{ value: "Impressionism" }] } }, tone: "docent", level: "Docent" } }), e);
    assert.equal(r.status, 200); assert.deepEqual(await r.json(), { title: "Light first", text: "You chase light." });
    assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
    assert.equal(sent.init.headers["x-api-key"], "test-key");
    assert.equal(sent.body.model, "claude-sonnet-5-5");
    assert.match(sent.body.system, /gallery talk/); assert.match(sent.body.messages[0].content, /Impressionism/);
    for (let i = 0; i < 24; i++) await worker.fetch(req("/v1/notes", { body: { facts: {} } }), e);
    assert.equal((await worker.fetch(req("/v1/notes", { body: { facts: {} } }), e)).status, 429);
  } finally { globalThis.fetch = realFetch; }
});

test("account deletion erases everything for that key only", async () => {
  const e = env();
  await worker.fetch(req("/v1/sync", { body: { cursor: 0, swipes: [sw("aic:1", 1, 1)] } }), e);
  await worker.fetch(req("/v1/sync", { key: KEY2, body: { cursor: 0, swipes: [sw("aic:5", 1, 1)] } }), e);
  assert.equal((await worker.fetch(req("/v1/account", { method: "DELETE" }), e)).status, 200);
  const left = e.DB.raw.prepare("SELECT account, uid FROM swipes").all();
  assert.equal(left.length, 1); assert.equal(left[0].uid, "aic:5");
});
