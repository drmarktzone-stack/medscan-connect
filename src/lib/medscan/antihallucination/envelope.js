/**
 * MedScan — Refusal & Degradation Envelope
 * מנגנון 6 (Refusal & Uncertainty Protocol)
 *
 * העיקרון: "אין לי מידע מספיק מהימן בנושא זה" הוא **פלט תקין ומלא**,
 * לא כישלון. מערכת בלי מסלול-סירוב מובנה נדחפת להזיה ע"י הלחץ לייצר תשובה.
 *
 * שלושה מצבי-פלט:
 *   full        — עבר את כל השכבות
 *   degraded    — עבר חלקית; טענות שנפסלו הוסרו והוצהרו
 *   insufficient— לא ניתן להפיק פלט קליני אחראי
 */

import { DISCLAIMER_HE } from '../schemas/output.schemas.js';

export const OUTPUT_STATUS = {
  FULL: 'full',
  DEGRADED: 'degraded',
  INSUFFICIENT: 'insufficient',
};

export const INSUFFICIENT_MESSAGE_HE =
  'אין לי מידע מספיק מהימן בנושא זה.';

/** נוסחי-סירוב לפי סיבה — ברורים, בלי התנצלות ובלי מילוי בפרוזה. */
const REASON_TEXT_HE = {
  empty_fact_block:
    'לא נמצא ידע מאומת ב-Knowledge Base שרלוונטי לנתונים שהוזנו. ' +
    'ייתכן שהתחום עדיין לא יובא מנלסון, או שהפריטים הרלוונטיים טרם אומתו רפואית.',
  no_verified_knowledge:
    'הידע הרלוונטי קיים במערכת אך כולו בסטטוס טיוטה לא-מאומתת. ' +
    'במצב קליני מוצג רק ידע שאומת ע"י רופא/ה מול המקור.',
  blocking_violations:
    'הפלט שהופק לא עמד בבדיקות העיגון והבטיחות הפנימיות, ולכן אינו מוצג. ' +
    'הצגת פלט שאינו מעוגן מסוכנת יותר מהיעדר פלט.',
  unsourced_critical_numbers:
    'הפלט כלל ערכים מספריים קריטיים (מינון/סף/קצב) שאין להם מקור מאומת. ' +
    'ערכים כאלה לעולם אינם מוצגים.',
  self_check_failed:
    'שכבת הבדיקה הפנימית קבעה שהפלט חורג מהידע המאומת.',
  llm_schema_failure:
    'מנוע הנימוק לא החזיר פלט תקין לפי חוזה הפלט המחייב.',
  fabricated_attribution:
    'הפלט ייחס טענות למקור או לשם שאינם קיימים במערכת. ציטוט מזויף מסוכן ' +
    'יותר מהיעדר ציטוט, כי הוא נראה בדיוק כמו טענה שניתן לבדוק.',
  critical_omission:
    'המנוע הדטרמיניסטי הפעיל ממצא בחשד אדום, והפלט לא התייחס אליו כלל. ' +
    'השמטה של ממצא קריטי חמורה מהמצאה — היא נראית כמו תשובה שלמה.',
  unsafe_input:
    'בנתונים שהוזנו נמצא טקסט שמנסה לשנות את אופן הפעולה של המערכת ' +
    '(ולא לתאר מצב קליני). הניתוח לא בוצע.',
  fabricated_citation:
    'הפלט כלל מזהה ציטוט (PMID/DOI) שלא נשלף ע"י המערכת. המודל ' +
    'אינו רשאי לכתוב מזהי ציטוט — רק להפנות למאמר שנשלף בפועל. ' +
    'מזהה שנכתב מהזיכרון הוא הזיה גם אם הוא במקרה קיים.',
};

/**
 * בונה מעטפת "אין מידע מספיק".
 * שים לב: היא עדיין מחזירה red_flags אם חושבו — בטיחות אינה מותנית
 * בהצלחת שכבת הנימוק.
 */
export function buildInsufficientEnvelope({
  reasons = [],
  redFlags = [],
  factBlock = null,
  engine = null,
  details = [],
} = {}) {
  const reasonTexts = reasons.map((r) => REASON_TEXT_HE[r] ?? r);

  return {
    status: OUTPUT_STATUS.INSUFFICIENT,
    engine,
    // בטיחות עוברת תמיד, גם כשהנימוק נכשל
    red_flags: redFlags,
    claims: [],
    directions: [],
    contradictions: [],
    unknowns_he: reasonTexts,
    overall_suspicion: redFlags.length ? 'red' : 'insufficient',
    uncertainty_note_he: INSUFFICIENT_MESSAGE_HE,
    message_he: INSUFFICIENT_MESSAGE_HE,
    reasons_he: reasonTexts,
    what_would_help_he: buildWhatWouldHelp(reasons, factBlock),
    audit: {
      reason_codes: reasons,
      details,
      fact_block_size: factBlock?.facts?.length ?? 0,
      verified_kb_present: Boolean(factBlock?.hasVerifiedClinicalContent),
    },
    disclaimer_he: DISCLAIMER_HE,
  };
}

/** מה יאפשר תשובה טובה יותר — סירוב שימושי, לא סירוב סתום. */
function buildWhatWouldHelp(reasons, factBlock) {
  const out = [];
  if (reasons.includes('empty_fact_block')) {
    out.push('ייבוא הפרק הרלוונטי מנלסון ל-Knowledge Base ואימותו רפואית.');
    out.push('הזנת ממצאים קליניים נוספים שיאפשרו התאמת כללים ודפוסים קיימים.');
  }
  if (reasons.includes('no_verified_knowledge')) {
    out.push(
      `קיימים ${factBlock?.draftRejectedCount ?? 0} פריטי ידע רלוונטיים בסטטוס טיוטה. ` +
      'אימות רפואי שלהם מול נלסון יאפשר שימוש בהם — אין צורך בייבוא חדש.'
    );
  }
  if (reasons.includes('unsourced_critical_numbers')) {
    out.push('הזנת המינון/הסף הנדרש כערך מחשבון דטרמיניסטי מאומת, במקום הסתמכות על מנוע הנימוק.');
  }
  if (reasons.includes('fabricated_attribution')) {
    out.push('ייבוא הנושא שאליו ניסה הפלט להפנות, או הרצה חוזרת — ייחוס מזויף לרוב אינו חוזר.');
  }
  if (reasons.includes('critical_omission')) {
    out.push('הרצה חוזרת. אם ההשמטה חוזרת — סימן שהניסוח של פריט ה-KB אינו ברור מספיק למנוע הנימוק.');
  }
  if (reasons.includes('unsafe_input')) {
    out.push('בדיקת הטקסט שהודבק (סיכום מחלה / פלט OCR) והסרת הקטע שסומן, ואז הרצה חוזרת.');
  }
  if (reasons.includes('fabricated_citation')) {
    out.push('הרצה חוזרת — מזהה שנכתב מהזיכרון לרוב אינו חוזר על עצמו.');
    out.push('אם התופעה חוזרת — יש לבדוק ששליפת הספרות בכלל החזירה תוצאות.');
  }
  if (!out.length) out.push('הזנת נתונים קליניים נוספים או הרחבת בסיס הידע המאומת.');
  return out;
}

/**
 * בונה פלט "מוחלש": הפלט הופק אך טענות מסוימות הוסרו.
 * ההסרה **מוצהרת** — אף פעם לא שקטה. שקיפות היא חלק מהבטיחות.
 */
export function buildDegradedEnvelope({
  output,
  removedClaims = [],
  violations = [],
  adjustments = [],
  engine = null,
  factBlock = null,
}) {
  return {
    ...output,
    status: OUTPUT_STATUS.DEGRADED,
    engine,
    integrity: {
      removed_claims: removedClaims,
      removed_count: removedClaims.length,
      violations_summary: summarizeViolations(violations),
      confidence_adjustments: adjustments,
      note_he:
        'חלק מהתוכן שהופק הוסר או הוחלש ע"י שכבת האנטי-הזיה, מכיוון שלא עמד ' +
        'בדרישות העיגון. מה שהוסר מפורט כאן ולא נמחק בשקט.',
    },
    audit: buildAudit({ factBlock, violations, adjustments }),
    disclaimer_he: output?.disclaimer_he || DISCLAIMER_HE,
  };
}

/** פלט מלא — עבר הכל. עדיין נושא audit לצורך בקרה. */
export function buildFullEnvelope({ output, adjustments = [], violations = [], engine = null, factBlock = null }) {
  return {
    ...output,
    status: OUTPUT_STATUS.FULL,
    engine,
    integrity: {
      removed_claims: [],
      removed_count: 0,
      violations_summary: summarizeViolations(violations),
      confidence_adjustments: adjustments,
      note_he: 'הפלט עבר את כל שכבות האימות הפנימיות.',
    },
    audit: buildAudit({ factBlock, violations, adjustments }),
    disclaimer_he: output?.disclaimer_he || DISCLAIMER_HE,
  };
}

function buildAudit({ factBlock, violations, adjustments }) {
  return {
    fact_block_size: factBlock?.facts?.length ?? 0,
    fact_block_kb_items: (factBlock?.facts ?? []).filter((f) => f.kind === 'kb').length,
    fact_block_draft_items: (factBlock?.facts ?? []).filter((f) => f.is_draft).length,
    verified_kb_present: Boolean(factBlock?.hasVerifiedClinicalContent),
    rejected_kb_items: (factBlock?.rejected ?? []).length,
    anchors_used: [...(factBlock?.anchors ?? [])],
    violation_count: violations.length,
    blocking_count: violations.filter((v) => v.severity === 'block').length,
    calibration_count: adjustments.length,
    checked_at: new Date().toISOString(),
  };
}

function summarizeViolations(violations = []) {
  const byCode = {};
  for (const v of violations) {
    byCode[v.code] = byCode[v.code] ?? { count: 0, severity: v.severity, sample_he: v.message_he };
    byCode[v.code].count += 1;
  }
  return byCode;
}

/**
 * מסיר טענות/כיוונים שנפסלו, ומחזיר גם את מה שהוסר (לשקיפות).
 */
export function pruneOutput({ output, blockedClaimIds = [], blockedDirectionIds = [] }) {
  const clone = structuredClone(output);
  const removed = [];

  const claimSet = new Set(blockedClaimIds);
  const dirSet = new Set(blockedDirectionIds);

  if (Array.isArray(clone.claims)) {
    clone.claims = clone.claims.filter((c) => {
      if (claimSet.has(c.claim_id)) { removed.push({ type: 'claim', id: c.claim_id, text_he: c.text_he }); return false; }
      return true;
    });
  }

  for (const key of ['directions', 'differential']) {
    if (!Array.isArray(clone[key])) continue;
    clone[key] = clone[key].filter((d) => {
      if (dirSet.has(d.direction_id)) {
        removed.push({ type: key, id: d.direction_id, text_he: d.diagnosis_direction_he });
        return false;
      }
      return true;
    });
  }

  return { output: clone, removed };
}

export { DISCLAIMER_HE, REASON_TEXT_HE };
