#!/usr/bin/env python3
"""Build Cleveland Museum of Art shards for Picture Plane from its open-access dataset.

Cleveland's live API doesn't send CORS headers, so browsers can't call it. Its full dataset is published at
https://github.com/ClevelandMuseumArt/openaccess (data.json via Git LFS). This keeps CC0 works with images and
writes alpha/data/cma/index.json + shard-NNN.json in the same format as the National Gallery build.
Usage: python3 tools/build_cma.py <path to data.json>
"""
import json, os, random, re, sys, collections

SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "alpha", "data", "cma")
SHARD = 400
CAPS = {"Painting": None, "Drawing": None, "Sculpture": None, "Photograph": 2500, "Print": 5000, "Textile": 1500,
        "Ceramic": 1200, "Metalwork": 800, "Glass": 400, "Jewelry": 300, "Miniature": None, "Manuscript": 600, "Furniture and woodwork": 400}
DEFAULT_CAP = 250

def clean(s, n=None):
    s = re.sub(r"<[^>]+>", " ", s or ""); s = re.sub(r"\s+", " ", s).strip()
    return s[:n].rstrip() + "…" if n and len(s) > n else s

data = json.load(open(SRC, encoding="utf-8"))
recs = []
for r in data:
    web = ((r.get("images") or {}).get("web") or {})
    if r.get("share_license_status") != "CC0" or not web.get("url"): continue
    c0 = (r.get("creators") or [{}])[0] or {}
    desc = c0.get("description") or ""
    artist = clean(re.sub(r"\s*\(.*$", "", desc)); bio = clean((re.search(r"\((.*)\)", desc) or [None, ""])[1])
    if artist.lower().startswith(("unknown", "anonymous")): artist = ""
    un = ((r.get("dimensions") or {}).get("unframed") or {})
    w, h = int(web.get("width") or 0), int(web.get("height") or 0)
    text = [clean(x, 700) for x in (r.get("wall_description"), r.get("description"), r.get("did_you_know"), r.get("fun_fact")) if x]
    rec = {"i": r["id"], "t": clean(r.get("title"), 160) or "Untitled", "a": artist, "b": bio, "d": clean(r.get("creation_date")),
           "y": r.get("creation_date_earliest"), "m": clean(r.get("technique"), 120), "k": r.get("type") or "",
           "p": clean(", ".join(r.get("culture") or [])[:80]), "c": clean(r.get("creditline"), 140),
           "img": web["url"], "imgL": ((r.get("images") or {}).get("print") or {}).get("url") or "",
           "r": round(w / h, 4) if w and h else None, "url": r.get("url") or "", "v": clean(r.get("current_location")),
           "col": clean(r.get("collection")), "wt": [t for i, t in enumerate(text) if t and t not in text[:i]][:3]}
    if un.get("height") and un.get("width"): rec["h"], rec["w"] = round(un["height"] * 100, 1), round(un["width"] * 100, 1)
    recs.append({k: v for k, v in rec.items() if v not in ("", None, [])})

random.seed(7)
by = collections.defaultdict(list)
for rec in recs: by[rec.get("k", "")].append(rec)
final = []
for kind, group in by.items():
    cap = CAPS.get(kind, DEFAULT_CAP)
    random.shuffle(group)
    final += group if cap is None else group[:cap]
random.shuffle(final)

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.startswith("shard-"): os.remove(os.path.join(OUT, f))
terms = collections.defaultdict(list)
for n, rec in enumerate(final):
    for key in ("k", "col"):
        if rec.get(key): terms[rec[key]].append(n)
    for part in re.split(r",\s*", rec.get("p", "")):   # "China, Ming dynasty (1368-1644)" -> both parts searchable
        part = re.sub(r"\s*\(.*?\)", "", part).strip()
        if part: terms[part].append(n)
for s in range(0, len(final), SHARD):
    with open(os.path.join(OUT, f"shard-{s // SHARD:03d}.json"), "w", encoding="utf-8") as f:
        json.dump(final[s:s + SHARD], f, ensure_ascii=False, separators=(",", ":"))
index = {"source": "Cleveland Museum of Art Open Access", "count": len(final), "shardSize": SHARD, "shards": (len(final) + SHARD - 1) // SHARD,
         "kinds": collections.Counter(r.get("k", "") for r in final), "terms": {k: v for k, v in sorted(terms.items(), key=lambda kv: -len(kv[1])) if len(v) >= 5}}
with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(final)} works in {index['shards']} shards; kinds {dict(index['kinds'].most_common(12))}; {len(index['terms'])} search terms")
