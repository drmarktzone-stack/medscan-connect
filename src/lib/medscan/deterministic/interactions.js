/**
 * MedScan — Drug Interaction Matching (דטרמיניסטי)
 *
 * ⚠ **MedScan אינו מסיק אינטראקציות מהידע הכללי של מנוע השפה.**
 *
 * זו אחת מנקודות הבטיחות החדות ביותר במערכת. מודל שפה "יודע" הרבה
 * אינטראקציות — ובדיוק לכן הוא מסוכן כאן: הוא ייתן תשובה משכנעת גם על
 * צירוף שהוא לא מכיר, וגם ישמיט אינטראקציה שהוא לא נזכר בה. שני
 * הכיוונים גרועים, והשני גרוע יותר: השמטה נראית כמו "אין אינטראקציה".
 *
 * לכן ההתאמה כאן דטרמיניסטית לחלוטין, מול ישות `DrugInteraction`
 * מאומתת, ו**מצב "אין מקור מחובר" מוצהר במפורש** ולעולם לא נבלע.
 *
 * ההבחנה שחייבת להישמר בממשק:
 *   "לא נמצאו אינטראקציות"  ≠  "לא בוצעה בדיקת אינטראקציות"
 * הראשון הוא ממצא. השני הוא היעדר בדיקה. בלבול ביניהם הוא באג בטיחותי.
 */

import { normalizeText } from '../rules/rulesEngine.js';

export const INTERACTION_STATUS = {
  CHECKED: 'checked',
  NO_SOURCE: 'no_source',
  PARTIAL: 'partial_source',
};

const SEVERITY_ORDER = ['minor', 'moderate', 'major', 'contraindicated'];
const SEVERITY_TO_SUSPICION = {
  minor: 'green',
  moderate: 'yellow',
  major: 'red',
  contraindicated: 'red',
};

const SEVERITY_HE = {
  minor: 'קלה',
  moderate: 'בינונית',
  major: 'משמעותית',
  contraindicated: 'התוויית-נגד',
};

/** התאמה גמישה של שם תרופה — שם מסחרי/גנרי, עברית/אנגלית. */
function drugMatches(recordName, patientDrugs) {
  const r = normalizeText(recordName);
  if (!r) return null;
  for (const d of patientDrugs) {
    const n = normalizeText(d);
    if (!n) continue;
    if (n === r || n.includes(r) || r.includes(n)) return d;
  }
  return null;
}

/**
 * מתאים אינטראקציות דטרמיניסטית.
 *
 * @param {object} params
 * @param {object[]} params.interactionKb  רשומות DrugInteraction
 * @param {string[]} params.medications    תרופות המטופל
 * @param {string[]} params.conditions     מצבי רקע
 * @param {string} [params.mode]
 * @returns {{status: string, matched: object[], checkedDrugs: string[], note_he: string, unverifiedCount: number}}
 */
export function matchInteractions({
  interactionKb = [],
  medications = [],
  conditions = [],
  mode = 'clinical',
}) {
  const usable = interactionKb.filter((r) => {
    const s = r.verification_status ?? 'draft_needs_verification';
    if (s === 'flagged') return false;
    return mode === 'clinical' ? s === 'verified' : true;
  });

  const unverifiedCount = interactionKb.length - usable.length;

  // אין מקור כלל — המצב שחייב להיאמר בקול.
  if (!usable.length) {
    return {
      status: INTERACTION_STATUS.NO_SOURCE,
      matched: [],
      checkedDrugs: [],
      unverifiedCount,
      note_he:
        interactionKb.length === 0
          ? 'לא בוצעה בדיקת אינטראקציות: לא מחובר מסד אינטראקציות מאומת. ' +
            'היעדר התראה כאן אינו אומר שאין אינטראקציה.'
          : `לא בוצעה בדיקת אינטראקציות: כל ${interactionKb.length} הרשומות הקיימות ` +
            'בסטטוס טיוטה ולא אומתו. היעדר התראה אינו אומר שאין אינטראקציה.',
    };
  }

  if (!medications.length) {
    return {
      status: INTERACTION_STATUS.CHECKED,
      matched: [],
      checkedDrugs: [],
      unverifiedCount,
      note_he: 'לא הוזנו תרופות, ולכן לא נבדקו אינטראקציות תרופה-תרופה.',
    };
  }

  const matched = [];

  for (const rec of usable) {
    const hitA = drugMatches(rec.drug_a, medications);
    if (!hitA) continue;

    let hitB = null;
    let kind = null;

    if (rec.drug_b) {
      hitB = drugMatches(rec.drug_b, medications);
      // אותה תרופה לא יכולה להתאים לשני הצדדים
      if (!hitB || hitB === hitA) continue;
      kind = 'drug_drug';
    } else if (rec.condition) {
      hitB = drugMatches(rec.condition, conditions);
      if (!hitB) continue;
      kind = 'drug_condition';
    } else {
      continue;
    }

    matched.push({
      interaction_key: rec.interaction_key,
      kind,
      severity: rec.severity ?? 'moderate',
      severity_he: SEVERITY_HE[rec.severity ?? 'moderate'],
      suspicion: SEVERITY_TO_SUSPICION[rec.severity ?? 'moderate'] ?? 'yellow',
      involved: [hitA, hitB],
      effect_he: rec.effect_he,
      mechanism_he: rec.mechanism_he ?? null,
      management_he: rec.management_he ?? null,
      source: rec.source ?? null,
      source_anchor: rec.source ?? null,
    });
  }

  matched.sort(
    (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity)
  );

  const status = unverifiedCount > 0 ? INTERACTION_STATUS.PARTIAL : INTERACTION_STATUS.CHECKED;

  let note_he;
  if (!matched.length) {
    note_he =
      `נבדקו ${usable.length} רשומות אינטראקציה מאומתות מול ${medications.length} תרופות. ` +
      'לא נמצאה התאמה. זהו ממצא ביחס למסד שמחובר בלבד — הוא אינו שולל אינטראקציות שאינן בו.';
  } else {
    note_he = `נמצאו ${matched.length} אינטראקציות מתוך ${usable.length} רשומות מאומתות.`;
  }
  if (unverifiedCount > 0) {
    note_he += ` ${unverifiedCount} רשומות נוספות לא נכללו כי טרם אומתו.`;
  }

  return { status, matched, checkedDrugs: medications, unverifiedCount, note_he };
}

/** ממיר אינטראקציות שהותאמו לפריטי FACT BLOCK. */
export function interactionsToKbItems(matched = []) {
  return matched.map((m) => ({
    assoc_key: m.interaction_key,
    title_he: `אינטראקציה (${m.severity_he}): ${m.involved.join(' + ')}`,
    implies_he: m.effect_he,
    mechanism_he: m.mechanism_he,
    action_he: m.management_he,
    suspicion: m.suspicion,
    source_anchor: m.source_anchor,
    verification_status: 'verified',
  }));
}
