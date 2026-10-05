// Picture Plane API (Cloudflare Worker + D1).
//   GET    /v1/health    -> { ok, notes }
//   POST   /v1/sync      -> push changed decisions, pull everything newer than your cursor
//   POST   /v1/notes     -> a Curator's Note written by Claude from a taste summary
//   DELETE /v1/account   -> erase everything for this collection key
// Auth: "Authorization: Bearer <collection key>". The server stores only the key's SHA-256.

const MAX_BODY = 2_000_000, MAX_SWIPES = 600, MAX_PULL = 2000, NOTES_PER_DAY = 25, SYNCS_PER_DAY = 3000;
const TONES = {
  cheeky: "Dry, witty, gently teasing, like a curator friend who knows too much. Never mean. Short sentences.",
  docent: "Warm, clear and informative, like a good gallery talk. Gloss any term of art in a few words.",
  critic: "Direct, formal analysis in the manner of an art-school critique: composition, color, facture. Precise, no flattery.",
  friend: "Upbeat and encouraging, like a friend who just discovered art too. Plain words.",
};

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

function cors(req, env) {
  const origin = req.headers.get("origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return ok ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type", "access-control-max-age": "86400", vary: "origin" } : { vary: "origin" };
}

async function accountId(req) {
  const m = (req.headers.get("authorization") || "").match(/^Bearer ([A-Za-z0-9_-]{20,64})$/);
  if (!m) return null;
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(m[1]));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function readJSON(req) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) throw Object.assign(new Error("Request too large."), { status: 413 });
  const text = await req.text();
  if (text.length > MAX_BODY) throw Object.assign(new Error("Request too large."), { status: 413 });
  try { return text ? JSON.parse(text) : {}; } catch (e) { throw Object.assign(new Error("Body isn't valid JSON."), { status: 400 }); }
}

const today = () => new Date().toISOString().slice(0, 10);
async function bump(db, account, kind, limit) {
  const day = today();
  await db.prepare("INSERT INTO usage (account, day, kind, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(account, day, kind) DO UPDATE SET n = n + 1").bind(account, day, kind).run();
  const row = await db.prepare("SELECT n FROM usage WHERE account = ?1 AND day = ?2 AND kind = ?3").bind(account, day, kind).first();
  return (row && row.n) <= limit;
}

async function ensureAccount(db, id) {
  const now = Date.now();
  await db.prepare("INSERT INTO accounts (id, created, last_seen, seq) VALUES (?1, ?2, ?2, 0) ON CONFLICT(id) DO UPDATE SET last_seen = ?2").bind(id, now).run();
}

async function sync(req, env, id) {
  const db = env.DB;
  if (!(await bump(db, id, "sync", SYNCS_PER_DAY))) return json({ error: "Too many syncs today. Try again tomorrow." }, 429);
  const body = await readJSON(req);
  const incoming = Array.isArray(body.swipes) ? body.swipes : [];
  if (incoming.length > MAX_SWIPES) return json({ error: `Send at most ${MAX_SWIPES} decisions per request.` }, 413);
  await ensureAccount(db, id);

  const valid = incoming.filter((s) => s && typeof s.uid === "string" && s.uid.length < 80 && Number.isFinite(s.t) && Array.isArray(s.f));
  if (valid.length) {
    const acct = await db.prepare("SELECT seq FROM accounts WHERE id = ?1").bind(id).first();
    let seq = (acct && acct.seq) || 0;
    const stmts = valid.map((s) => {
      seq++;
      return db.prepare(`INSERT INTO swipes (account, uid, t, seq, body) VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(account, uid) DO UPDATE SET t = excluded.t, seq = excluded.seq, body = excluded.body WHERE excluded.t >= swipes.t`)
        .bind(id, s.uid, Math.floor(s.t), seq, JSON.stringify(s));
    });
    stmts.push(db.prepare("UPDATE accounts SET seq = ?2 WHERE id = ?1").bind(id, seq));
    await db.batch(stmts);
  }
  const removed = (Array.isArray(body.removed) ? body.removed : []).filter((u) => typeof u === "string").slice(0, 200);
  if (removed.length) await db.batch(removed.map((u) => db.prepare("DELETE FROM swipes WHERE account = ?1 AND uid = ?2").bind(id, u)));

  if (body.meta && Number.isFinite(body.meta.t)) {
    const m = JSON.stringify(body.meta);
    if (m.length < 500_000) await db.prepare(`INSERT INTO meta (account, t, body) VALUES (?1, ?2, ?3)
      ON CONFLICT(account) DO UPDATE SET t = excluded.t, body = excluded.body WHERE excluded.t > meta.t`).bind(id, body.meta.t, m).run();
  }

  const cursor = Number.isFinite(body.cursor) ? body.cursor : 0;
  const rows = await db.prepare("SELECT body, seq FROM swipes WHERE account = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3").bind(id, cursor, MAX_PULL).all();
  const list = rows.results || [];
  const acct = await db.prepare("SELECT seq FROM accounts WHERE id = ?1").bind(id).first();
  const meta = await db.prepare("SELECT body FROM meta WHERE account = ?1").bind(id).first();
  return json({
    swipes: list.map((r) => JSON.parse(r.body)),
    cursor: list.length === MAX_PULL ? list[list.length - 1].seq : (acct ? acct.seq : cursor),
    more: list.length === MAX_PULL,
    meta: meta ? JSON.parse(meta.body) : null,
  });
}

function notePrompt(facts, tone, level) {
  const voice = TONES[tone] || TONES.cheeky;
  const system = `You write short Curator's Notes for Picture Plane, an app where someone swipes on public-domain artworks to learn their own taste.
Voice: ${voice}
Rules:
- Use ONLY the facts in the user's taste summary. Never invent artworks, artists, dates or statistics that aren't there.
- You may add widely accepted art-historical context about a movement or medium named in the summary (one clause, no dates you aren't sure of).
- Name at least one concrete pattern and one tension or surprise (something liked versus passed, or a hesitation).
- End with one specific suggestion of what to look at next, framed as an invitation.
- 70 to 110 words. Plain text, no lists, no emoji, no hashtags.
Return JSON only: {"title": "...", "note": "..."}. The title is under 8 words${level ? ` and should mark reaching the level "${level}"` : ""}.`;
  return { system, user: `Taste summary (JSON):\n${JSON.stringify(facts).slice(0, 6000)}` };
}

async function notes(req, env, id) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: "Notes aren't set up on this server." }, 503);
  const db = env.DB;
  await ensureAccount(db, id);
  if (!(await bump(db, id, "notes", NOTES_PER_DAY))) return json({ error: "That's today's notes. More tomorrow." }, 429);
  const body = await readJSON(req);
  if (!body.facts || typeof body.facts !== "object") return json({ error: "Missing taste summary." }, 400);
  const { system, user } = notePrompt(body.facts, body.tone, typeof body.level === "string" ? body.level.slice(0, 30) : null);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: env.NOTES_MODEL || "claude-sonnet-5-5", max_tokens: 500, system, messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) return json({ error: `The note writer is unavailable (${r.status}).` }, 502);
  const out = await r.json();
  const text = (out.content || []).filter((c) => c.type === "text").map((c) => c.text).join("").trim();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { const m = text.match(/\{[\s\S]*\}/); if (m) try { parsed = JSON.parse(m[0]); } catch (e2) {} }
  if (!parsed || !parsed.note) return json({ title: "A note from the curator", text: text.slice(0, 1200) });
  return json({ title: String(parsed.title || "A note from the curator").slice(0, 120), text: String(parsed.note).slice(0, 1200) });
}

async function erase(env, id) {
  await env.DB.batch(["swipes", "meta", "usage"].map((t) => env.DB.prepare(`DELETE FROM ${t} WHERE account = ?1`).bind(id))
    .concat([env.DB.prepare("DELETE FROM accounts WHERE id = ?1").bind(id)]));
  return json({ ok: true });
}

export default {
  async fetch(req, env) {
    const c = cors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: c });
    const url = new URL(req.url);
    try {
      let res;
      if (url.pathname === "/v1/health" && req.method === "GET") res = json({ ok: true, notes: !!env.ANTHROPIC_API_KEY });
      else {
        const id = await accountId(req);
        if (!id) res = json({ error: "Missing or malformed collection key." }, 401);
        else if (url.pathname === "/v1/sync" && req.method === "POST") res = await sync(req, env, id);
        else if (url.pathname === "/v1/notes" && req.method === "POST") res = await notes(req, env, id);
        else if (url.pathname === "/v1/account" && req.method === "DELETE") res = await erase(env, id);
        else res = json({ error: "Not found." }, 404);
      }
      for (const [k, v] of Object.entries(c)) res.headers.set(k, v);
      return res;
    } catch (e) {
      const res = json({ error: e.status ? e.message : "Something went wrong on the server." }, e.status || 500);
      for (const [k, v] of Object.entries(c)) res.headers.set(k, v);
      return res;
    }
  },
};
