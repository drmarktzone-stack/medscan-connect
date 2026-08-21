/**
 * ============================================================================
 *  Generic Adversarial Verifier  (anti-hallucination for skin & radiology)
 * ============================================================================
 *
 *  A second, independent reviewer whose job is NOT to agree but to try to
 *  REFUTE the primary diagnosis produced by the main pipeline. If the evidence
 *  in the image doesn't actually support the call, the verifier says so, and
 *  the pipeline downgrades to explicit uncertainty instead of presenting a
 *  confident (possibly hallucinated) answer.
 *
 *  Used for non-ECG domains on urgent / uncertain reads (ECG has its own
 *  adversarial pass inside ecgEngine.js). This is the single most effective
 *  technique for cutting confident-but-wrong findings.
 * ============================================================================
 */

import { FAST_MODEL } from "./aiConfig";

const langNames = { he: "Hebrew", en: "English", ar: "Arabic" };

const domainRoles = {
  skin: { he: "דרמטולוג/ית בכיר/ה", en: "senior dermatologist", ar: "طبيب/ة جلدية أول" },
  radiology: { he: "רדיולוג/ית בכיר/ה", en: "senior radiologist", ar: "أخصائي/ة أشعة أول" },
  ecg: { he: "קרדיולוג/ית בכיר/ה", en: "senior cardiologist", ar: "طبيب/ة قلب أول" },
};

export const VERIFY_SCHEMA = {
  type: "object",
  properties: {
    refuted: { type: "boolean", description: "Is the primary diagnosis NOT sufficiently supported by visible evidence?" },
    refutation: { type: "string", description: "Why — or a confirmation if not refuted" },
    missed_findings: { type: "array", items: { type: "string" }, description: "Important findings that may have been missed (esp. dangerous ones)" },
    adjusted_severity: { type: "string", enum: ["normal", "mild", "moderate", "severe", "urgent"] },
    verifier_confidence: { type: "number" },
  },
  required: ["refuted", "refutation"],
};

/**
 * Run the adversarial verifier.
 * @returns {Promise<object|null>} verdict, or null on failure.
 */
export async function verifyDiagnosis({
  fileUrls,
  analysisType,
  primaryDiagnosis,
  summary,
  severity,
  measurementsText,
  language = "he",
  invokeLLM,
  model = FAST_MODEL,
}) {
  const outputLang = langNames[language] || "Hebrew";
  const role = (domainRoles[analysisType] || domainRoles.skin)[language] || (domainRoles[analysisType] || domainRoles.skin).he;

  return invokeLLM({
    prompt: `אתה ${role} בתפקיד מבקר-נגדי (adversarial reviewer). קיבלת ניתוח של קולגה. תפקידך אינו להסכים — אלא **לנסות להפריך** את האבחנה העיקרית: לבחון האם הראיה שנראית בתמונה באמת תומכת בה, לחפש הסברים חלופיים, ולזהות ממצאים חשובים (במיוחד מסכני-חיים) שאולי פוספסו.

## הניתוח לבדיקה
- אבחנה עיקרית: ${primaryDiagnosis || "—"}
- סיכום: ${summary || "—"}
- חומרה מוצהרת: ${severity || "—"}
${measurementsText ? `- מדידות שחולצו:\n${measurementsText}` : ""}

## הוראות
1. בחן שוב את התמונה בעצמך, מאפס.
2. אם הראיה חלשה / חסרה / סותרת את האבחנה → refuted=true, והסבר מדוע.
3. אם משהו קריטי פוספס → פרט ב-missed_findings.
4. בברירת מחדל, אם אינך בטוח שהראיה מספקת — נטה ל-refuted=true (זהירות מפני ביטחון-יתר והזיות).
5. קבע adjusted_severity לפי מה שהראיה באמת מצדיקה.
כל טקסט ב-${outputLang}. החזר JSON לפי הסכמה בלבד.`,
    file_urls: fileUrls,
    response_json_schema: VERIFY_SCHEMA,
    add_context_from_internet: false,
    model,
  });
}
