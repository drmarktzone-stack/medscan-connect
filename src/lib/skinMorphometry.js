/**
 * ============================================================================
 *  MedScan AI — Skin Lesion Morphometry (deterministic ABCDE, pure JS/canvas)
 * ============================================================================
 *  Measures the lesion in CODE instead of letting the model guess size/ABCDE.
 *  With a scale marker (ruler/sticker of known mm) it reports real millimetres;
 *  without one it reports relative indices only and flags scale_unknown.
 *
 *  Deterministic outputs: diameter, asymmetry index, border irregularity
 *  (compactness), colour-cluster count. The pure mask/vector helpers below are
 *  unit-testable; the canvas segmentation glue is browser-only.
 *
 *  ⚠️ If segmentation coverage is poor, returns { ok:false } — never a guessed
 *  measurement. Absolute mm are omitted unless a scale is provided.
 * ============================================================================
 */

/** Otsu threshold on a 0..255 histogram (256 bins). Returns the threshold. */
export function otsuThreshold(hist) {
  const total = hist.reduce((s, x) => s + x, 0);
  if (!total) return 128;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, maxVar = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; thr = t; }
  }
  return thr;
}

/** Border irregularity via isoperimetric compactness: perimeter² / (4π·area).
 *  1.0 = perfect circle; higher = more irregular. */
export function compactness(area, perimeter) {
  if (!area || area <= 0) return null;
  return round2((perimeter * perimeter) / (4 * Math.PI * area));
}

/** Asymmetry index from a binary mask (2D array of 0/1) about its centroid axes.
 *  Returns fraction of non-overlapping pixels when folded on each axis (0..1). */
export function asymmetryIndex(mask, w, h) {
  let area = 0, cx = 0, cy = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) { area++; cx += x; cy += y; }
  if (!area) return null;
  cx = Math.round(cx / area); cy = Math.round(cy / area);
  let mismatchV = 0, mismatchH = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = mask[y * w + x];
    const xm = 2 * cx - x;
    const ym = 2 * cy - y;
    const mirrV = xm >= 0 && xm < w ? mask[y * w + xm] : 0;
    const mirrH = ym >= 0 && ym < h ? mask[ym * w + x] : 0;
    if (v !== mirrV) mismatchV++;
    if (v !== mirrH) mismatchH++;
  }
  return round2(Math.min(1, ((mismatchV + mismatchH) / 2) / area));
}

/** Approximate perimeter of a binary mask (boundary pixel count). */
export function maskPerimeter(mask, w, h) {
  let p = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!mask[y * w + x]) continue;
    const edge =
      x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
      !mask[y * w + x - 1] || !mask[y * w + x + 1] ||
      !mask[(y - 1) * w + x] || !mask[(y + 1) * w + x];
    if (edge) p++;
  }
  return p;
}

/** Count distinct colour clusters among lesion pixels via coarse RGB quantization
 *  (bin size 64 → 4^3 possible cells). Melanoma "C" (colour variegation). */
export function colorClusters(rgbList, minFraction = 0.05) {
  if (!rgbList || !rgbList.length) return 0;
  const bins = new Map();
  for (const [r, g, b] of rgbList) {
    const key = `${r >> 6}-${g >> 6}-${b >> 6}`;
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  const total = rgbList.length;
  let count = 0;
  for (const v of bins.values()) if (v / total >= minFraction) count++;
  return count;
}

/**
 * Browser-only: measure a lesion from an <img>. Best-effort segmentation via
 * Otsu on a lesion-vs-skin channel. Returns { ok:false } if coverage is poor.
 * @param {object} opts { pxPerMm?:number }  scale from a detected/known marker
 */
export async function measureLesionFromImage(imgEl, { pxPerMm = null } = {}) {
  if (typeof document === "undefined" || !imgEl) return { ok: false, reason: "no_dom" };
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;
  if (!w || !h) return { ok: false, reason: "no_pixels" };
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0, w, h);
  let data;
  try { data = ctx.getImageData(0, 0, w, h).data; } catch { return { ok: false, reason: "tainted_canvas" }; }

  // Lesion score channel: lesions are usually darker/more saturated than skin.
  const hist = new Array(256).fill(0);
  const score = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const s = 255 - lum; // darker → higher lesion score
    score[p] = s; hist[s | 0]++;
  }
  const thr = otsuThreshold(hist);
  const mask = new Uint8Array(w * h);
  const rgb = [];
  let area = 0;
  for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) {
    if (score[p] > thr) {
      mask[p] = 1; area++;
      const i = p * 4;
      rgb.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  const coverage = area / (w * h);
  if (coverage < 0.01 || coverage > 0.9) {
    return { ok: false, reason: "segmentation_unreliable", coverage: round2(coverage) };
  }

  // Bounding box for a diameter estimate.
  let minX = w, maxX = 0, minY = h, maxY = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const diamPx = Math.max(maxX - minX, maxY - minY);
  const perim = maskPerimeter(mask, w, h);

  return {
    ok: true,
    scale_unknown: !pxPerMm,
    image_width_px: w,
    diameter_px: diamPx,
    diameter_mm: pxPerMm ? round2(diamPx / pxPerMm) : null,
    asymmetry_index: asymmetryIndex(mask, w, h),
    border_irregularity: compactness(area, perim),
    color_clusters: colorClusters(rgb),
    coverage: round2(coverage),
    measurement_source: "cv",
    note_he: pxPerMm ? null : "אין סמן קנה-מידה — הדיווח יחסי בלבד, ללא מ\"מ מוחלטים.",
  };
}

const round2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
