/**
 * DoctorPedAI — Pre-processing מופרד לתמונות (Dermatology / Radiology)
 *
 * קלט: ImageData-like `{ width, height, data }` (RGBA, 4 בתים לפיקסל).
 * אין DOM, אין רשת, אין ניחוש מ"מ. כישלון → `{ ok:false }`.
 */

import { otsuThreshold } from '../../skinMorphometry.js';

const round2 = (x) => (x == null ? null : Math.round(Number(x) * 100) / 100);

export function isImageDataLike(img) {
  if (!img || typeof img !== 'object') return false;
  const w = Number(img.width);
  const h = Number(img.height);
  const data = img.data;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 8 || h < 8) return false;
  if (!data || data.length < w * h * 4) return false;
  return true;
}

export function failClosed(reason, extra = {}) {
  return { ok: false, reason, verification_status: 'unavailable', ...extra };
}

/** בהירות 0..255 לפיקסל. */
export function luminanceAt(data, p) {
  const i = p * 4;
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

export function toGrayscale(imageData) {
  if (!isImageDataLike(imageData)) return failClosed('invalid_image');
  const { width: w, height: h, data } = imageData;
  const gray = new Uint8Array(w * h);
  const hist = new Array(256).fill(0);
  for (let p = 0; p < gray.length; p++) {
    const g = Math.max(0, Math.min(255, Math.round(luminanceAt(data, p))));
    gray[p] = g;
    hist[g] += 1;
  }
  return { ok: true, width: w, height: h, gray, hist };
}

export function histogramEntropy(hist) {
  const total = hist.reduce((s, x) => s + x, 0);
  if (!total) return 0;
  let e = 0;
  for (const c of hist) {
    if (!c) continue;
    const p = c / total;
    e -= p * Math.log2(p);
  }
  return round2(e);
}

/**
 * מסכת אוטסו. `invert`: true → כהה יותר מהסף (נגע עור); false → בהיר יותר (עצם ברנטגן).
 */
export function otsuMaskFromGray(gray, hist, { invert = true } = {}) {
  if (!gray?.length || !hist) return failClosed('no_histogram');
  const thr = otsuThreshold(hist);
  const mask = new Uint8Array(gray.length);
  let area = 0;
  for (let i = 0; i < gray.length; i++) {
    const on = invert ? gray[i] < thr : gray[i] > thr;
    if (on) {
      mask[i] = 1;
      area += 1;
    }
  }
  const coverage = area / gray.length;
  return { ok: true, mask, threshold: thr, area, coverage: round2(coverage) };
}

/**
 * רכיבים קשורים 4-כיווניים. מחזיר לפי שטח יורד.
 */
export function connectedComponents(mask, w, h, { minArea = 4 } = {}) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const comps = [];
  const stack = [];

  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;

    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p / w) | 0;
      area += 1;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbors = [p - 1, p + 1, p - w, p + w];
      for (const q of neighbors) {
        if (q < 0 || q >= n || seen[q] || !mask[q]) continue;
        const qx = q % w;
        const qy = (q / w) | 0;
        if (Math.abs(qx - x) + Math.abs(qy - y) !== 1) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }

    if (area >= minArea) {
      comps.push({
        area,
        cx: sx / area,
        cy: sy / area,
        minX,
        maxX,
        minY,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }

  comps.sort((a, b) => b.area - a.area);
  return comps;
}

/**
 * Pre-processing מופרד לפי מודאליות.
 * דרמטולוגיה: מסכת נגע כהה. רדיולוגיה: בהירות + היסטוגרמת צפיפויות יחסיות.
 */
export function preprocessImage(imageData, { mode = 'dermatology' } = {}) {
  const grayPack = toGrayscale(imageData);
  if (!grayPack.ok) return grayPack;

  const { width: w, height: h, gray, hist } = grayPack;
  const entropy = histogramEntropy(hist);
  if (entropy < 0.4) {
    return failClosed('image_too_uniform', { entropy, width: w, height: h });
  }

  if (mode === 'radiology') {
    const bone = otsuMaskFromGray(gray, hist, { invert: false });
    const dark = otsuMaskFromGray(gray, hist, { invert: true });
    return {
      ok: true,
      mode: 'radiology',
      width: w,
      height: h,
      gray,
      hist,
      entropy,
      bone_mask: bone.ok ? bone : null,
      lucent_mask: dark.ok ? dark : null,
      note_he: 'צפיפויות יחסיות בפיקסלים בלבד — אין יחידות Hounsfield ואין מ״מ.',
      verification_status: 'measured',
    };
  }

  // דרמטולוגיה: כמו skinMorphometry — כהה יותר = ציון נגע גבוה יותר, ואז Otsu.
  const lesionScore = new Uint8Array(gray.length);
  const lesionHist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) {
    const s = 255 - gray[i];
    lesionScore[i] = s;
    lesionHist[s] += 1;
  }
  const lesion = otsuMaskFromGray(lesionScore, lesionHist, { invert: false });
  if (!lesion.ok) return lesion;
  if (lesion.coverage < 0.01 || lesion.coverage > 0.9) {
    return failClosed('segmentation_unreliable', { coverage: lesion.coverage, entropy });
  }

  return {
    ok: true,
    mode: 'dermatology',
    width: w,
    height: h,
    gray,
    hist,
    entropy,
    lesion_mask: lesion.mask,
    lesion_area: lesion.area,
    lesion_coverage: lesion.coverage,
    lesion_threshold: lesion.threshold,
    note_he: 'מאפיינים מורפולוגיים יחסיים. ללא סמן קנה-מידה אין מ״מ מוחלטים.',
    verification_status: 'measured',
  };
}

export { round2 };
