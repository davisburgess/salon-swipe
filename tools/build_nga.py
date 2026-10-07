#!/usr/bin/env python3
"""Build the National Gallery of Art collection shards for Picture Plane.

Reads the NGA Open Data CSVs (https://github.com/NationalGalleryOfArt/opendata) and writes
alpha/data/nga/index.json plus shard-NNN.json files: open-access works with a primary image,
compacted to the fields the app uses. Usage: python3 tools/build_nga.py <opendata/data dir>
"""
import csv, json, os, random, re, sys, collections

csv.field_size_limit(sys.maxsize)
SRC = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "alpha", "data", "nga")
SHARD = 400
KEEP = {"Painting": None, "Sculpture": None, "Drawing": None, "Photograph": None, "Decorative Art": None, "Print": 6000}
STYLE = {"Impressionist": "Impressionism", "Post-Impressionist": "Post-Impressionism", "Realist": "Realism", "Romantic": "Romanticism",
         "Neoclassic": "Neoclassicism", "Abstract Expressionist": "Abstract Expressionism", "Surrealist": "Surrealism",
         "German Expressionist": "Expressionism", "Fauve": "Fauvism", "Cubist": "Cubism", "Symbolist": "Symbolism", "Pop": "Pop Art",
         "Minimalist": "Minimalism", "Naive": "Naive art", "Qing": "Qing dynasty", "Kangxi": "Qing dynasty", "Abstraction": "Abstraction"}

def rows(name):
    with open(os.path.join(SRC, name), newline="", encoding="utf-8") as f:
        yield from csv.DictReader(f)

def clean(s, n=None):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    return s[:n].rstrip() + "…" if n and len(s) > n else s

images = {r["depictstmsobjectid"]: r for r in rows("published_images.csv") if r["openaccess"] == "1" and r["viewtype"] == "primary"}
objects = {r["objectid"]: r for r in rows("objects.csv") if r["objectid"] in images and r["classification"] in KEEP}

artist = {}
for r in rows("objects_constituents.csv"):
    if r["objectid"] in objects and r["roletype"] == "artist" and r["role"] == "artist":
        cur = artist.get(r["objectid"])
        if not cur or int(r["displayorder"] or 99) < int(cur["displayorder"] or 99): artist[r["objectid"]] = r
people = {r["constituentid"]: r for r in rows("constituents.csv")}
style, place = {}, {}
for r in rows("objects_terms.csv"):
    if r["objectid"] not in objects: continue
    if r["termtype"] == "Style" and r["objectid"] not in style: style[r["objectid"]] = STYLE.get(r["term"], r["term"])
    elif r["termtype"] == "Place Executed" and r["objectid"] not in place: place[r["objectid"]] = r["term"]
    elif r["termtype"] == "School" and r["objectid"] not in place: place.setdefault("school:" + r["objectid"], r["term"])
dims = collections.defaultdict(dict)
for r in rows("objects_dimensions.csv"):
    if r["objectid"] in objects and r["unitname"] == "centimeters" and r["dimensiontype"] in ("height", "width"):
        d = dims[r["objectid"]]
        rank = 0 if r["element"] in ("overall", "painted surface", "image") else 1 if r["element"] in ("sheet", "plate") else 2
        if r["dimensiontype"] not in d or rank < d[r["dimensiontype"]][1]: d[r["dimensiontype"]] = (float(r["dimension"]), rank)

out = []
for oid, o in objects.items():
    im = images[oid]
    a = artist.get(oid); p = people.get(a["constituentid"]) if a else None
    name = clean(p["forwarddisplayname"]) if p else clean(o["attribution"])
    if name.lower().startswith("anonymous"): name = ""
    nat, dd = (clean(p["nationality"]), clean(p["displaydate"])) if p else ("", "")
    bio = dd if nat and dd.startswith(nat) else ", ".join(x for x in [nat, dd] if x)   # displaydate usually already leads with nationality
    w, h = int(im["width"] or 0), int(im["height"] or 0)
    d = dims.get(oid, {})
    rec = {"i": int(oid), "t": clean(o["title"], 160) or "Untitled", "a": name, "b": bio, "d": clean(o["displaydate"]),
           "y": int(o["beginyear"]) if (o["beginyear"] or "").lstrip("-").isdigit() else None, "m": clean(o["medium"], 120),
           "k": o["classification"], "s": style.get(oid, ""), "p": place.get(oid) or place.get("school:" + oid, ""),
           "c": clean(o["creditline"], 140), "u": im["uuid"], "r": round(w / h, 4) if w and h else None,
           "x": clean(im["assistivetext"], 160)}
    if "height" in d and "width" in d: rec["h"], rec["w"] = round(d["height"][0], 1), round(d["width"][0], 1)
    out.append({k: v for k, v in rec.items() if v not in ("", None)})

# Cap prints with a fixed seed (they outnumber everything else), keeping only attributed, dated ones.
random.seed(7)
final = []
for kind, cap in KEEP.items():
    group = [r for r in out if r["k"] == kind and (kind != "Print" or (r.get("a") and r.get("y")))]
    random.shuffle(group)
    final += group[:cap] if cap else group
random.shuffle(final)

os.makedirs(OUT, exist_ok=True)
for f in os.listdir(OUT):
    if f.startswith("shard-"): os.remove(os.path.join(OUT, f))
styles, terms = collections.defaultdict(list), collections.defaultdict(list)
for n, rec in enumerate(final):
    if rec.get("s"): styles[rec["s"]].append(n); terms[rec["s"]].append(n)
    if rec.get("p"): terms[rec["p"]].append(n)
    if rec.get("k"): terms[rec["k"]].append(n)
for s in range(0, len(final), SHARD):
    with open(os.path.join(OUT, f"shard-{s // SHARD:03d}.json"), "w", encoding="utf-8") as f:
        json.dump(final[s:s + SHARD], f, ensure_ascii=False, separators=(",", ":"))
index = {"source": "National Gallery of Art Open Data", "count": len(final), "shardSize": SHARD, "shards": (len(final) + SHARD - 1) // SHARD,
         "kinds": collections.Counter(r["k"] for r in final),
         # term -> record numbers (record n lives in shard n // shardSize); lets the app search by movement, place or type
         "terms": {k: v for k, v in sorted(terms.items(), key=lambda kv: -len(kv[1])) if len(v) >= 5}}
with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(final)} works in {index['shards']} shards; kinds {dict(index['kinds'])}; {len(index['terms'])} search terms")
