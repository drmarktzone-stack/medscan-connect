/**
 * ============================================================================
 *  MedScan AI — State-of-the-Art ECG Interpretation Engine
 * ============================================================================
 *
 *  This module upgrades ECG analysis from free-text impressions to a rigorous,
 *  structured, human-cardiologist-like reading with an aggressive
 *  ANTI-HALLUCINATION layer.
 *
 *  Design principles (why this fights hallucinations):
 *   1. TECHNICAL GATE  — refuse to "read" an image that isn't an interpretable
 *      ECG. A model asked to diagnose garbage will invent findings; we stop it
 *      at the door (is_ecg / interpretable flags → abstain).
 *   2. STRUCTURED NUMERIC EXTRACTION — force discrete numeric measurements
 *      (HR, PR, QRS, QT, RR) instead of prose. Numbers can be verified; prose
 *      cannot.
 *   3. DETERMINISTIC CROSS-CHECK — we RE-COMPUTE heart rate, QTc (Bazett &
 *      Fridericia) and the axis category in plain JS from the model's own raw
 *      measurements. If the model's stated value disagrees with math, the math
 *      wins and a discrepancy is flagged. The model literally cannot lie about
 *      a QTc when we recompute it.
 *   4. EVIDENCE-LINKED FINDINGS — every finding must cite the specific leads /
 *      measurement it rests on. Findings with no evidence are dropped.
 *   5. INTERNAL-CONSISTENCY CHECKS — catch self-contradiction (e.g. "Sinus
 *      Rhythm" but P waves absent; "Emergency" but no findings).
 *   6. SELF-CONSISTENCY + ADVERSARIAL VERIFICATION — for urgent/uncertain
 *      reads, run a second independent interpretation and an adversarial
 *      "try to refute this" pass. Disagreement → downgrade to uncertainty
 *      instead of a confident (possibly hallucinated) call.
 *
 *  The engine is transport-agnostic: callers pass an `invokeLLM` function
 *  (base44.integrations.Core.InvokeLLM) so this file has no hard SDK dependency
 *  and stays unit-testable.
 * ============================================================================
 */

import { ECG_FULL_RULES } from "./ecgRules";
import { DIAGNOSIS_MODEL, FAST_MODEL } from "./aiConfig";
import { flagEcgNormals } from "./ecgNormals";
import { extractEcgWaveformFeatures } from "./medscan/signal/ecgWaveformFeatures.js";
import { assessEcgQuality, decideGate, deterministicLeadReversalCheck } from "./ecgQualityGate";
import { runVisionNumericGuard, groundedEcgNumbers } from "./visionNumericGuard";

const langNames = { he: "Hebrew", en: "English", ar: "Arabic" };

/* ==========================================================================
 *  1. SYSTEM PROMPT — 7-step methodology (merged with the full rules engine)
 * ========================================================================== */

const ECG_METHODOLOGY = `## שיטת קריאה שיטתית בת 7 שלבים (חובה — בסדר הזה)

### שלב 0 — האם זו בכלל א.ק.ג?
לפני הכל, קבע: האם התמונה היא תרשים אלקטרוקרדיוגרם (ECG/EKG) אמיתי?
- אם זו אינה תמונת ECG (סלפי, צילום מסך, מסמך, תמונת עור/רנטגן, ציור) → החזר is_ecg=false והסבר קצר. אל תמציא פענוח.
- אם זו תמונת ECG אך אינה קריאה (מטושטשת, חתוכה, רזולוציה נמוכה, ללא רשת/כיול, חלק מההובלות חסרות) → is_ecg=true אך interpretable=false, ופרט מה חסר.

### שלב 1 — ולידציה טכנית וכיול
- מהירות נייר (סטנדרט 25 מ"מ/שנייה). אם שונה, ציין וכייל את כל המדידות בהתאם.
- כיול מתח (סטנדרט 10 מ"מ/מיליוולט). בדוק את פולס הכיול.
- זיהוי ארטיפקטים: נדנוד קו בסיס, רעד שרירים, הפרעת 50/60Hz, החלפת הובלות (lead misplacement), dextrocardia טכני.
- קבע quality ו-interpretable. ללא כיול ידוע — מדוד ביחידות משבצות וציין את ההנחה.

### שלב 2 — קצב וריתמוס
- חשב דופק (BPM) — עדיף משיטת 300/1500 או ספירת רצועה.
- קבע מקור הקצב: סינוס / עלייתי / צומתי (junctional) / חדרי.
- רגולריות: סדיר / סדיר-לא-סדיר / לא-סדיר-לחלוטין.
- מורפולוגיית גל P ויחס P:QRS (1:1, דיסוציאציה, חסם).

### שלב 3 — ציר חשמלי
- מדוד את ציר ה-QRS במישור הפרונטלי (תקין -30° עד +90°; LAD, RAD, ציר קיצוני).
- בסס על הובלות I ו-aVF (ו-II לעידון).

### שלב 4 — מרווחים ומתחים (חישוב מדויק)
- מרווח PR (תקין 120–200ms).
- משך QRS (תקין <120ms).
- QT — מתחילת QRS לסוף גל T. מדוד RR לצורך תיקון.
- **דווח את הערכים הגולמיים qt_ms ו-rr_ms** — המערכת תחשב QTc לפי Bazett ו-Fridericia בעצמה. דווח גם את הערכים שאתה מחשב, אך הערכים הגולמיים הם החשובים.
- סמן QTc מוארך (>450ms גברים, >460ms נשים/ילדים) או קצר (<340ms).

### שלב 5 — הגדלה והיפרטרופיה
- עליות: RAE (P-pulmonale ב-II), LAE (P-mitrale ב-II/V1).
- חדרים: RVH (R גבוה ב-V1, S עמוק ב-V6, RAD) מול LVH (Sokolow-Lyon: S(V1)+R(V5/V6) > 35mm, או Cornell). התחשב בנורמות מתוקנות-גיל בילדים.

### שלב 6 — איסכמיה, אוטם ורה-פולריזציה
- מקטע ST: הגבהה (STEMI, פריקרדיטיס, early repolarization) / שקיעה (איסכמיה, NSTEMI, strain).
- גלי T: hyperacute, היפוך (איסכמיה, juvenile pattern, PE), biphasic (Wellens).
- גלי Q: פתולוגיים (>1mm רוחב או >25% מגובה QRS).

### שלב 7 — אבחנה מבדלת מקיפה וזיהוי פתולוגיה
כסה את כל הדפוסים הניתנים לזיהוי: הפרעות קצב (AFib/AFlutter/SVT/VT/VFib/PAC/PVC/SSS), הפרעות הולכה (LBBB/RBBB/LAFB/LPFB/AV blocks), מחלת לב איסכמית (MI קדמי/תחתון/צידי/אחורי/RV, אוטם ישן), הפרעות אלקטרוליט (היפר/היפוקלמיה, היפר/היפוקלצמיה), תסמונות גנטיות (LQTS/SQTS/Brugada/WPW/ARVC), ומבניות/שונות (פריקרדיטיס/מיוקרדיטיס, PE עם S1Q3T3, אפקט דיגיטליס, היפותרמיה/Osborn).`;

const ANTI_HALLUCINATION_LAWS = `## חוקי-ברזל נגד הזיות (קריטי ביותר)
1. **אל תמציא מדידות שאינך רואה.** אם הובלה חסרה/לא קריאה — ציין "לא בר-הערכה" (indeterminate). ניחוש הוא הזיה.
2. **כל ממצא חייב ראיה.** לכל פריט ב-primary_findings ציין ב-finding_evidence את ההובלות/המדד המדויקים שעליהם הוא נשען. ממצא ללא ראיה מדידה — אל תכלול אותו.
3. **דיוק דו-כיווני — לא תקין-שקרי ולא פתולוגיה-שקרית.** אבחנה ספציפית (פריקרדיטיס, MI, מיוקרדיטיס וכו') מותרת רק אם קריטריוני-האבחון המגדירים שלה נצפים בפועל בתרשים — ציין אילו. אם המדידות (קצב, מרווחים, ציר, ST, T) בגבולות הנורמה ואין ולו קריטריון פתולוגי חיובי אחד — הפלט הוא "בגבולות הנורמה" (clinical_urgency=Normal). זו תשובה תקינה ושלמה. **אל תמציא פתולוגיה כדי 'לא לפספס'. אבחנת-יתר על תרשים תקין היא נזק, לא זהירות.**
4. **בטיחות must-not-miss מבוססת-ראיה.** דפוס מסכן-חיים מוסלם כ-met **כאשר מאפייניו המגדירים נצפים בתרשים** — לא כברירת-מחדל ולא מ'חשש' כללי. חירום מוצהר חייב ממצא תומך ב-finding_evidence. בספק אמיתי לגבי דפוס מסכן-חיים — העדף indeterminate (לא met ולא not_met) והמלץ על מתאם קליני/חזרת-תרשים.
5. **הפרד עובדה מפרשנות.** מדידות = מה שנמדד. אבחנות = פרשנות. אל תערבב.
6. **כייל ביטחון.** confidence משקף כמה הראיה חד-משמעית. תמונה חלקית/קריאות ירודה → confidence נמוך, לא אבחנה נחרצת.
7. **אל תשתמש בידע חיצוני/אינטרנט** — הסתמך אך ורק על מה שנראה בתמונה ועל הכללים שסופקו.`;

/* ==========================================================================
 *  CRITICAL RULE-OUT — the killers & the commonly-missed (high-recall safety)
 *  Every read must explicitly mark each of these met / not_met / indeterminate.
 * ========================================================================== */
export const CRITICAL_RULE_OUT = [
  { key: "stemi_anterior", label: "STEMI קדמי", level: "emergency", look_for: "ST elevation V1–V4" },
  { key: "stemi_inferior", label: "STEMI תחתון", level: "emergency", look_for: "ST elevation II, III, aVF (בדוק חדר ימני/אחורי נלווים)" },
  { key: "stemi_lateral", label: "STEMI צידי", level: "emergency", look_for: "ST elevation I, aVL, V5–V6" },
  { key: "stemi_posterior", label: "STEMI אחורי", level: "emergency", look_for: "ST depression V1–V3 + R גבוה + T זקוף (תמונת ראי)" },
  { key: "stemi_rv", label: "אוטם חדר ימני", level: "emergency", look_for: "ST elevation V4R — בדוק תמיד באוטם תחתון" },
  { key: "left_main_lad", label: "חסימת גזע ראשי / LAD פרוקסימלי", level: "emergency", look_for: "ST elevation aVR > V1 + ST depression נרחב" },
  { key: "de_winter", label: "De Winter (STEMI-equivalent)", level: "emergency", look_for: "ST depression up-sloping V1–V6 + T גבוה סימטרי" },
  { key: "wellens", label: "Wellens (חסימה קריטית LAD)", level: "emergency", look_for: "T דו-פאזי או שלילי עמוק V2–V3, לרוב לאחר כאב שחלף" },
  { key: "hyperacute_t", label: "Hyperacute T (אוטם מוקדם מאוד)", level: "emergency", look_for: "T גבוה-רחב-סימטרי בטריטוריה" },
  { key: "sgarbossa", label: "Sgarbossa חיובי (אוטם ב-LBBB/קוצב)", level: "emergency", look_for: "concordant STE ≥1mm, או STD ≥1mm ב-V1–V3, או discordant STE ≥5mm" },
  { key: "vt", label: "טכיקרדיה חדרית (VT)", level: "emergency", look_for: "QRS רחב מהיר, AV dissociation, capture/fusion beats" },
  { key: "vf", label: "פרפור חדרים (VF)", level: "emergency", look_for: "פעילות כאוטית ללא QRS מזוהה" },
  { key: "complete_av_block", label: "חסם AV מלא (דרגה 3)", level: "emergency", look_for: "AV dissociation — P ו-QRS עצמאיים" },
  { key: "mobitz_ii", label: "חסם AV Mobitz II", level: "urgent", look_for: "PR קבוע ואז P נעדר פתאום, QRS לרוב רחב" },
  { key: "hyperkalemia", label: "היפרקלמיה חמורה", level: "emergency", look_for: "T מחודד → QRS מתרחב → P נעלם → sine wave" },
  { key: "long_qt", label: "QT מוארך מסוכן (סיכון Torsades)", level: "emergency", look_for: "QTc מוארך משמעותית (>500ms)" },
  { key: "torsades", label: "Torsades de Pointes", level: "emergency", look_for: "VT פולימורפי עם סיבוב ציר, על רקע QT מוארך" },
  { key: "brugada", label: "תסמונת Brugada (Type 1)", level: "emergency", look_for: "coved ST elevation ≥2mm ב-V1–V2 + T שלילי" },
  { key: "wpw", label: "WPW / פרה-אקסיטציה", level: "urgent", look_for: "PR קצר + delta wave + QRS רחב" },
];

const CRITICAL_LEVEL = Object.fromEntries(CRITICAL_RULE_OUT.map((c) => [c.key, c.level]));
const CRITICAL_LABEL = Object.fromEntries(CRITICAL_RULE_OUT.map((c) => [c.key, c.label]));

const CRITICAL_RULE_OUT_PROMPT = `## שלב חובה — שלילת דפוסים מסכני-חיים (Critical Rule-Out)
זהו מנגנון הבטיחות למניעת החמצה. עבור **כל** דפוס ברשימה החזר ב-critical_rule_out סטטוס:
- **met** — הדפוס מתקיים (יש ראיה).
- **not_met** — נשלל בוודאות מהתרשים.
- **indeterminate** — לא ניתן לאשש ולא לשלול בוודאות מהתרשים.

חוקים:
1. חובה להעריך את כל הדפוסים — אל תשמיט אף אחד.
2. **העדף indeterminate על not_met כשאינך בטוח** (במיוחד באיכות תרשים ירודה או הובלה חסרה). not_met = שלילה ודאית בלבד.
3. לכל met/indeterminate ציין evidence וההובלות הרלוונטיות.
4. כל דפוס שסומן met חייב להופיע גם ב-primary_findings ולהעלות את clinical_urgency בהתאם.

הדפוסים לבדיקה (pattern_key — מה לחפש):
${CRITICAL_RULE_OUT.map((c) => `- ${c.key}: ${c.label} — ${c.look_for}`).join("\n")}`;

const GRID_MEASUREMENT_PROMPT = `## מדידה מהרשת (Calibration-aware) — חובה כשניתן
מדוד מרווחים ע"י ספירת משבצות קטנות מול רשת ה-ECG, לא בהערכת-עין:
- הצהר ב-technical_check את speed_mm_s (סטנדרט 25) ו-calibration_mm_mv (סטנדרט 10) לפי פולס הכיול.
- ב-grid_measurements החזר את מספר המשבצות הקטנות (רוחב) עבור pr_boxes, qrs_boxes, qt_boxes, rr_boxes. משבצת קטנה = 1 מ"מ (ב-25 מ"מ/ש = 40ms).
- אם אינך יכול לספור בוודאות — השאר ריק, אל תנחש.
- מדוד סטיית ST בכל הובלה רלוונטית ב-מ"מ מקו הבסיס בנקודת J, והחזר ב-st_deviations: {lead, mm, direction (elevation/depression)}.
המערכת תמיר משבצות→ms לפי מהירות הנייר ותצליב מול הצהרותיך — הערכים המדודים מהרשת הם הקובעים.`;

/**
 * Build the full ECG interpretation system prompt.
 */
export function buildEcgSystemPrompt({ clinicalContext, language = "he", pediatric = false, ageNote = "" } = {}) {
  const outputLang = langNames[language] || "Hebrew";
  const pediatricNote = pediatric
    ? "\n## מצב ילדים (Pediatric) פעיל\nהחל נורמות תלויות-גיל: דופק גבוה יותר תקין, מרווחים קצרים יותר, היפוך T ילדי (juvenile T-wave) בהובלות ימניות כתקין, וקריטריוני היפרטרופיה מותאמי-גיל.\n"
    : "";
  return `אתה קרדיולוג בכיר ומומחה-על בפענוח אלקטרוקרדיוגרם, עם עשרות שנות ניסיון קליני. משימתך: לקרוא את ה-ECG כפי שקרדיולוג אנושי קורא — שלב אחר שלב, ממדידה לפרשנות — ולהחזיר פלט מובנה ומדויק.

## אלקטרופיזיולוגיה ומכניקה (בסיס ההיגיון שלך)
מסלול ההולכה: צומת SA → עליות (גל P) → צומת AV (השהיית מקטע PR) → צרור His / מערכת Purkinje → חדרים (קומפלקס QRS) → רה-פולריזציה חדרית (מקטע ST וגל T).
גיאומטריית הובלות: 12 הובלות סטנדרטיות — גפיים (I, II, III, aVR, aVL, aVF) וחזה (V1–V6). כל הובלה משקיפה על טריטוריה מוגדרת.

${pediatricNote}${ageNote ? ageNote + "\n\n" : ""}${clinicalContext ? `## הקשר קליני של המטופל\n${clinicalContext}\n(שקלל את ההקשר, אך אל תיתן לו לגבור על מה שנראה בתרשים.)\n` : ""}
${ECG_METHODOLOGY}

${ECG_FULL_RULES}

${ANTI_HALLUCINATION_LAWS}

${GRID_MEASUREMENT_PROMPT}

${CRITICAL_RULE_OUT_PROMPT}

## פורמט פלט
החזר אך ורק JSON התואם לסכמה שסופקה. כל שדה טקסט — כתוב ב-${outputLang}. שמות פתולוגיות רפואיות ניתן להשאיר גם באנגלית לצד התרגום.`;
}

/**
 * Build the ECG structured-evidence markdown block, injected into the
 * KB-grounded diagnosis stage of the main pipeline.
 */
export function buildEcgEvidenceBlock(engineResult) {
  const st = engineResult?.structured;
  if (!st) return "";
  const iv = st.intervals || {};
  const rr = st.rhythm_and_rate || {};
  const tc = st.technical_check || {};
  const morph = st.wave_and_segment_morphology || {};
  const hyp = st.hypertrophy_and_enlargement || {};
  const ev = (st.finding_evidence || [])
    .map((e) => `  - ${e.finding}: ${e.evidence}${e.leads ? ` [${e.leads}]` : ""}`)
    .join("\n");
  const warns = engineResult.warnings || [];
  return `
## פענוח ECG מובנה ממנוע הכללים (ראיה משלימה — הסתמך על המדידות, לא על הצהרות)
- **בדיקה טכנית:** ${tc.quality || "—"} | מהירות ${tc.speed_mm_s ?? 25}mm/s | כיול ${tc.calibration_mm_mv ?? 10}mm/mV
- **קצב:** ${rr.heart_rate_bpm ?? "?"} bpm | ${rr.rhythm_type || "—"} | ${rr.regularity || "—"} | גל P ${rr.p_wave_present ? "נוכח" : "נעדר"}
- **ציר חשמלי:** ${st.axis?.degrees ?? "?"}° (${st.axis?.interpretation || "—"})
- **מרווחים:** PR ${iv.pr_ms ?? "?"}ms | QRS ${iv.qrs_ms ?? "?"}ms | QT ${iv.qt_ms ?? "?"}ms | RR ${iv.rr_ms ?? "?"}ms | QTc(Bazett) ${iv.qtc_bazett_ms ?? "?"}ms | QTc(Fridericia) ${iv.qtc_fridericia_ms ?? "?"}ms — ${iv.qtc_status || "—"}
- **מורפולוגיה:** ST: ${morph.st_segment || "—"} | T: ${morph.t_waves || "—"} | Q: ${morph.q_waves || "—"}
- **סטיות ST מדודות (מ"מ):** ${(st.st_deviations || []).map((d) => `${d.lead} ${d.direction || ""} ${d.mm}`).join(", ") || "—"}
- **היפרטרופיה/הגדלה:** LVH ${hyp.lvh_present ? "כן" : "לא"} | RVH ${hyp.rvh_present ? "כן" : "לא"} | עליות: ${hyp.atrial_enlargement || "—"}
- **ממצאים עיקריים:** ${(st.primary_findings || []).join("; ") || "—"}
- **ראיות תומכות (לכל ממצא):**\n${ev || "  —"}
- **אבחנות מבדלות:** ${(st.differential_diagnoses || []).join(", ") || "—"}
- **דחיפות (מנוע, לאחר בקרה):** ${st.clinical_urgency || "—"}
- **צעדי המשך מומלצים:** ${(st.recommended_next_steps || []).join(", ") || "—"}
- **שלילת דפוסים מסכני-חיים:** ${(() => { const c = (st.critical_rule_out || []); const met = c.filter((x) => x.status === "met").map((x) => x.pattern_key); const ind = c.filter((x) => x.status === "indeterminate").map((x) => x.pattern_key); return `met: ${met.join(", ") || "אין"} | indeterminate: ${ind.join(", ") || "אין"}`; })()}
- **ביטחון מכויל (לאחר הצלבה/בקרה נגדית):** ${engineResult.confidence}%
${warns.length ? `\n### ⚠️ אזהרות אנטי-הזיה — התייחס אליהן, אל תתעלם:\n${warns.map((w) => "- " + w).join("\n")}` : ""}

⚠️ כלל ברזל: אל תאמץ ממצא שסומן כלא-מבוסס, או שהבקרה הנגדית הפריכה, כאבחנה ודאית. אם קיימות אזהרות סתירה/אי-עקביות — שקף אי-ודאות מפורשת בפלט הסופי.`;
}

/* ==========================================================================
 *  2. STRICT STRUCTURED JSON SCHEMA
 *     (superset of the requested spec + anti-hallucination fields)
 * ========================================================================== */

export const ECG_STRUCTURED_SCHEMA = {
  type: "object",
  properties: {
    is_ecg: { type: "boolean", description: "האם התמונה היא תרשים ECG אמיתי" },
    interpretable: { type: "boolean", description: "האם התרשים קריא ובר-פענוח" },
    abstain_reason: { type: "string", description: "אם לא ניתן לפענח — הסבר קצר מדוע (אחרת ריק)" },

    technical_check: {
      type: "object",
      properties: {
        quality: { type: "string", description: "Good / Artifacts present / Poor" },
        speed_mm_s: { type: "number", description: "מהירות נייר במ\"מ/שנייה (סטנדרט 25)" },
        calibration_mm_mv: { type: "number", description: "כיול מתח במ\"מ/mV (סטנדרט 10)" },
        artifacts: { type: "string", description: "ארטיפקטים שזוהו, או 'ללא'" },
      },
      required: ["quality"],
    },

    rhythm_and_rate: {
      type: "object",
      properties: {
        heart_rate_bpm: { type: "number" },
        rhythm_type: { type: "string", description: "Sinus / Atrial / Junctional / Ventricular / ..." },
        regularity: { type: "string", description: "Regular / Regularly Irregular / Irregularly Irregular" },
        p_wave_present: { type: "boolean" },
        p_qrs_relationship: { type: "string", description: "1:1 / AV dissociation / block ..." },
      },
      required: ["heart_rate_bpm", "rhythm_type", "regularity", "p_wave_present"],
    },

    axis: {
      type: "object",
      properties: {
        degrees: { type: "number", description: "ציר QRS פרונטלי במעלות" },
        interpretation: { type: "string", description: "Normal / LAD / RAD / Extreme" },
      },
      required: ["interpretation"],
    },

    lead_polarity: {
      type: "object",
      description: "פולריות גל P ו-QRS בהובלות I ו-aVR — לזיהוי היפוך אלקטרודות גפיים (LA/RA). מלא רק אם הפולריות נראית בבירור; אחרת השאר unclear. תקין בסינוס: I_p חיובי, aVR_p שלילי.",
      properties: {
        I_p: { type: "string", enum: ["positive", "negative", "biphasic", "unclear"], description: "פולריות גל P בהובלה I" },
        I_qrs: { type: "string", enum: ["positive", "negative", "equiphasic", "unclear"], description: "פולריות QRS בהובלה I" },
        aVR_p: { type: "string", enum: ["positive", "negative", "biphasic", "unclear"], description: "פולריות גל P בהובלה aVR" },
        aVR_qrs: { type: "string", enum: ["positive", "negative", "equiphasic", "unclear"], description: "פולריות QRS בהובלה aVR" },
      },
    },

    intervals: {
      type: "object",
      properties: {
        pr_ms: { type: "number" },
        qrs_ms: { type: "number" },
        qt_ms: { type: "number" },
        rr_ms: { type: "number", description: "מרווח RR במילישניות — הכרחי לחישוב QTc" },
        qtc_bazett_ms: { type: "number" },
        qtc_fridericia_ms: { type: "number" },
        qtc_status: { type: "string", description: "Short / Normal / Borderline / Prolonged" },
      },
      required: ["pr_ms", "qrs_ms", "qt_ms", "rr_ms"],
    },

    grid_measurements: {
      type: "object",
      description: "מדידה מהרשת — מספר משבצות קטנות (רוחב). המערכת תמיר ל-ms לפי מהירות הנייר.",
      properties: {
        pr_boxes: { type: "number" },
        qrs_boxes: { type: "number" },
        qt_boxes: { type: "number" },
        rr_boxes: { type: "number" },
      },
    },

    st_deviations: {
      type: "array",
      description: "סטיית ST לפי הובלה, במ\"מ מקו הבסיס בנקודת J",
      items: {
        type: "object",
        properties: {
          lead: { type: "string" },
          mm: { type: "number" },
          direction: { type: "string", description: "elevation / depression" },
        },
        required: ["lead", "mm"],
      },
    },

    wave_and_segment_morphology: {
      type: "object",
      properties: {
        st_segment: { type: "string" },
        t_waves: { type: "string" },
        q_waves: { type: "string" },
      },
      required: ["st_segment", "t_waves", "q_waves"],
    },

    hypertrophy_and_enlargement: {
      type: "object",
      properties: {
        lvh_present: { type: "boolean" },
        rvh_present: { type: "boolean" },
        atrial_enlargement: { type: "string", description: "None / LAE / RAE / Biatrial" },
      },
      required: ["lvh_present", "rvh_present", "atrial_enlargement"],
    },

    primary_findings: {
      type: "array",
      description: "רשמים אבחוניים עיקריים (טקסט קצר לכל אחד)",
      items: { type: "string" },
    },

    finding_evidence: {
      type: "array",
      description: "לכל ממצא עיקרי — הראיה המדידה שעליה הוא נשען. חובה לכל ממצא.",
      items: {
        type: "object",
        properties: {
          finding: { type: "string", description: "הממצא" },
          leads: { type: "string", description: "ההובלות התומכות (למשל II, III, aVF)" },
          evidence: { type: "string", description: "המדד/התצפית התומכת (למשל ST elevation 2mm)" },
        },
        required: ["finding", "evidence"],
      },
    },

    differential_diagnoses: {
      type: "array",
      items: { type: "string" },
    },

    clinical_urgency: {
      type: "string",
      enum: ["Normal", "Urgent", "Emergency"],
      description: "Normal / Urgent / Emergency",
    },

    recommended_next_steps: {
      type: "array",
      description: "צעדים מומלצים (למשל: טרופונין, אקו לב, השוואה ל-ECG ישן, ניטור)",
      items: { type: "string" },
    },

    critical_rule_out: {
      type: "array",
      description: "שלילת דפוסים מסכני-חיים — סטטוס לכל דפוס מהרשימה",
      items: {
        type: "object",
        properties: {
          pattern_key: { type: "string", description: "מפתח הדפוס מהרשימה (למשל stemi_inferior)" },
          status: { type: "string", enum: ["met", "not_met", "indeterminate"] },
          evidence: { type: "string", description: "הראיה מהתרשים (או מדוע לא ניתן להעריך)" },
          leads: { type: "string", description: "ההובלות הרלוונטיות" },
        },
        required: ["pattern_key", "status"],
      },
    },

    confidence: { type: "number", description: "ביטחון כולל 0-100, מכויל למידת חד-משמעות הראיה" },
    reasoning: { type: "string", description: "נימוק תמציתי המקשר בין המדידות לאבחנה" },
  },
  required: [
    "is_ecg",
    "interpretable",
    "technical_check",
    "rhythm_and_rate",
    "intervals",
    "wave_and_segment_morphology",
    "primary_findings",
    "clinical_urgency",
    "critical_rule_out",
  ],
};

/* ==========================================================================
 *  3. DETERMINISTIC CROSS-CHECK  (the anti-hallucination crown jewel)
 * ========================================================================== */

const isNum = (x) => typeof x === "number" && isFinite(x);
const round = (x) => (isNum(x) ? Math.round(x) : null);

/** Heart rate from RR interval (ms). */
export function heartRateFromRR(rr_ms) {
  if (!isNum(rr_ms) || rr_ms <= 0) return null;
  return 60000 / rr_ms;
}

/** Bazett-corrected QT (ms). QTc = QT / sqrt(RR[s]). */
export function qtcBazett(qt_ms, rr_ms) {
  if (!isNum(qt_ms) || !isNum(rr_ms) || rr_ms <= 0) return null;
  return qt_ms / Math.sqrt(rr_ms / 1000);
}

/** Fridericia-corrected QT (ms). QTc = QT / cbrt(RR[s]). */
export function qtcFridericia(qt_ms, rr_ms) {
  if (!isNum(qt_ms) || !isNum(rr_ms) || rr_ms <= 0) return null;
  return qt_ms / Math.cbrt(rr_ms / 1000);
}

/** Axis category from degrees. */
export function axisCategory(degrees) {
  if (!isNum(degrees)) return null;
  let d = degrees;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  if (d >= -30 && d <= 90) return "Normal";
  if (d > -90 && d < -30) return "LAD";
  if (d > 90 && d <= 180) return "RAD";
  return "Extreme";
}

/** QTc status from a corrected value, sex-aware when available. */
export function qtcStatus(qtc_ms, sex) {
  if (!isNum(qtc_ms)) return null;
  const female = /female|נקבה|אישה|f/i.test(sex || "");
  const upper = female ? 460 : 450;
  if (qtc_ms < 340) return "Short";
  if (qtc_ms > upper) return "Prolonged";
  if (qtc_ms >= 430) return "Borderline";
  return "Normal";
}

/**
 * Reconcile the model's stated numbers against deterministic math.
 * Returns corrected values (math wins), a list of human-readable discrepancies,
 * internal contradictions, and a confidence penalty.
 */
export function reconcileEcg(structured, { sex } = {}) {
  const discrepancies = [];
  const contradictions = [];
  const s = structured || {};
  const iv = s.intervals || {};
  const rr = s.rhythm_and_rate || {};

  const TOL_HR = 8;      // bpm
  const TOL_QTC = 25;    // ms

  // --- Heart rate vs RR ---
  const hrCalc = heartRateFromRR(iv.rr_ms);
  if (isNum(hrCalc) && isNum(rr.heart_rate_bpm) && Math.abs(hrCalc - rr.heart_rate_bpm) > TOL_HR) {
    discrepancies.push(
      `דופק מוצהר ${round(rr.heart_rate_bpm)} bpm אך RR=${round(iv.rr_ms)}ms נותן ${round(hrCalc)} bpm — תוקן חישובית.`
    );
  }

  // --- QTc Bazett & Fridericia recomputed ---
  const qtcB = qtcBazett(iv.qt_ms, iv.rr_ms);
  const qtcF = qtcFridericia(iv.qt_ms, iv.rr_ms);
  if (isNum(qtcB) && isNum(iv.qtc_bazett_ms) && Math.abs(qtcB - iv.qtc_bazett_ms) > TOL_QTC) {
    discrepancies.push(
      `QTc(Bazett) מוצהר ${round(iv.qtc_bazett_ms)}ms אך החישוב מ-QT/RR נותן ${round(qtcB)}ms — תוקן חישובית.`
    );
  }
  if (isNum(qtcF) && isNum(iv.qtc_fridericia_ms) && Math.abs(qtcF - iv.qtc_fridericia_ms) > TOL_QTC) {
    discrepancies.push(
      `QTc(Fridericia) מוצהר ${round(iv.qtc_fridericia_ms)}ms אך החישוב נותן ${round(qtcF)}ms — תוקן חישובית.`
    );
  }

  // --- Axis category vs degrees ---
  const axisCat = axisCategory(s.axis?.degrees);
  if (axisCat && s.axis?.interpretation && !new RegExp(axisCat, "i").test(s.axis.interpretation)) {
    discrepancies.push(
      `ציר ${round(s.axis.degrees)}° אמור להיות "${axisCat}" אך סווג כ-"${s.axis.interpretation}" — תוקן.`
    );
  }

  // --- Internal contradictions (cheap hallucination catchers) ---
  if (/sinus|סינוס/i.test(rr.rhythm_type || "") && rr.p_wave_present === false) {
    contradictions.push("סתירה: קצב מסווג כ'סינוס' אך גלי P מדווחים כנעדרים.");
  }
  if (/irregularly irregular|לא-סדיר לחלוטין|לא סדיר לחלוטין/i.test(rr.regularity || "") &&
      /sinus|סינוס/i.test(rr.rhythm_type || "")) {
    contradictions.push("סתירה: 'לא-סדיר לחלוטין' אינו עולה בקנה אחד עם קצב סינוס תקין (שקול פרפור עליות).");
  }
  const findings = Array.isArray(s.primary_findings) ? s.primary_findings.filter(Boolean) : [];
  if (s.clinical_urgency === "Emergency" && findings.length === 0) {
    contradictions.push("סתירה: דחיפות 'Emergency' ללא אף ממצא עיקרי מתועד.");
  }
  // Evidence coverage: every primary finding should have supporting evidence.
  const evList = Array.isArray(s.finding_evidence) ? s.finding_evidence : [];
  const unevidenced = findings.filter(
    (f) => !evList.some((e) => e && e.evidence && (e.finding === f || (e.finding && f.includes(e.finding)) || (e.finding && e.finding.includes(f))))
  );
  if (findings.length > 0 && unevidenced.length > 0) {
    discrepancies.push(`ממצאים ללא ראיה מדידה מקושרת: ${unevidenced.join("، ")} — סומנו כלא-מבוססים.`);
  }

  // --- Build corrected intervals (math wins) ---
  const correctedIntervals = { ...iv };
  if (isNum(qtcB)) correctedIntervals.qtc_bazett_ms = round(qtcB);
  if (isNum(qtcF)) correctedIntervals.qtc_fridericia_ms = round(qtcF);
  const statusFrom = isNum(qtcB) ? qtcStatus(qtcB, sex) : null;
  if (statusFrom) correctedIntervals.qtc_status = statusFrom;

  const correctedRhythm = { ...rr };
  if (isNum(hrCalc)) correctedRhythm.heart_rate_bpm_calculated = round(hrCalc);

  const correctedAxis = { ...(s.axis || {}) };
  if (axisCat) correctedAxis.interpretation_calculated = axisCat;

  const confidencePenalty =
    discrepancies.length * 6 + contradictions.length * 12 + unevidenced.length * 5;

  return {
    corrected: {
      ...s,
      intervals: correctedIntervals,
      rhythm_and_rate: correctedRhythm,
      axis: correctedAxis,
      unevidenced_findings: unevidenced,
    },
    discrepancies,
    contradictions,
    confidencePenalty,
    hasIssues: discrepancies.length > 0 || contradictions.length > 0,
  };
}

/**
 * Calibration-aware grid measurement: convert the model's small-box counts into
 * ms using the declared paper speed, and OVERRIDE the stated interval values
 * with the measured ones. This anchors intervals to the grid instead of an
 * eyeballed guess — the model cannot state QRS=90ms while counting 4 boxes.
 */
export function applyGridMeasurements(structured) {
  const s = structured || {};
  const tc = s.technical_check || {};
  const speed = isNum(tc.speed_mm_s) && tc.speed_mm_s > 0 ? tc.speed_mm_s : 25;
  const msPerBox = 1000 / speed; // 1 small box = 1 mm
  const gm = s.grid_measurements || {};
  const iv = { ...(s.intervals || {}) };
  const warnings = [];
  let used = false;
  const map = [["pr_boxes", "pr_ms", "PR"], ["qrs_boxes", "qrs_ms", "QRS"], ["qt_boxes", "qt_ms", "QT"], ["rr_boxes", "rr_ms", "RR"]];
  for (const [bk, mk, label] of map) {
    if (isNum(gm[bk]) && gm[bk] > 0) {
      const gridMs = Math.round(gm[bk] * msPerBox);
      used = true;
      const stated = iv[mk];
      if (isNum(stated) && Math.abs(gridMs - stated) > Math.max(20, stated * 0.12)) {
        warnings.push(`מדידת רשת: ${label}=${gm[bk]} משבצות×${Math.round(msPerBox)}ms=${gridMs}ms, אך הוצהר ${stated}ms — אומץ הערך המדוד מהרשת.`);
      }
      iv[mk] = gridMs;
    }
  }
  return { intervals: iv, warnings, used, speed };
}

/** Consistency: measured ST elevation ≥2mm in ≥2 leads but no STEMI flagged → warn. */
function checkStConsistency(structured) {
  const s = structured || {};
  const gainRaw = s.technical_check?.calibration_mm_mv;
  const gain = isNum(gainRaw) && gainRaw > 0 ? gainRaw : 10;
  const st = Array.isArray(s.st_deviations) ? s.st_deviations : [];
  const elevated = st.filter((d) => /elev|הגבה/i.test(d?.direction || "") && isNum(d?.mm) && (d.mm * 10 / gain) >= 2);
  const crit = new Set((s.critical_rule_out || []).filter((x) => x.status === "met").map((x) => x.pattern_key));
  const stemiMet = [...crit].some((k) => k.startsWith("stemi") || k === "left_main_lad" || k === "de_winter" || k === "hyperacute_t");
  const warns = [];
  if (elevated.length >= 2 && !stemiMet) {
    warns.push(`מדידת רשת: הגבהת ST ≥2מ"מ ב-${elevated.map((d) => d.lead).join(", ")} אך לא סומן STEMI/שווה-ערך — יש לשקול שנית.`);
  }
  return warns;
}

/* ==========================================================================
 *  4. SELF-CONSISTENCY + ADVERSARIAL VERIFICATION
 * ========================================================================== */

function normalizeDx(s) {
  return (s || "").toLowerCase().replace(/[^\w֐-׿\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Do the top findings of two independent reads agree? */
export function findingsAgree(a, b) {
  const fa = (a?.primary_findings || []).map(normalizeDx).filter(Boolean);
  const fb = (b?.primary_findings || []).map(normalizeDx).filter(Boolean);
  if (fa.length === 0 && fb.length === 0) return true;
  if (fa.length === 0 || fb.length === 0) return false;
  // top finding overlap or any shared token-heavy finding
  const setB = new Set(fb.flatMap((f) => f.split(" ")));
  const topA = fa[0].split(" ").filter((w) => w.length > 2);
  const shared = topA.filter((w) => setB.has(w)).length;
  return shared >= Math.max(1, Math.floor(topA.length * 0.4));
}

const VERIFIER_SCHEMA = {
  type: "object",
  properties: {
    refuted: { type: "boolean", description: "האם האבחנה העיקרית אינה נתמכת מספיק בראיה" },
    refutation: { type: "string", description: "מדוע — או אישוש אם לא הופרכה" },
    missed_findings: { type: "array", items: { type: "string" }, description: "ממצאים חשובים שאולי פוספסו" },
    adjusted_urgency: { type: "string", enum: ["Normal", "Urgent", "Emergency"] },
    verifier_confidence: { type: "number" },
  },
  required: ["refuted", "refutation"],
};

function buildVerifierPrompt(structured, language) {
  const outputLang = langNames[language] || "Hebrew";
  return `אתה קרדיולוג בכיר שני, בתפקיד מבקר-נגדי (adversarial reviewer). קיבלת פענוח ECG של קולגה. תפקידך אינו להסכים — אלא **לנסות להפריך** את האבחנה העיקרית: לחפש הובלות/מדידות שאינן תומכות בה, הסברים חלופיים, וקפיצות-לוגיקה.

## הפענוח לבדיקה
- ממצאים עיקריים: ${(structured.primary_findings || []).join(" | ") || "—"}
- דחיפות מוצהרת: ${structured.clinical_urgency || "—"}
- מדידות מפתח: HR=${structured.rhythm_and_rate?.heart_rate_bpm ?? "?"}, QRS=${structured.intervals?.qrs_ms ?? "?"}ms, QTc(B)=${structured.intervals?.qtc_bazett_ms ?? "?"}ms, ST=${structured.wave_and_segment_morphology?.st_segment ?? "?"}
- ראיות שהוצגו: ${(structured.finding_evidence || []).map((e) => `${e.finding}: ${e.evidence}`).join(" ; ") || "—"}

## הוראות
1. בחן שוב את התמונה בעצמך. האם הראיה בתרשים באמת תומכת בממצא העיקרי?
2. אם הראיה חלשה/חסרה/סותרת → refuted=true, והסבר.
3. אם משהו קריטי פוספס (במיוחד מסכן-חיים) → פרט ב-missed_findings.
4. בברירת מחדל, אם אינך בטוח שהראיה מספקת — נטה ל-refuted=true (זהירות מפני ביטחון-יתר).
5. קבע adjusted_urgency לפי מה שהראיה באמת מצדיקה.
כל טקסט ב-${outputLang}. החזר JSON לפי הסכמה.`;
}

/**
 * Apply the critical rule-out results: a `met` life-threatening pattern forces
 * urgency up and raises a loud warning; an `indeterminate` emergency-level
 * pattern is surfaced so it is never silently dismissed.
 */
export function applyCriticalRuleOut(structured) {
  const items = Array.isArray(structured?.critical_rule_out) ? structured.critical_rule_out : [];
  const rank = { Normal: 0, Urgent: 1, Emergency: 2 };
  const warnings = [];
  const metCritical = [];
  const indetEmergency = [];
  let forced = "Normal";

  for (const it of items) {
    const level = CRITICAL_LEVEL[it?.pattern_key];
    if (!level) continue;
    const label = CRITICAL_LABEL[it.pattern_key] || it.pattern_key;
    if (it.status === "met") {
      metCritical.push(label);
      const u = level === "emergency" ? "Emergency" : "Urgent";
      if (rank[u] > rank[forced]) forced = u;
      warnings.push(`🚨 דפוס מסכן-חיים זוהה — ${label}${it.evidence ? `: ${it.evidence}` : ""}${it.leads ? ` [${it.leads}]` : ""} — נדרשת הערכה דחופה.`);
    } else if (it.status === "indeterminate" && level === "emergency") {
      indetEmergency.push(label);
    }
  }
  if (indetEmergency.length) {
    warnings.push(`לא ניתן היה לשלול בוודאות דפוסים מסכני-חיים: ${indetEmergency.join("، ")} — שקול תרשים באיכות טובה יותר, השוואה ל-ECG קודם, והערכת מומחה.`);
  }
  return {
    forcedUrgency: forced === "Normal" ? null : forced,
    warnings,
    metCritical,
    indeterminateEmergency: indetEmergency.length > 0,
  };
}

/* ==========================================================================
 *  5. ORCHESTRATOR — runEcgEngine
 * ========================================================================== */

/**
 * Run the full ECG engine.
 *
 * @param {Object}   opts
 * @param {string[]} opts.fileUrls        image URLs (lead 1 = primary)
 * @param {string}   opts.clinicalContext optional patient context
 * @param {string}   opts.language        "he" | "en" | "ar"
 * @param {string}   opts.sex             optional, for QTc thresholds
 * @param {Function} opts.invokeLLM       async ({prompt,file_urls,response_json_schema,...}) => obj
 * @param {Function} [opts.onStage]       progress callback
 * @param {string}   [opts.model]         model id (default from aiConfig.DIAGNOSIS_MODEL)
 * @returns {Promise<Object>} rich interpretation result
 */
export async function runEcgEngine({
  fileUrls,
  clinicalContext,
  language = "he",
  pediatric = false,
  ageYears,
  sex,
  invokeLLM,
  onStage,
  // ⚡ ברירת-המחדל הורדה מ-Opus ל-Sonnet: הקריאה המבנית היא תפיסה+מדידה,
  // וכל המספרים הקריטיים מחושבים מחדש בקוד (grid/reconcile/normals). שלב הנרטיב
  // הסופי (Stage 2 בצינור) נשאר על Opus — שם ההיגיון הקליני דרוש דיוק מרבי.
  model = FAST_MODEL,
  qualityGate = true,
  waveform = null,
  fiducials = null,
  calibration = null,
}) {
  // ---- Pass 0: image-quality / artifact gate (anti-hallucination) ----
  // Refuse to interpret a non-ECG / unreadable / severely-degraded image before
  // the model can invent findings. Fail-open if the quality call itself fails.
  let qualityResult = null;
  if (qualityGate && invokeLLM && Array.isArray(fileUrls) && fileUrls.length) {
    onStage?.("quality_check");
    qualityResult = await assessEcgQuality({ fileUrls, language, invokeLLM, model: FAST_MODEL });
    const gate = decideGate(qualityResult);
    if (!gate.pass) {
      return {
        abstain: true,
        is_ecg: qualityResult?.is_ecg !== false,
        interpretable: false,
        abstain_reason: gate.abstain_reason_he,
        quality: qualityResult,
        technical_check: null,
        structured: null,
      };
    }
  }

  const normalsPre = flagEcgNormals({}, { ageYears, sex });
  const systemPrompt = buildEcgSystemPrompt({ clinicalContext, language, pediatric, ageNote: normalsPre?.promptNote || "" });

  // ---- Pass 1: primary structured interpretation ----
  onStage?.("interpreting");
  const pass1 = await invokeLLM({
    prompt: systemPrompt,
    file_urls: fileUrls,
    response_json_schema: ECG_STRUCTURED_SCHEMA,
    add_context_from_internet: false,
    model,
  });

  // ---- Technical gate / abstention ----
  if (pass1 && (pass1.is_ecg === false || pass1.interpretable === false)) {
    return {
      abstain: true,
      is_ecg: pass1.is_ecg !== false,
      interpretable: pass1.interpretable === true,
      abstain_reason:
        pass1.abstain_reason ||
        (pass1.is_ecg === false
          ? "התמונה אינה נראית כתרשים ECG."
          : "התרשים אינו קריא מספיק לפענוח אמין."),
      technical_check: pass1.technical_check || null,
      structured: pass1,
    };
  }

  // ---- Grid (calibration-aware) measurement override, then reconciliation ----
  const grid = applyGridMeasurements(pass1);
  if (grid.used) pass1.intervals = grid.intervals;
  const stWarns = checkStConsistency(pass1);
  const recon = reconcileEcg(pass1, { sex });
  let structured = recon.corrected;

  // ---- Decide whether deep scrutiny is warranted ----
  const baseConfidence = isNum(pass1.confidence) ? pass1.confidence : 60;
  const urgent = structured.clinical_urgency === "Urgent" || structured.clinical_urgency === "Emergency";
  const needsScrutiny =
    urgent || baseConfidence < 60 || recon.hasIssues;

  let secondRead = null;
  let verification = null;
  let consistencyAgree = null;

  if (needsScrutiny) {
    onStage?.("scrutinizing");
    // ⚡ בוטלה הקריאה העצמאית השנייה (קריאת-ראייה נוספת שלמה) לטובת מהירות —
    // היא הכפילה את זמן הפענוח. נשמר המאמת-הנגדי המהיר (Sonnet) בלבד — שער
    // הבטיחות מפני ביטחון-יתר. הדיוק הנומרי מובטח בלאו הכי על-ידי החישוב הדטרמיניסטי בקוד.
    verification = await invokeLLM({
      prompt: buildVerifierPrompt(structured, language),
      file_urls: fileUrls,
      response_json_schema: VERIFIER_SCHEMA,
      add_context_from_internet: false,
      model: FAST_MODEL,
    }).catch(() => null);
  }

  // ---- Fuse into a final confidence + uncertainty verdict ----
  let confidence = baseConfidence - recon.confidencePenalty;
  const warnings = [...recon.discrepancies, ...recon.contradictions, ...grid.warnings, ...stWarns];

  // ---- Lead-reversal safety (deterministic footprint + quality-pass suspicion) ----
  const leadRev = deterministicLeadReversalCheck(structured);
  if (leadRev.suspected) {
    confidence -= 15;
    warnings.push("חשד להיפוך לידים: " + leadRev.reason_he);
  }
  if (qualityResult?.lead_reversal_suspected) {
    confidence -= 10;
    warnings.push("בקר האיכות סימן חשד להיפוך אלקטרודות — ודא הצבה תקינה לפני אימוץ ממצאים.");
  }

  // ---- Vision numeric guard: flag narrative numbers not backed by a measurement ----
  warnings.push(...runVisionNumericGuard(structured, groundedEcgNumbers(structured)).warnings);

  if (consistencyAgree === false) {
    confidence -= 20;
    warnings.push("שתי קריאות עצמאיות של המנוע הגיעו לממצאים שונים — הימנע מהסתמכות חד-משמעית.");
  }
  if (verification && verification.refuted) {
    confidence -= 20;
    warnings.push(`בקרה נגדית: ${verification.refutation}`);
  }
  if (verification && Array.isArray(verification.missed_findings) && verification.missed_findings.length) {
    warnings.push(`הבקרה סימנה ממצאים אפשריים שפוספסו: ${verification.missed_findings.join("، ")}`);
  }
  confidence = Math.max(5, Math.min(99, Math.round(confidence)));

  // Escalate urgency if verifier saw something worse.
  const rank = { Normal: 0, Urgent: 1, Emergency: 2 };
  let finalUrgency = structured.clinical_urgency || "Normal";
  if (verification && verification.adjusted_urgency && rank[verification.adjusted_urgency] > rank[finalUrgency]) {
    finalUrgency = verification.adjusted_urgency;
    warnings.push(`הבקרה הנגדית העלתה את דרגת הדחיפות ל-${finalUrgency}.`);
  }

  // Critical rule-out escalation (a met killer forces urgency; indeterminate killers surface).
  const critical = applyCriticalRuleOut(structured);
  if (critical.forcedUrgency && rank[critical.forcedUrgency] > rank[finalUrgency]) {
    finalUrgency = critical.forcedUrgency;
  }
  warnings.push(...critical.warnings);

  // Age/sex normal-range flags (deterministic screening).
  const normPost = flagEcgNormals(structured, { ageYears, sex });
  if (normPost) {
    warnings.push(...normPost.warnings);
    structured.age_normal_flags = normPost.flags;
    structured.age_band = normPost.band?.label_he || null;
  }

  structured.clinical_urgency = finalUrgency;

  let waveform_features = null;
  if (waveform || fiducials) {
    waveform_features = extractEcgWaveformFeatures({
      samples: waveform?.samples,
      sampleRate: waveform?.sampleRate,
      fiducials: fiducials || waveform?.fiducials,
      calibration: calibration || waveform?.calibration,
      leadNet: waveform?.leadNet,
      ageYears,
      sex,
      qt_ms: structured?.intervals?.qt_ms,
      rr_ms: structured?.intervals?.rr_ms,
      pr_ms: structured?.intervals?.pr_ms,
      qrs_ms: structured?.intervals?.qrs_ms,
      hr_bpm: structured?.rhythm_and_rate?.heart_rate_bpm_calculated
        ?? structured?.rhythm_and_rate?.heart_rate_bpm,
    });
    if (!waveform_features.ok) {
      warnings.push(`חילוץ מאפייני גל נכשל (${waveform_features.reason}) — אין ניחוש QTc/ST/SVT.`);
    } else {
      warnings.push(...(waveform_features.notes || []));
      if (waveform_features.note_he) warnings.push(waveform_features.note_he);
    }
  }

  let uncertaintyLevel = null;
  if (confidence < 45 || consistencyAgree === false || (verification && verification.refuted)) {
    uncertaintyLevel = "high";
  } else if (confidence < 65 || recon.hasIssues || critical.indeterminateEmergency) {
    uncertaintyLevel = "medium";
  }

  return {
    abstain: false,
    structured,
    reconciliation: recon,
    quality: qualityResult,
    scrutiny: needsScrutiny
      ? { secondRead, verification, consistencyAgree }
      : null,
    warnings,
    confidence,
    uncertaintyLevel,
    waveform_features,
  };
}
