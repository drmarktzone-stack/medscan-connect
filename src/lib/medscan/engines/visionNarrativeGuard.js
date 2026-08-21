/**
 * MedScan — Numeric Guard על הנרטיב של מודולי ה-Vision
 *
 * ## למה המודול הזה קיים בנפרד
 *
 * שלבי 1 ו-2 של `analysisPipeline` **קוראים תמונה**. `groundedInvoke` אינו
 * יכול לעטוף אותם: הוא בנוי סביב FACT BLOCK סגור ובמפורש אינו מקבל
 * `file_urls`. אי-אפשר לעגן "מה אני רואה" ברשימת עובדות — תצפית אינה טענה
 * שנגזרת ממקור, היא המקור.
 *
 * לכן הפרשנות המעוגנת רצה בנפרד (`visionGrounded.js`), והפלט הקיים —
 * summary · analysis · guideline · criteria_analysis — נשאר כפי שהוא.
 *
 * אבל הפלט הזה מוצג לרופא/ה, והוא מכיל **מספרים**. מינון, סף, מרווח, אחוז.
 * זו בדיוק ההזיה שמנגנון ה-numericGuard נבנה נגדה: נרטיב שגוי רופא/ה מזהה,
 * מינון שגוי נראה סביר. המודול הזה סוגר את הפער.
 *
 * ## מה הוא בודק
 *
 * כל אסימון מספרי בטקסט המיועד-למשתמש נבדק מול מאגר המספרים שנצפו בפועל:
 * המדידות שחולצו בשלב 1, הקריאה המובנית של מנוע התחום, ההקשר הקליני
 * שהרופא/ה הזין/ה, ותיאורי המקרים התואמים מהמאגר.
 *
 * ## מה הוא **אינו** בודק — ויש להבין זאת לפני שסומכים עליו
 *
 * הוא מאמת **עקיבות**, לא **נכונות**. מספר שקורא-התמונה בשלב 1 מדד שגוי
 * ייחשב כאן "מקורי" לחלוטין, כי הוא אכן נצפה. הגנה מפני מדידה שגויה היא
 * תפקידם של מנועי התחום (ecgEngine/radiologyEngine/skinEngine) ושל
 * שער האבסטנציה שלהם — לא של המודול הזה.
 *
 * מה שהוא כן מונע: מספר שהופיע **יש מאין** בשלב הניסוח. זה המקרה שבו
 * המודל משלים סף או מינון מזיכרון ההכשרה שלו ומגיש אותו כחלק מהניתוח.
 */

import { numericGuard, redactUnsourcedNumbers } from '../antihallucination/numericGuard.js';
import { extractNumbers } from '../antihallucination/factBlock.js';
import { validateScope } from '../antihallucination/validators.js';

/** השדות בפלט האבחון שהרופא/ה קורא/ת בפועל. */
const NARRATIVE_FIELDS = ['summary', 'analysis', 'guideline'];

/**
 * בונה את קבוצת המספרים שנצפו בפועל — ה\"מקור\" שמולו נבדק הנרטיב.
 *
 * שים לב שהמדידות נכנסות **גם** דרך הערך וגם דרך ההערה: מדידה כמו
 * «QTc: 470 מילי-שניות (גבולי)» תורמת את 470, ואם ההערה מזכירה סף —
 * גם אותו. זה מכוון: מה שקורא-התמונה ראה או ציטט הוא מקור לגיטימי לניסוח.
 */
function collectObservedNumbers({ measurements, engineStructured, clinicalContext, matchedCasesText, redFlags }) {
  const allowed = new Set();

  const absorb = (value) => {
    if (value == null) return;
    for (const n of extractNumbers(String(value))) allowed.add(n);
  };

  for (const m of measurements ?? []) {
    absorb(m?.parameter);
    absorb(m?.value);
    absorb(m?.notes);
  }

  // הקריאה המובנית של מנוע התחום — כל השדות, בעומק.
  const walk = (node, depth = 0) => {
    if (node == null || depth > 6) return;
    if (typeof node === 'string' || typeof node === 'number') return absorb(node);
    if (Array.isArray(node)) return node.forEach((v) => walk(v, depth + 1));
    if (typeof node === 'object') Object.values(node).forEach((v) => walk(v, depth + 1));
  };
  walk(engineStructured);

  absorb(clinicalContext);
  absorb(redFlags);
  absorb(matchedCasesText);

  return allowed;
}

/**
 * @returns {{
 *   integrity: object,
 *   diagnosis: object,   // עותק, עם חסימות מנוטרלות
 * }}
 */
export function guardVisionNarrative({
  diagnosis,
  measurements = [],
  engineStructured = null,
  clinicalContext = null,
  matchedCasesText = '',
  redFlags = '',
}) {
  const allowedNumbers = collectObservedNumbers({
    measurements, engineStructured, clinicalContext, matchedCasesText, redFlags,
  });
  const pseudoFactBlock = { allowedNumbers };

  // בודקים רק את מה שנקרא. תיבות התחום (findings) הן קואורדינטות —
  // מספרים טכניים שאינם טענה קלינית, ולכן אינם נבדקים.
  const subject = {};
  for (const f of NARRATIVE_FIELDS) if (diagnosis?.[f]) subject[f] = diagnosis[f];
  subject.criteria_analysis = (diagnosis?.criteria_analysis ?? []).map((ca) => ({
    title: ca?.title,
    diagnosis: ca?.diagnosis,
    recommendation: ca?.recommendation,
    criteria: (ca?.criteria ?? []).map((c) => ({ criterion: c?.criterion, evidence: c?.evidence })),
  }));

  const result = numericGuard(subject, pseudoFactBlock);

  // ── מנדט: לעולם לא אבחנה סופית ──
  // אותה בדיקה דטרמיניסטית (validateScope) שרצה במסלול המעוגן — כאן על
  // נרטיב ה-Vision. מאתרת ניסוחי "האבחנה היא", ודאות מוחלטת, שלילה
  // גורפת והחלטות דיספוזיציה/מתן — חריגה מגבול הכלי (תמיכה-בהחלטה בלבד).
  let mandateViolations = [];
  try {
    mandateViolations = validateScope(subject) || [];
  } catch {
    mandateViolations = [];
  }

  const out = { ...diagnosis };
  const redactedFields = [];

  // רק חומרת block מנוטרלת. warn מוצג כפי שהוא ומדווח — הסרת כל מספר
  // שאינו מדויק-מקור תרוקן את הניתוח מתוכן ותזיק יותר משתועיל.
  if (result.blocked.length) {
    const blockedPaths = new Set(result.blocked.map((b) => String(b.path).split('.')[0].split('[')[0]));
    for (const f of NARRATIVE_FIELDS) {
      if (!blockedPaths.has(f) || !out[f]) continue;
      out[f] = redactUnsourcedNumbers(out[f], pseudoFactBlock);
      redactedFields.push(f);
    }
  }

  const integrity = {
    checked_numbers: result.checkedCount,
    mandate_ok: mandateViolations.length === 0,
    mandate_violations: mandateViolations.map((v) => ({ path: v.path, why: v.why, message_he: v.message_he })),
    mandate_note_he: mandateViolations.length
      ? 'זוהה ניסוח החורג ממנדט הכלי (אבחנה סופית / ודאות מוחלטת / שלילה גורפת / החלטת דיספוזיציה או מתן). הכלי הוא תמיכה בהחלטה בלבד — יש להתייחס לניסוח זה בביקורתיות; ההכרעה והאחריות הן של הרופא/ה.'
      : '',
    sourced_from: 'מדידות שחולצו מהתמונה · הקריאה המובנית של מנוע התחום · ההקשר הקליני · מקרי הייחוס',
    violations: result.violations,
    blocked: result.blocked,
    redacted_fields: redactedFields,
    ok: result.ok,
    note_he: result.ok
      ? 'כל המספרים בניתוח נמצאו במדידות שנצפו או בהקשר שסופק.'
      : 'נמצאו מספרים בניתוח שאין להם מקור בתצפית. מספרים בהקשר של מינון, ' +
        'קצב או סף נוטרלו והוחלפו בסימון מפורש; היתר מוצגים לצד אזהרה.',
    limitation_he:
      'בדיקה זו מאמתת שלמספר יש מקור בתצפית — לא שהתצפית נכונה. ' +
      'מדידה שגויה של קורא-התמונה תיחשב כאן כמקורית.',
  };

  return { diagnosis: out, integrity };
}
