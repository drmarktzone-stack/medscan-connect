/**
 * ============================================================================
 *  MedScan AI — Deterministic ECG Micro-Measurement Core
 * ============================================================================
 *  THE PRINCIPLE (deterministic / LLM firewall, applied to ECG geometry):
 *
 *   The vision model's ONLY numeric job is PERCEPTION — reading pixels:
 *     • the calibration grid (size of one small box, in pixels)
 *     • the pixel X-positions of fiducial points: P-onset, P-offset,
 *       QRS-onset (Q), QRS-offset (J), T-offset, and consecutive R-peaks
 *     • the net QRS deflection (mm) in leads I and aVF (for the axis)
 *
 *   EVERY clinical number — PR, QRS, QT, RR, HR, QTc, axis — is computed HERE,
 *   in code, from those coordinates and the measured calibration. The model
 *   never "estimates" a millisecond value. A number the model was not asked to
 *   perceive geometrically does not exist.
 *
 *  Paper standard: 25 mm/s ⇒ 1 mm = 40 ms ; 10 mm/mV ⇒ 1 mm = 0.1 mV.
 *  Both are parameters here (some strips run at 50 mm/s or 20 mm/mV).
 *
 *  If calibration is missing/unreliable → we return nulls and say so. No box
 *  size, no measurement. That is correct behaviour, not a failure.
 * ============================================================================
 */

export const PAPER_DEFAULT = { speed_mm_s: 25, gain_mm_mv: 10 };

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
const round = (x) => (x == null ? null : Math.round(x));

/** Milliseconds represented by one horizontal pixel, from the calibration box. */
export function msPerPx({ small_box_px, mm_per_small_box = 1, paper_speed_mm_s = 25 }) {
  if (!isNum(small_box_px) || small_box_px <= 0) return null;
  if (!isNum(paper_speed_mm_s) || paper_speed_mm_s <= 0) return null;
  const ms_per_mm = 1000 / paper_speed_mm_s;           // 40 ms/mm at 25 mm/s
  return (ms_per_mm * mm_per_small_box) / small_box_px;
}

/** Millivolts represented by one vertical pixel, from the calibration box. */
export function mvPerPx({ small_box_px, gain_mm_mv = 10 }) {
  if (!isNum(small_box_px) || small_box_px <= 0) return null;
  if (!isNum(gain_mm_mv) || gain_mm_mv <= 0) return null;
  const mv_per_mm = 1 / gain_mm_mv;                    // 0.1 mV/mm at 10 mm/mV
  return mv_per_mm / small_box_px;
}

/** Intervals (ms) from fiducial X pixels. Any missing fiducial → that interval is null. */
export function computeIntervals(fid = {}, ms_per_px) {
  if (!isNum(ms_per_px) || ms_per_px <= 0) return { pr_ms: null, qrs_ms: null, qt_ms: null };
  const span = (a, b) => (isNum(a) && isNum(b) ? Math.abs(b - a) * ms_per_px : null);
  return {
    pr_ms: round(span(fid.p_onset_x, fid.qrs_onset_x)),
    qrs_ms: round(span(fid.qrs_onset_x, fid.qrs_offset_x)),
    qt_ms: round(span(fid.qrs_onset_x, fid.t_offset_x)),
  };
}

/** Heart rate + RR (ms) from the R–R distance in pixels. */
export function heartRate(rr_px, ms_per_px) {
  if (!isNum(rr_px) || !isNum(ms_per_px) || rr_px <= 0 || ms_per_px <= 0) {
    return { rr_ms: null, hr_bpm: null };
  }
  const rr_ms = rr_px * ms_per_px;
  return { rr_ms: round(rr_ms), hr_bpm: round(60000 / rr_ms) };
}

/** Rate-corrected QT — both formulas, code-computed. */
export function qtc({ qt_ms, rr_ms }) {
  if (!isNum(qt_ms) || !isNum(rr_ms) || qt_ms <= 0 || rr_ms <= 0) {
    return { bazett: null, fridericia: null };
  }
  const rr_s = rr_ms / 1000;
  return {
    bazett: round(qt_ms / Math.sqrt(rr_s)),
    fridericia: round(qt_ms / Math.cbrt(rr_s)),
  };
}

/** QRS frontal axis (degrees) from net deflections in leads I and aVF. */
export function qrsAxis(net_I_mm, net_aVF_mm) {
  if (!isNum(net_I_mm) || !isNum(net_aVF_mm)) return null;
  if (net_I_mm === 0 && net_aVF_mm === 0) return null;
  return Math.round((Math.atan2(net_aVF_mm, net_I_mm) * 180) / Math.PI);
}

/** Categorise the axis. Boundaries are the standard adult convention. */
export function interpretAxis(deg) {
  if (!isNum(deg)) return { category: "unknown", label_he: "לא ניתן לחשב" };
  if (deg >= -30 && deg <= 90) return { category: "normal", label_he: "ציר תקין" };
  if (deg > 90 && deg <= 180) return { category: "RAD", label_he: "סטיית ציר ימנית" };
  if (deg >= -90 && deg < -30) return { category: "LAD", label_he: "סטיית ציר שמאלית" };
  return { category: "extreme", label_he: "ציר קיצוני (צפוני-מערבי)" };
}

/**
 * Full deterministic micro-measurement from a PERCEPTION payload.
 * @param {object} p
 * @param {{small_box_px:number, mm_per_small_box?:number, paper_speed_mm_s?:number, gain_mm_mv?:number, reliable?:boolean}} p.calibration
 * @param {object} p.fiducials  {p_onset_x,p_offset_x,qrs_onset_x,qrs_offset_x,t_offset_x, rr_px}
 * @param {{net_I_mm?:number, net_aVF_mm?:number}} [p.leadNet]
 * @returns {object} measured intervals + flags of what could NOT be measured
 */
export function runMicroMeasure({ calibration = {}, fiducials = {}, leadNet = {} } = {}) {
  const notes = [];
  const ms_per_px = msPerPx(calibration);
  const mv_per_px = mvPerPx(calibration);

  if (!ms_per_px) {
    notes.push("לא זוהה כיול גריד אמין — לא ניתן למדוד מרווחים בזמן. יש לצלם עם רשת ברורה וכיול 25mm/s.");
    return {
      measurable: false,
      calibration: { ms_per_px: null, mv_per_px, ...calibration },
      intervals: { pr_ms: null, qrs_ms: null, qt_ms: null },
      rate: { rr_ms: null, hr_bpm: null },
      qtc: { bazett: null, fridericia: null },
      axis: { degrees: null, ...interpretAxis(null) },
      notes,
    };
  }

  const intervals = computeIntervals(fiducials, ms_per_px);
  const rate = heartRate(fiducials.rr_px, ms_per_px);
  const qtcVals = qtc({ qt_ms: intervals.qt_ms, rr_ms: rate.rr_ms });
  const axisDeg = qrsAxis(leadNet.net_I_mm, leadNet.net_aVF_mm);

  if (intervals.pr_ms == null) notes.push("PR לא נמדד — נקודות P-onset/QRS-onset חסרות או לא-ברורות.");
  if (intervals.qrs_ms == null) notes.push("QRS לא נמדד — Q/J לא-ברורים.");
  if (intervals.qt_ms == null) notes.push("QT לא נמדד — סוף גל T לא-ברור.");
  if (rate.hr_bpm == null) notes.push("קצב לא חושב — R–R לא זמין.");
  if (axisDeg == null) notes.push("ציר לא חושב — נדרש היטל QRS נטו ב-I ו-aVF.");

  return {
    measurable: true,
    calibration: { ms_per_px, mv_per_px, ...calibration },
    intervals,
    rate,
    qtc: qtcVals,
    axis: { degrees: axisDeg, ...interpretAxis(axisDeg) },
    notes,
  };
}
