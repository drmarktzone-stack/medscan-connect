/**
 * ============================================================================
 *  MedScan AI — ECG Fundamentals Engine (deterministic "understanding")
 * ============================================================================
 *  This is the tool "knowing what an ECG is" — encoded as rules, not guessed.
 *  It consumes:
 *    • measured  — code-computed intervals/rate/QTc/axis (ecgMicroMeasure)
 *    • observations — perception facts (rhythm regularity, P–QRS relation,
 *                     ST/T/Q morphology per lead) reported by the vision layer
 *    • ageYears / sex
 *  and applies the FUNDAMENTALS of cardiac electrophysiology deterministically:
 *    - rhythm classification (sinus / brady / tachy / irregular / non-sinus)
 *    - axis interpretation (from measured degrees)
 *    - interval normality vs age (reuses ecgNormals)
 *    - morphology → meaning (ST elevation/depression, T inversion, path. Q)
 *
 *  Every finding is decision-support with a plain explanation — never a final
 *  diagnosis. Thresholds are conservative, well-established screening values.
 * ============================================================================
 */

import { flagEcgNormals, ecgBandForAge } from "../../ecgNormals.js";

const SEV_RANK = { normal: 0, yellow: 1, urgent: 2, unknown: 0 };
const bump = (cur, next) => ((SEV_RANK[next] || 0) > (SEV_RANK[cur] || 0) ? next : cur);

/** Rhythm classification from measured rate + observed regularity + P–QRS relation. */
export function classifyRhythm({ hr_bpm, regular, p_before_each_qrs, band }) {
  if (hr_bpm == null) {
    return { rhythm_he: "לא ניתן לקבוע קצב (דופק לא נמדד)", sinus: null, severity: "unknown" };
  }
  const lo = band?.hr?.[0], hi = band?.hr?.[1];
  const brady = lo != null && hr_bpm < lo;
  const tachy = hi != null && hr_bpm > hi;

  if (p_before_each_qrs && regular) {
    if (brady) return { rhythm_he: "ברדיקרדיה סינוסלית", sinus: true, severity: "yellow" };
    if (tachy) return { rhythm_he: "טכיקרדיה סינוסלית", sinus: true, severity: "yellow" };
    return { rhythm_he: "קצב סינוס תקין", sinus: true, severity: "normal" };
  }
  if (p_before_each_qrs === false && regular === false) {
    return { rhythm_he: "קצב לא-סדיר ללא גלי P ברורים — שקול פרפור עליות (AF)", sinus: false, severity: "yellow" };
  }
  if (p_before_each_qrs === false && regular) {
    return { rhythm_he: "קצב סדיר ללא P לפני QRS — שקול קצב צומתי/חדרי או חסם AV", sinus: false, severity: "yellow" };
  }
  if (regular === false) {
    return { rhythm_he: "קצב לא-סדיר עם גלי P — שקול אקסטרה-סיסטולות/הפרעת קצב", sinus: false, severity: "yellow" };
  }
  return { rhythm_he: "קצב לא מסווג — נדרשת בדיקה ידנית", sinus: null, severity: "unknown" };
}

/**
 * Conduction: bundle-branch block / IVCD from measured QRS width + V1/lateral
 * morphology. Criteria are standard, well-established ECG knowledge.
 * LBBB (and ventricular pacing) → "appropriate discordance": ST/T changes are
 * EXPECTED and the usual STEMI thresholds do NOT apply (use Sgarbossa). This
 * gate prevents the classic false-positive STEMI call on an LBBB.
 */
export function classifyConduction({ qrs_ms, v1_pattern, lateral_broad_r } = {}) {
  if (qrs_ms == null) return { type: "unknown", he: null, discordance_expected: false, severity: "normal" };
  if (qrs_ms < 120) return { type: "narrow", he: null, discordance_expected: false, severity: "normal" };
  if (v1_pattern === "dominant_s" && lateral_broad_r) {
    return { type: "LBBB", he: "חסם צרור שמאלי (LBBB)", discordance_expected: true, severity: "yellow" };
  }
  if (v1_pattern === "rsr_prime") {
    return { type: "RBBB", he: "חסם צרור ימני (RBBB)", discordance_expected: false, severity: "yellow" };
  }
  return { type: "IVCD", he: "הרחבת QRS לא-ספציפית (IVCD)", discordance_expected: false, severity: "yellow" };
}

/** Morphology → clinical meaning (deterministic decision-support flags). */
export function morphologyFindings(obs = {}, { conduction } = {}) {
  const out = [];
  const stE = (obs.st_elevation_leads || []).filter((x) => (x?.mm ?? 0) >= 1);
  const stD = (obs.st_depression_leads || []).filter((x) => (x?.mm ?? 0) >= 0.5);
  const tInv = obs.t_inversion_leads || [];
  const qPath = obs.pathological_q_leads || [];
  const prDep = !!obs.pr_depression;

  if (stE.length >= 2) {
    const leads = stE.map((x) => x.lead).join(", ");
    const diffuse = stE.length >= 5;
    if (conduction?.discordance_expected) {
      out.push({
        finding_he: `עליית ST ב-${leads} בנוכחות ${conduction.he}`,
        meaning_he: "בנוכחות חסם צרור/קצב רחב צפויה discordance מתאים — ספי-STEMI הרגילים אינם תקפים. להערכת איסכמיה יש להשתמש בקריטריוני Sgarbossa.",
        severity: "yellow",
      });
    } else if (diffuse && prDep) {
      out.push({
        finding_he: `עלייה מפושטת ב-ST (${leads}) עם ירידת PR`,
        meaning_he: "דפוס העולה בקנה אחד עם קריטריוני פריקרדיטיס — טעון מתאם קליני, אינו אבחנה.",
        severity: "yellow",
      });
    } else {
      out.push({
        finding_he: `עליית ST ב-${leads}`,
        meaning_he: "זרם-פגיעה (injury current) — חובה לשלול אוטם חד/STEMI. מתאם קליני דחוף.",
        severity: "urgent",
      });
    }
  }
  if (stD.length >= 2) {
    out.push({
      finding_he: `ירידת ST ב-${stD.map((x) => x.lead).join(", ")}`,
      meaning_he: "שקול איסכמיה/עומס. מתאם קליני.",
      severity: "yellow",
    });
  }
  if (tInv.length >= 2) {
    out.push({
      finding_he: `היפוך גלי T ב-${tInv.join(", ")}`,
      meaning_he: "שקול איסכמיה/עומס; בילדים צעירים היפוך ב-V1–V3 עשוי להיות תקין לגיל.",
      severity: "yellow",
    });
  }
  if (qPath.length >= 2) {
    out.push({
      finding_he: `גלי Q פתולוגיים ב-${qPath.join(", ")}`,
      meaning_he: "שקול צלקת/אוטם ישן.",
      severity: "yellow",
    });
  }
  return out;
}

/** Compose the full deterministic fundamentals interpretation. */
export function interpretFundamentals({ measured, observations = {}, ageYears, sex } = {}) {
  const band = ecgBandForAge(ageYears);
  const hr_bpm = measured?.rate?.hr_bpm ?? null;

  const rhythm = classifyRhythm({
    hr_bpm,
    regular: observations.regular,
    p_before_each_qrs: observations.p_before_each_qrs,
    band,
  });

  // Interval normality vs age — reuse the vetted normals module on measured values.
  const pseudoStructured = {
    intervals: {
      pr_ms: measured?.intervals?.pr_ms,
      qrs_ms: measured?.intervals?.qrs_ms,
      qtc_bazett_ms: measured?.qtc?.bazett,
    },
    rhythm_and_rate: { heart_rate_bpm: hr_bpm },
    axis: { interpretation: measured?.axis?.category },
  };
  const normals = flagEcgNormals(pseudoStructured, { ageYears, sex });

  const conduction = classifyConduction({
    qrs_ms: measured?.intervals?.qrs_ms,
    v1_pattern: observations.v1_qrs_pattern,
    lateral_broad_r: observations.lateral_broad_notched_r,
  });

  const morphology = morphologyFindings(observations, { conduction });

  let severity = "normal";
  severity = bump(severity, rhythm.severity);
  severity = bump(severity, conduction.severity);
  if (normals && normals.flags && normals.flags.length) severity = bump(severity, "yellow");
  for (const m of morphology) severity = bump(severity, m.severity);

  const anyAbnormal =
    (rhythm.sinus === false) ||
    rhythm.severity === "yellow" || rhythm.severity === "urgent" ||
    (conduction.type && !(["narrow", "unknown"].includes(conduction.type))) ||
    (normals?.flags?.length || 0) > 0 ||
    morphology.length > 0;

  const summary_he = !anyAbnormal
    ? "בגבולות הנורמה על-פי המדידות והמורפולוגיה שנצפו."
    : "זוהו ממצאים הדורשים התייחסות — ראה פירוט.";

  return {
    band: band ? { key: band.key, label_he: band.label_he } : null,
    rhythm,
    conduction,
    axis: measured?.axis || null,
    interval_warnings: normals?.warnings || [],
    interval_flags: normals?.flags || [],
    morphology,
    severity,
    summary_he,
  };
}
