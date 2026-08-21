/**
 * ============================================================================
 *  MedScan AI — Red-Team Guardrail Suite (deterministic, NO LLM)
 * ============================================================================
 *  "אפס הזיות" חייב להימדד — לא להיאמר. חבילה זו לא בודקת אבחון; היא בודקת
 *  שה־*מעקות* עצמם עובדים: כשמגיע קלט אדוורסרי (לא-רפואי, מטושטש, מסכן-חיים,
 *  קלט חסר) — האם השער מסרב/מסלים כפי שנדרש?
 *
 *  כל מקרה כאן הוא assertion על פונקציית-שער טהורה שכבר קיימת במערכת
 *  (decideGate, malignancyRisk, applyRadiologyCritical, calculators…).
 *  אין כאן ground-truth קליני מומצא — רק בדיקת התנהגות המעקות.
 *  ניתן להרצה בכל build או מתוך עמוד ה-Evaluation.
 * ============================================================================
 */

import { decideGate, deterministicLeadReversalCheck } from "./ecgQualityGate";
import { sevenPointScore, abcdTds, chaosAndClues, malignancyRisk } from "./dermoscopyScore";
import { applyRadiologyCritical } from "./radiologyCritical";
import { evaluateMeasurement } from "./radiologyMeasurements";
import { anionGap, correctedCalcium, weightBasedDose, estimatedGFR } from "./medscan/deterministic/calculators";

/** מבנה תוצאת-מקרה אחיד. */
function tc(id, domain, description_he, pass, detail_he) {
  return { id, domain, description_he, pass, detail_he };
}

/* ── ECG: שער איכות/ארטיפקט ─────────────────────────────────────────────── */
function ecgGateCases() {
  const out = [];

  // A. תמונה שאינה ECG → חייב לחסום
  {
    const g = decideGate({ is_ecg: false, quality_score: 90, is_interpretable: true, recommended_action_he: "אינו ECG" });
    out.push(tc("ecg.not_ecg", "ECG", "תמונה לא-רפואית מסומנת is_ecg=false", g.pass === false, g.pass === false ? "נחסם כנדרש" : "❌ עבר למרות שאינו ECG"));
  }
  // B. תרשים מטושטש (score נמוך) → חייב לחסום
  {
    const g = decideGate({ is_ecg: true, quality_score: 20, is_interpretable: true });
    out.push(tc("ecg.blurry", "ECG", "תרשים באיכות 20/100 (מתחת לסף 45)", g.pass === false, g.pass === false ? "נחסם כנדרש" : "❌ עבר למרות איכות נמוכה"));
  }
  // C. לא-קריא → חייב לחסום
  {
    const g = decideGate({ is_ecg: true, quality_score: 80, is_interpretable: false });
    out.push(tc("ecg.uninterpretable", "ECG", "תרשים מסומן is_interpretable=false", g.pass === false, g.pass === false ? "נחסם כנדרש" : "❌ עבר למרות שאינו קריא"));
  }
  // D. תקין → חייב לעבור (בדיקת שלילת false-positive של השער)
  {
    const g = decideGate({ is_ecg: true, quality_score: 88, is_interpretable: true });
    out.push(tc("ecg.valid_pass", "ECG", "תרשים תקין 88/100 — השער לא אמור לחסום", g.pass === true, g.pass === true ? "עבר כנדרש (אין over-blocking)" : "❌ חסם תרשים תקין"));
  }
  // E. חשד היפוך-לידים (ציר צפוני-מערבי בקצב סינוס) → דגל
  {
    const r = deterministicLeadReversalCheck({ axis: { degrees: -120 }, rhythm_and_rate: { rhythm_type: "sinus rhythm", p_wave_present: true } });
    out.push(tc("ecg.lead_reversal", "ECG", "ציר −120° בקצב סינוס — חשד להיפוך LA/RA", r?.suspected === true, r?.suspected === true ? "סומן חשד כנדרש" : "❌ לא סומן חשד"));
  }
  // F. ציר תקין בסינוס → אין חשד (שלילת over-flagging)
  {
    const r = deterministicLeadReversalCheck({ axis: { degrees: 60 }, rhythm_and_rate: { rhythm_type: "sinus rhythm", p_wave_present: true } });
    out.push(tc("ecg.axis_normal", "ECG", "ציר תקין 60° בסינוס — אין לסמן היפוך", r?.suspected === false, r?.suspected === false ? "לא סומן כנדרש" : "❌ סימן חשד שווא"));
  }
  return out;
}

/* ── עור: רשת-ביטחון של ניקוד דרמוסקופיה ────────────────────────────────── */
function skinSafetyNetCases() {
  const out = [];

  // A. 7-point ≥3 → סיכון גבוה
  {
    const sp = sevenPointScore({ atypical_network: true, blue_white_veil: true, atypical_vascular: true });
    const risk = malignancyRisk({ sevenPoint: sp });
    out.push(tc("skin.7point_high", "עור", "7-point עם 3 קריטריונים ראשיים", risk.level === "high", `רמת סיכון=${risk.level} (צפוי high)`));
  }
  // B. TDS גבוה → סיכון גבוה
  {
    const tds = abcdTds({ asymmetry: 2, border_segments: 8, colors: 6, structures: 5 });
    const risk = malignancyRisk({ tds });
    out.push(tc("skin.tds_high", "עור", "ABCD-TDS מקסימלי", risk.level === "high", `TDS band=${tds.band}, סיכון=${risk.level} (צפוי high)`));
  }
  // C. Chaos&Clues → excise → סיכון גבוה
  {
    const cc = chaosAndClues(true, ["blue_white", "atypical_vessels"]);
    const risk = malignancyRisk({ chaos: cc });
    out.push(tc("skin.chaos_excise", "עור", "Chaos + 2 clues → excise", risk.level === "high", `סיכון=${risk.level} (צפוי high)`));
  }
  // D. נגע שפיר ברור → סיכון נמוך (שלילת over-flagging)
  {
    const sp = sevenPointScore({});
    const tds = abcdTds({ asymmetry: 0, border_segments: 0, colors: 1, structures: 1 });
    const risk = malignancyRisk({ sevenPoint: sp, tds });
    out.push(tc("skin.benign_low", "עור", "נגע סימטרי חד-צבע — לא אמור לסמן סיכון גבוה", risk.level === "low", `סיכון=${risk.level} (צפוי low)`));
  }
  return out;
}

/* ── רדיולוגיה: הסלמת ממצא מסכן-חיים + מדידה חריגה ──────────────────────── */
function radiologyCriticalCases() {
  const out = [];

  // A. פנאומוטורקס במתח (emergency) → forcedUrgency=Emergency
  {
    const r = applyRadiologyCritical({ critical_rule_out: [{ pattern_key: "tension_pneumothorax", status: "met", evidence: "הסטת קנה" }] });
    out.push(tc("rad.tension_ptx", "רדיולוגיה", "פנאומוטורקס במתח status=met", r.forcedUrgency === "Emergency", `forcedUrgency=${r.forcedUrgency} (צפוי Emergency)`));
  }
  // B. מיקום שגוי של טובוס (urgent) → forcedUrgency=Urgent
  {
    const r = applyRadiologyCritical({ critical_rule_out: [{ pattern_key: "malpositioned_tube_line", status: "met" }] });
    out.push(tc("rad.tube", "רדיולוגיה", "טובוס במיקום שגוי status=met", r.forcedUrgency === "Urgent", `forcedUrgency=${r.forcedUrgency} (צפוי Urgent)`));
  }
  // C. emergency + urgent יחד → Emergency גובר
  {
    const r = applyRadiologyCritical({ critical_rule_out: [
      { pattern_key: "malpositioned_tube_line", status: "met" },
      { pattern_key: "pneumoperitoneum", status: "met" },
    ] });
    out.push(tc("rad.priority", "רדיולוגיה", "urgent+emergency יחד — Emergency חייב לגבור", r.forcedUrgency === "Emergency", `forcedUrgency=${r.forcedUrgency} (צפוי Emergency)`));
  }
  // D. שום ממצא → אין הסלמה (שלילת over-escalation)
  {
    const r = applyRadiologyCritical({ critical_rule_out: [{ pattern_key: "pneumoperitoneum", status: "absent" }] });
    out.push(tc("rad.clean", "רדיולוגיה", "ממצא status=absent — אין להסלים", r.forcedUrgency === null, `forcedUrgency=${r.forcedUrgency} (צפוי null)`));
  }
  // E. CTR מוגדל מעל נורמת-גיל → above_normal
  {
    const ev = evaluateMeasurement("cardiothoracic_ratio", 0.7, { ageMonths: 60 });
    out.push(tc("rad.ctr_high", "רדיולוגיה", "CTR 0.70 בגיל 5 (מעל נורמה)", ev?.verdict === "above_normal", `verdict=${ev?.verdict} (צפוי above_normal)`));
  }
  return out;
}

/* ── מחשבונים: סירוב בהיעדר קלט / מקדם ──────────────────────────────────── */
function calculatorRefusalCases() {
  const out = [];

  // A. anion gap בלי HCO3 → סירוב
  {
    const r = anionGap({ na: 140, cl: 100 });
    out.push(tc("calc.ag_missing", "מחשבונים", "anion gap בלי HCO3", r.ok === false, r.ok === false ? "סירב כנדרש" : "❌ חישב בלי קלט מלא"));
  }
  // B. eGFR בלי מקדם k → סירוב (המקדם תלוי-מעבדה, אסור להמציא)
  {
    const r = estimatedGFR({ height_cm: 100, creatinine_mg_dl: 0.5 });
    out.push(tc("calc.egfr_no_k", "מחשבונים", "eGFR בלי מקדם k מאומת", r.ok === false, r.ok === false ? "סירב כנדרש" : "❌ המציא מקדם"));
  }
  // C. מינון בלי רשומה מאומתת → סירוב (אין טבלאות פנימיות)
  {
    const r = weightBasedDose({ weight_kg: 10 });
    out.push(tc("calc.dose_no_record", "מחשבונים", "מינון בלי DoseRecord מאומת", r.ok === false, r.ok === false ? "סירב כנדרש" : "❌ הסיק מינון מהזיכרון"));
  }
  // D. מינון עם רשומה לא-מאומתת → סירוב
  {
    const r = weightBasedDose({ weight_kg: 10, doseRecord: { drug_key: "x", verification_status: "draft", mg_per_kg_per_dose: 10 } });
    out.push(tc("calc.dose_unverified", "מחשבונים", "מינון עם רשומה status=draft", r.ok === false, r.ok === false ? "סירב כנדרש" : "❌ חישב מרשומה לא-מאומתת"));
  }
  // E. חישוב תקין עובר (שלילת over-refusal)
  {
    const r = correctedCalcium({ calcium_mg_dl: 8, albumin_g_dl: 2 });
    out.push(tc("calc.valid", "מחשבונים", "סידן מתוקן עם קלט מלא — אמור לחשב", r.ok === true && r.value === 9.6, `ok=${r.ok}, value=${r.value} (צפוי 9.6)`));
  }
  return out;
}

/** מריץ את כל החבילה ומחזיר דו״ח מצרפי דטרמיניסטי. */
export function runRedTeamSuite() {
  const groups = {
    ecg: ecgGateCases(),
    skin: skinSafetyNetCases(),
    radiology: radiologyCriticalCases(),
    calculators: calculatorRefusalCases(),
  };
  const all = Object.values(groups).flat();
  const passed = all.filter((c) => c.pass).length;
  const failed = all.filter((c) => !c.pass);

  return {
    total: all.length,
    passed,
    failed_count: failed.length,
    pass_rate: all.length ? Math.round((passed / all.length) * 100) : 0,
    all_guards_ok: failed.length === 0,
    failures: failed,
    by_domain: Object.fromEntries(
      Object.entries(groups).map(([d, cases]) => [d, { total: cases.length, passed: cases.filter((c) => c.pass).length }])
    ),
    cases: all,
    note_he:
      "בדיקת מעקות בלבד (לא אבחון). כל מקרה מאשר ששער-בטיחות קיים מסרב/מסלים כנדרש. " +
      "כשל = פרצה בגבול-הבטיחות, לא אבחנה שגויה.",
  };
}
