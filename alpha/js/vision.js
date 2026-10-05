// Reads a tiny copy of the image and measures what the eye responds to before it reads a label:
// overall brightness, color intensity, warm vs cool, and how busy the surface is.
// Needs the museum's image server to allow cross-origin reads; when it doesn't, we simply skip it.

export function measure(px, w, h) {
  let sb = 0, ss = 0, sw = 0, n = 0, sr = 0, sg = 0, sbl = 0;
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    const s = mx === mn ? 0 : (l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn));
    lum[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sb += lum[p]; ss += s; sw += r - b; sr += r; sg += g; sbl += b; n++;
  }
  let edges = 0, en = 0;
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x;
    edges += Math.abs(lum[i] - lum[i + 1]) + Math.abs(lum[i] - lum[i + w]); en++;
  }
  const hsl = rgbToHsl(sr / n, sg / n, sbl / n);
  return { bright: sb / n, sat: ss / n, warm: sw / n, edges: en ? edges / en : 0, hsl };
}

function rgbToHsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

const cache = new Map();
export function analyze(item, ms = 6000) {
  if (cache.has(item.uid)) return cache.get(item.uid);
  const url = item.src === "aic" ? item.image.replace("/full/843,/", "/full/!64,64/") : item.image;
  const p = new Promise((resolve) => {
    const img = new Image();
    const done = (v) => { clearTimeout(t); resolve(v); };
    const t = setTimeout(() => done(null), ms);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const W = 40, H = Math.max(8, Math.round(40 / ((img.naturalWidth / img.naturalHeight) || 1)));
        const c = document.createElement("canvas"); c.width = W; c.height = Math.min(H, 80);
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, c.width, c.height);
        done(measure(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height));
      } catch (e) { done(null); }   // tainted canvas: the server didn't allow cross-origin reads
    };
    img.onerror = () => done(null);
    img.src = url;
  });
  cache.set(item.uid, p);
  return p;
}
