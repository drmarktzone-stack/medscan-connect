/**
 * ============================================================================
 *  MedScan AI — ECG Waveform Digitization (A2a, pure JS / browser canvas)
 * ============================================================================
 *  EXPERIMENTAL & FAIL-SAFE. Extracts the real waveform from an ECG image to
 *  MEASURE intervals in code instead of letting the model count boxes.
 *
 *  Phase A2a (this file): grid detection + calibration + trace extraction +
 *  R-peak detection → deterministic heart rate. Phase A2b (delineation →
 *  PR/QRS/QT) is scaffolded but returns null until validated.
 *
 *  ⚠️ SAFETY CONTRACT — this module NEVER silently overrides a measurement:
 *    - It returns { ok:false } unless the grid is detected AND trace coverage
 *      is sufficient AND calibration is plausible.
 *    - Consumers must treat ok:false as "no measurement" and fall back.
 *    - It is OPT-IN and not wired into runEcgEngine yet: it must first be
 *      validated against real ECG images (see /ecg-validate). Building it blind
 *      is fine precisely because it cannot affect output until enabled.
 *
 *  No CV library (no OpenCV) — pure ImageData math. The pure helpers below are
 *  unit-testable; the canvas glue is browser-only.
 * ============================================================================
 */

/** Dominant spacing (px) of a periodic signal via autocorrelation. Used to find
 *  the ECG grid pitch from a 1-D projection of grid-line intensity. */
export function dominantSpacing(proj, minLag = 4, maxLag = 60) {
  if (!proj || proj.length < maxLag * 2) return null;
  const n = proj.length;
  const mean = proj.reduce((s, x) => s + x, 0) / n;
  const c = proj.map((x) => x - mean);
  let best = null;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += c[i] * c[i + lag];
    if (acc > bestVal) {
      bestVal = acc;
      best = lag;
    }
  }
  // require the autocorrelation peak to be meaningfully above zero
  return bestVal > 0 ? best : null;
}

/** Simple, dependency-free R-peak detector on a 1-D signal (baseline-removed,
 *  rectified, threshold + refractory). Returns sample indices of peaks. */
export function detectRPeaks(signal, sampleRateHz, { refractoryMs = 200 } = {}) {
  if (!signal || !signal.length || !sampleRateHz) return [];
  const n = signal.length;
  // High-pass via moving-average baseline subtraction.
  const win = Math.max(1, Math.round(sampleRateHz * 0.15));
  const base = movingAverage(signal, win);
  const hp = signal.map((v, i) => v - base[i]);
  // Rectify + smooth (energy).
  const energy = movingAverage(hp.map((v) => v * v), Math.max(1, Math.round(sampleRateHz * 0.03)));
  const mean = energy.reduce((s, x) => s + x, 0) / n;
  const max = Math.max(...energy);
  const thr = mean + 0.35 * (max - mean);
  const refractory = Math.round((refractoryMs / 1000) * sampleRateHz);
  const peaks = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    if (energy[i] > thr && energy[i] >= energy[i - 1] && energy[i] > energy[i + 1] && i - last > refractory) {
      peaks.push(i);
      last = i;
    }
  }
  return peaks;
}

function movingAverage(arr, win) {
  const n = arr.length;
  const out = new Array(n).fill(0);
  let acc = 0;
  const half = Math.floor(win / 2);
  for (let i = 0; i < n + half; i++) {
    if (i < n) acc += arr[i];
    if (i - win >= 0) acc -= arr[i - win];
    const idx = i - half;
    if (idx >= 0 && idx < n) out[idx] = acc / Math.min(win, i + 1);
  }
  return out;
}

/** Heart rate from R-peak indices. */
export function rateFromPeaks(peaks, sampleRateHz) {
  if (!peaks || peaks.length < 3 || !sampleRateHz) return null;
  const rr = [];
  for (let i = 1; i < peaks.length; i++) rr.push((peaks[i] - peaks[i - 1]) / sampleRateHz);
  rr.sort((a, b) => a - b);
  const med = rr[Math.floor(rr.length / 2)]; // robust to outliers
  if (!med || med <= 0) return null;
  const hr = Math.round(60 / med);
  return hr >= 20 && hr <= 350 ? hr : null;
}

/**
 * Browser-only: digitize an <img>/<canvas> ECG image.
 * Returns { ok, calibration, hr_measured, confidence, measurement_source, quality }.
 * Fails safe (ok:false) whenever anything is uncertain.
 */
export async function digitizeFromImage(imgEl, { speedMmS = 25 } = {}) {
  if (typeof document === "undefined" || !imgEl) return { ok: false, reason: "no_dom" };
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;
  if (!w || !h) return { ok: false, reason: "no_pixels" };

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(imgEl, 0, 0, w, h);
  let data;
  try {
    data = ctx.getImageData(0, 0, w, h).data;
  } catch {
    return { ok: false, reason: "tainted_canvas" }; // cross-origin without CORS
  }

  // Grid detection: project "pinkness" (grid lines are reddish) per column.
  const colProj = new Array(w).fill(0);
  const darkProj = new Array(w).fill(0); // trace darkness per column (for coverage)
  const traceY = new Array(w).fill(null);
  for (let x = 0; x < w; x++) {
    let pink = 0;
    let darkestVal = 255;
    let darkestY = null;
    for (let y = 0; y < h; y++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 150 && r - g > 30 && r - b > 20) pink++; // reddish grid line
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < darkestVal && lum < 110) {
        darkestVal = lum;
        darkestY = y;
      }
    }
    colProj[x] = pink;
    if (darkestY != null) {
      darkProj[x] = 1;
      traceY[x] = darkestY;
    }
  }

  const pxPerSmallBox = dominantSpacing(colProj, 4, 60);
  const coverage = darkProj.reduce((s, v) => s + v, 0) / w;

  // Fail-safe gates: need a plausible grid and enough trace.
  if (!pxPerSmallBox || pxPerSmallBox < 4 || coverage < 0.5) {
    return {
      ok: false,
      reason: !pxPerSmallBox ? "grid_not_detected" : coverage < 0.5 ? "low_trace_coverage" : "calibration_uncertain",
      quality: { grid_px: pxPerSmallBox, coverage: round2(coverage) },
    };
  }

  // Calibration: 1 small box = 0.04 s at 25 mm/s. px→seconds.
  const secPerSmallBox = 0.04 * (25 / speedMmS);
  const sampleRateHz = pxPerSmallBox / secPerSmallBox; // px are our "samples" along x
  // Build a continuous 1-D signal from the trace (invert y so up = positive).
  const signal = [];
  for (let x = 0; x < w; x++) signal.push(traceY[x] == null ? null : h - traceY[x]);
  const filled = interpolateGaps(signal);
  const peaks = detectRPeaks(filled, sampleRateHz);
  const hr = rateFromPeaks(peaks, sampleRateHz);

  const confidence = clamp(
    Math.round(60 + 30 * (coverage - 0.5) * 2 + (peaks.length >= 4 ? 10 : -20)),
    5,
    95
  );

  return {
    ok: hr != null,
    reason: hr == null ? "rate_undetermined" : null,
    calibration: { px_per_small_box: pxPerSmallBox, sec_per_small_box: round4(secPerSmallBox), speed_mm_s: speedMmS },
    hr_measured: hr,
    intervals: null, // A2b (delineation) — not yet validated
    confidence,
    measurement_source: "cv_digitized",
    quality: { grid_px: pxPerSmallBox, coverage: round2(coverage), r_peaks: peaks.length },
  };
}

function interpolateGaps(sig) {
  const out = sig.slice();
  let lastIdx = -1;
  let lastVal = null;
  for (let i = 0; i < out.length; i++) {
    if (out[i] != null) {
      if (lastIdx >= 0 && i - lastIdx > 1 && lastVal != null) {
        const step = (out[i] - lastVal) / (i - lastIdx);
        for (let j = lastIdx + 1; j < i; j++) out[j] = lastVal + step * (j - lastIdx);
      }
      lastIdx = i;
      lastVal = out[i];
    }
  }
  for (let i = 0; i < out.length; i++) if (out[i] == null) out[i] = lastVal ?? 0;
  return out;
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const round2 = (x) => Math.round(x * 100) / 100;
const round4 = (x) => Math.round(x * 10000) / 10000;
