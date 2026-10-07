"""Natural Earth 110m countries -> compact Equal Earth SVG paths for the Atlas view.
Natural Earth is public domain. Usage: python3 tools/build_world.py <ne_110m_admin_0_countries.geojson> <out.json>"""
import json, math, sys

A1, A2, A3, A4, M = 1.340264, -0.081106, 0.000893, 0.003796, math.sqrt(3) / 2
W = 1000.0
XMAX = 2.7066297319215575   # Equal Earth x at lon=180, lat=0
SCALE = W / (2 * XMAX)

def project(lon, lat):
    l, p = math.radians(lon), math.radians(lat)
    t = math.asin(M * math.sin(p)); t2 = t * t; t6 = t2 ** 3
    x = 2 * math.sqrt(3) * l * math.cos(t) / (3 * (9 * A4 * t6 * t2 + 7 * A3 * t6 + 3 * A2 * t2 + A1))
    y = t * (A4 * t6 * t2 + A3 * t6 + A2 * t2 + A1)
    return (x + XMAX) * SCALE, (1.3173627 - y) * SCALE

def ring_path(ring):
    pts, last = [], None
    for lon, lat in ring:
        x, y = project(lon, lat); q = (round(x, 1), round(y, 1))
        if q != last: pts.append(q); last = q
    if len(pts) < 4: return ""
    fmt = lambda v: ("%.1f" % v).rstrip("0").rstrip(".")
    return "M" + "L".join(f"{fmt(x)} {fmt(y)}" for x, y in pts) + "Z"

def main(src, out):
    gj = json.load(open(src))
    countries = []
    for f in gj["features"]:
        p = f["properties"]
        if p.get("CONTINENT") == "Antarctica": continue
        g = f["geometry"]; polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        d = "".join(ring_path(poly[0]) for poly in polys)   # outer rings only; holes don't matter at this scale
        iso = p.get("ISO_A2_EH") or p.get("ISO_A2")
        if iso in (None, "-99"): iso = p.get("ADM0_A3")
        lon, lat = p.get("LABEL_X"), p.get("LABEL_Y")
        cx, cy = project(lon, lat) if lon is not None else (None, None)
        countries.append({"id": iso, "name": p.get("NAME_EN") or p["NAME"], "continent": p["CONTINENT"], "region": p.get("SUBREGION"),
                          "d": d, "c": [round(cx, 1), round(cy, 1)] if cx is not None else None})
    h = project(0, -60)[1]   # crop below 60°S
    json.dump({"width": W, "height": round(h, 1), "projection": "Equal Earth", "source": "Natural Earth 110m (public domain)", "countries": countries},
              open(out, "w"), separators=(",", ":"), ensure_ascii=False)
    print(len(countries), "countries")

if __name__ == "__main__": main(*sys.argv[1:])
