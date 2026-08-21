/**
 * ============================================================================
 *  ECG age/sex-indexed normal ranges  (deterministic screening flags)
 * ============================================================================
 *  Pediatric ECG norms shift dramatically with age (a HR of 150 is normal in a
 *  neonate and pathological in a teenager; right-axis is normal in a newborn).
 *  This module holds approximate, well-established SCREENING ranges (awake,
 *  resting) and flags deviations deterministically in code, so the reading is
 *  anchored to the child's age instead of adult defaults.
 *
 *  IMPORTANT: these are conservative screening bands for decision-support flags,
 *  not diagnostic thresholds. Fine age-specific percentile tables (Davignon /
 *  Rijnbeek) should be used for definitive interpretation. Every flag is a
 *  prompt to look, never a diagnosis.
 * ============================================================================
 */

const isNum = (x) => typeof x === "number" && isFinite(x);

/**
 * Age bands with approximate awake-resting normal ranges.
 * hr: [min,max] bpm · prUpper/qrsUpper: ms upper limits · qtcUpper: ms.
 * rad_normal: right-axis deviation is age-appropriate in this band.
 */
const BANDS = [
  { key: "neonate", label_he: "יילוד (<1 חודש)", maxYears: 1 / 12, hr: [90, 180], prUpper: 130, qrsUpper: 80, qtcUpper: 470, rad_normal: true },
  { key: "infant_early", label_he: "תינוק 1–6 חודשים", maxYears: 0.5, hr: [100, 180], prUpper: 140, qrsUpper: 80, qtcUpper: 460, rad_normal: true },
  { key: "infant_late", label_he: "תינוק 6–12 חודשים", maxYears: 1, hr: [100, 170], prUpper: 140, qrsUpper: 85, qtcUpper: 460, rad_normal: false },
  { key: "toddler", label_he: "פעוט 1–3 שנים", maxYears: 3, hr: [90, 150], prUpper: 150, qrsUpper: 90, qtcUpper: 460, rad_normal: false },
  { key: "preschool", label_he: "גיל 3–5", maxYears: 5, hr: [80, 140], prUpper: 160, qrsUpper: 95, qtcUpper: 460, rad_normal: false },
  { key: "school", label_he: "גיל 5–8", maxYears: 8, hr: [70, 120], prUpper: 160, qrsUpper: 100, qtcUpper: 460, rad_normal: false },
  { key: "preteen", label_he: "גיל 8–12", maxYears: 12, hr: [65, 110], prUpper: 170, qrsUpper: 100, qtcUpper: 460, rad_normal: false },
  { key: "adolescent", label_he: "מתבגר 12–16", maxYears: 16, hr: [60, 100], prUpper: 190, qrsUpper: 110, qtcUpper: 460, rad_normal: false },
  { key: "adult", label_he: "מבוגר (16+)", maxYears: Infinity, hr: [60, 100], prUpper: 200, qrsUpper: 120, qtcUpper: 450, rad_normal: false },
];

export function ecgBandForAge(ageYears) {
  if (!isNum(ageYears) || ageYears < 0) return null;
  return BANDS.find((b) => ageYears < b.maxYears) || BANDS[BANDS.length - 1];
}

/** Sex-aware QTc upper bound (adult males slightly lower). */
function qtcUpperFor(band, sex) {
  if (band.key !== "adult") return band.qtcUpper;
  const female = /female|נקבה|אישה|^f$/i.test(sex || "");
  return female ? 460 : 450;
}

/**
 * Flag the structured reading against age/sex norms.
 * @returns {{band, flags:Array, warnings:string[], promptNote:string}|null}
 */
export function flagEcgNormals(structured, { ageYears, sex } = {}) {
  const band = ecgBandForAge(ageYears);
  if (!band) return null; // no age → no age-specific flags

  const s = structured || {};
  const iv = s.intervals || {};
  const rr = s.rhythm_and_rate || {};
  const flags = [];
  const warnings = [];

  const hr = isNum(rr.heart_rate_bpm_calculated) ? rr.heart_rate_bpm_calculated : rr.heart_rate_bpm;
  if (isNum(hr)) {
    if (hr < band.hr[0]) {
      flags.push({ param: "HR", value: hr, normal: band.hr, note_he: "ברדיקרדיה יחסית לגיל" });
      warnings.push(`נורמת-גיל: דופק ${hr} מתחת לטווח לגיל (${band.hr[0]}–${band.hr[1]}) — ברדיקרדיה יחסית ל${band.label_he}.`);
    } else if (hr > band.hr[1]) {
      flags.push({ param: "HR", value: hr, normal: band.hr, note_he: "טכיקרדיה יחסית לגיל" });
      warnings.push(`נורמת-גיל: דופק ${hr} מעל הטווח לגיל (${band.hr[0]}–${band.hr[1]}) — טכיקרדיה יחסית ל${band.label_he}.`);
    }
  }

  if (isNum(iv.pr_ms) && iv.pr_ms > band.prUpper) {
    flags.push({ param: "PR", value: iv.pr_ms, normal: [null, band.prUpper], note_he: "PR מוארך לגיל" });
    warnings.push(`נורמת-גיל: PR ${iv.pr_ms}ms מעל הגבול לגיל (~${band.prUpper}ms) — שקול חסם AV מדרגה 1.`);
  }
  if (isNum(iv.qrs_ms) && iv.qrs_ms > band.qrsUpper) {
    flags.push({ param: "QRS", value: iv.qrs_ms, normal: [null, band.qrsUpper], note_he: "QRS רחב לגיל" });
    warnings.push(`נורמת-גיל: QRS ${iv.qrs_ms}ms רחב לגיל (גבול ~${band.qrsUpper}ms) — שקול הפרעת הולכה.`);
  }

  const qtcUpper = qtcUpperFor(band, sex);
  const qtcB = isNum(iv.qtc_bazett_ms) ? iv.qtc_bazett_ms : null;
  if (isNum(qtcB) && qtcB > qtcUpper) {
    flags.push({ param: "QTc", value: qtcB, normal: [null, qtcUpper], note_he: "QTc מוארך לגיל/מין" });
    warnings.push(`נורמת-גיל: QTc(Bazett) ${qtcB}ms מעל הגבול (${qtcUpper}ms) — סיכון להפרעות קצב, שקול סיבות הפיכות.`);
  }

  // Axis: right-axis is age-appropriate in neonates/young infants.
  const axisInterp = s.axis?.interpretation || s.axis?.interpretation_calculated || "";
  if (band.rad_normal && /RAD|ימני/i.test(axisInterp)) {
    flags.push({ param: "Axis", value: axisInterp, normal: null, note_he: "סטיית ציר ימני תקינה לגיל היילוד/תינוק" });
  }

  const promptNote = `## נורמות תלויות-גיל (המטופל: ${band.label_he})
החל את הטווחים הבאים בקריאה: דופק תקין ${band.hr[0]}–${band.hr[1]} bpm; PR עד ~${band.prUpper}ms; QRS עד ~${band.qrsUpper}ms; QTc עד ~${qtcUpper}ms.${band.rad_normal ? " בגיל זה סטיית ציר ימני (RAD) עשויה להיות תקינה — אל תסמן אותה כפתולוגית אוטומטית." : ""}`;

  return { band, flags, warnings, promptNote };
}
