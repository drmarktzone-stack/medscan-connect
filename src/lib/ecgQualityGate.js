/**
 * ============================================================================
 *  MedScan AI — ECG Quality & Artifact Gate (anti-hallucination, Pass 0)
 * ============================================================================
 *  Runs BEFORE the diagnostic interpretation. Its only job is to decide whether
 *  the image is a real, readable ECG worth interpreting at all. A model asked to
 *  read a blurry / cropped / miscalibrated / lead-reversed tracing will invent
 *  findings with confidence — this gate stops that at the door.
 *
 *  Two layers:
 *   1. A dedicated LLM quality pass (FAST_MODEL) that assesses IMAGE QUALITY
 *      ONLY (never diagnoses) against a strict JSON schema.
 *   2. A deterministic, conservative limb-lead-reversal footprint check on the
 *      structured reading (raises a warning; never abstains — a lead-reversed
 *      ECG is still a real ECG and true pathology must stay interpretable).
 *
 *  Fail-open on the quality pass (if the extra call fails we don't block — the
 *  engine's own technical gate still guards), fail-safe on interpretability.
 * ============================================================================
 */

import { FAST_MODEL } from "./aiConfig";

/** Minimum quality score (0-100) below which we refuse to interpret. Deliberately
 *  conservative: an unnecessary abstain is safer than a confident misread. */
export const QUALITY_MIN = 45;

export const ECG_QUALITY_SCHEMA = {
  type: "object",
  properties: {
    is_ecg: { type: "boolean", description: "האם התמונה היא בכלל תרשים ECG" },
    is_interpretable: { type: "boolean", description: "האם התרשים קריא ובר-פענוח אמין" },
    quality_score: { type: "integer", minimum: 0, maximum: 100, description: "0-100, 100=מצוין" },
    calibration_visible: { type: "boolean", description: "האם סימן הכיול (10mm/mV) ומהירות הנייר נראים" },
    lead_reversal_suspected: {
      type: "boolean",
      description: "חשד להיפוך לידים (קלאסי: P ו-QRS שליליים בהובלה I עם חיוביים ב-aVR)",
    },
    issues: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "baseline_wander",
          "emg_noise",
          "ac_interference_50hz",
          "clipping",
          "lead_missing",
          "tracing_cut_off",
          "low_contrast",
          "skew_rotation",
          "calibration_unknown",
          "possible_lead_reversal",
          "duplicate_or_mismatched_leads",
        ],
      },
    },
    issue_notes_he: { type: "string", description: "פירוט קצר בעברית של בעיות האיכות שזוהו" },
    recommended_action_he: { type: "string", description: "מה לתקן/לצלם מחדש כדי לאפשר פענוח אמין" },
  },
  required: ["is_ecg", "is_interpretable", "quality_score", "issues"],
};

function buildQualityPrompt() {
  return `אתה בקר-איכות של תרשימי ECG. **אל תאבחן ואל תפרש** — הערך אך ורק את איכות התמונה והאם היא ברת-פענוח אמין.

בדוק שיטתית:
- האם זה בכלל תרשים ECG (ולא תמונה אחרת).
- קריאוּת: חדות, תאורה, ניגודיות, חיתוך/חוסר בהובלות, רצועת קצב חתוכה.
- כיול: האם סימן הכיול (10mm/mV) ומהירות הנייר (25mm/s) נראים; אם לא — calibration_unknown.
- רעש: baseline wander, רעש שריר (EMG), הפרעת רשת 50Hz, clipping/רוויה.
- הצבה: סיבוב/הטיה של הצילום, הובלות כפולות/לא-תואמות.
- **חשד להיפוך לידים** (limb-lead reversal) — קלאסי: גל P וגם QRS שליליים בהובלה I עם חיוביים ב-aVR.

דרג quality_score בין 0 ל-100 (100=מצוין). **היה שמרן**: אם התמונה גבולית, תן ציון נמוך — עדיף לסרב מלפענח בביטחון. אם התמונה תקינה לחלוטין — is_interpretable=true, issues ריק.

החזר אך ורק JSON התואם לסכמה. recommended_action_he בעברית ומעשי.`;
}

/**
 * LLM quality pass (image quality only). Returns the structured result, or null
 * if no image / the call fails (fail-open — the engine gate still guards).
 */
export async function assessEcgQuality({ fileUrls, language = "he", invokeLLM, model = FAST_MODEL }) {
  if (!invokeLLM || !Array.isArray(fileUrls) || fileUrls.length === 0) return null;
  try {
    return await invokeLLM({
      prompt: buildQualityPrompt(),
      file_urls: fileUrls,
      response_json_schema: ECG_QUALITY_SCHEMA,
      add_context_from_internet: false,
      model,
    });
  } catch {
    return null;
  }
}

/**
 * Deterministic, conservative limb-lead-reversal footprint from the structured
 * reading. The structured schema has no per-lead polarity, so we only flag the
 * classic sinus + northwest/extreme-axis footprint of LA/RA reversal, and only
 * as a WARNING — never an abstain (true extreme-axis pathology stays readable).
 */
export function deterministicLeadReversalCheck(structured) {
  if (!structured) return { suspected: false };
  const rhythmType = structured?.rhythm_and_rate?.rhythm_type || "";
  const sinus =
    /sinus/i.test(rhythmType) && structured?.rhythm_and_rate?.p_wave_present !== false;

  // —— שכבה א': פולריות אמיתית (הסימן הודאי יותר) ——
  // בהיפוך LA/RA: ציר גל P מתהפך — P הופך שלילי ב-I וחיובי ב-aVR (הפוך מהתקין),
  // ולעיתים QRS ב-I הופך שלילי. זהו דפוס ספציפי יותר מציר בלבד.
  const lp = structured?.lead_polarity || {};
  const I_p = lp.I_p, aVR_p = lp.aVR_p, I_qrs = lp.I_qrs;
  const pAxisFlipped = I_p === "negative" && aVR_p === "positive";
  const iGloballyNegative = I_p === "negative" && I_qrs === "negative";
  if (sinus && (pAxisFlipped || iGloballyNegative)) {
    return {
      suspected: true,
      method: "polarity",
      reason_he:
        `פולריות הפוכה בקצב סינוס (` +
        `${pAxisFlipped ? "P שלילי ב-I וחיובי ב-aVR" : "P ו-QRS שליליים ב-I"}` +
        `) — דפוס אופייני להיפוך אלקטרודות זרוע שמאל/ימין (LA/RA). ודא הצבת אלקטרודות לפני אימוץ ממצא.`,
    };
  }

  // —— שכבה ב': גיבוי מבוסס-ציר (כשאין פולריות) ——
  const deg = structured?.axis?.degrees;
  if (typeof deg === "number" && sinus && deg <= -90 && deg >= -180) {
    return {
      suspected: true,
      method: "axis",
      reason_he: `ציר צפוני-מערבי (${deg}°) בקצב סינוס — דפוס אפשרי של היפוך אלקטרודות גפיים (LA/RA). ודא הצבת אלקטרודות לפני אימוץ ממצא.`,
    };
  }
  return { suspected: false };
}

/**
 * Turns the quality-pass result into a gate decision.
 *  - null result → pass (fail-open; the engine's technical gate still guards).
 *  - abstain only on: not-an-ECG, not-interpretable, or score < QUALITY_MIN.
 *  - lead reversal is surfaced but does NOT abstain (handled as a warning).
 */
export function decideGate(qualityLLM) {
  if (!qualityLLM) return { pass: true, quality: null, issues: [], abstain_reason_he: "" };
  const issues = Array.isArray(qualityLLM.issues) ? qualityLLM.issues : [];
  const score = Number.isFinite(qualityLLM.quality_score) ? qualityLLM.quality_score : 100;
  let pass = true;
  let reason = "";
  if (qualityLLM.is_ecg === false) {
    pass = false;
    reason = qualityLLM.recommended_action_he || "התמונה אינה נראית כתרשים ECG.";
  } else if (qualityLLM.is_interpretable === false) {
    pass = false;
    reason = qualityLLM.recommended_action_he || "התרשים אינו קריא מספיק לפענוח אמין.";
  } else if (score < QUALITY_MIN) {
    pass = false;
    reason =
      qualityLLM.recommended_action_he ||
      `איכות התרשים נמוכה מדי (${score}/100) לפענוח אמין. צלם מחדש: ודא שכל 12 ההובלות ורצועת הקצב נראות, כיול 25mm/s ו-10mm/mV, ותאורה אחידה.`;
  }
  return {
    pass,
    quality: qualityLLM,
    issues,
    quality_score: score,
    abstain_reason_he: reason,
    lead_reversal_suspected: qualityLLM.lead_reversal_suspected === true,
  };
}
