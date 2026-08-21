/**
 * MedScan — מיפוי חילוץ מאומת לרשומות KB
 *
 * ## למה הקובץ הזה קיים
 * המיפוי הזה היה קיים בשני עותקים — אחד במסלול הדפדפן ואחד בסקריפט
 * Node. שני העותקים כבר הספיקו להיפרד: אחד המיר `conditions[].value`
 * למחרוזת והשני לא. שכבת האחסון מקבלת בשדה הזה מחרוזת בלבד, ולכן
 * המסלול שלא המיר היה מפיל כל כלל עם ערך מספרי — בלי שאיש ישים לב,
 * כי הנתיב השני עבד.
 *
 * מיפוי כפול הוא בדיוק סוג הכשל שאי אפשר לתפוס בבדיקה של צד אחד.
 * מכאן והלאה — מקור-אמת אחד, ושני הנתיבים קוראים ממנו.
 *
 * ## מה הקובץ הזה **אינו** עושה
 * הוא אינו מתקן, אינו משלים ואינו מנחש. הוא ממפה שדה לשדה בלבד.
 * פריט שאינו תקין נדחה במעלה הזרם (`validateExtraction`) ואינו מגיע
 * לכאן. אם הגיע לכאן פריט חסר — הוא ייכתב חסר, וזה עדיף על השלמה.
 */

/** שדה המפתח הטבעי של כל ישות — בו נעשה הזיהוי למניעת כפילות. */
export const NATURAL_KEY = {
  KnowledgeTopic: 'topic_key',
  LabPattern: 'pattern_key',
  RedFlag: 'flag_key',
  ClinicalRule: 'rule_key',
  Association: 'assoc_key',
};

/** סדר הכתיבה. נושאים ראשונים — הם העוגן שכל השאר מפנה אליו. */
export const WRITE_ORDER = [
  'KnowledgeTopic',
  'LabPattern',
  'RedFlag',
  'ClinicalRule',
  'Association',
];

/** שם הרשימה בחילוץ, לכל ישות. */
export const LIST_BY_ENTITY = {
  KnowledgeTopic: 'topics',
  LabPattern: 'lab_patterns',
  RedFlag: 'red_flags',
  ClinicalRule: 'clinical_rules',
  Association: 'associations',
};

/**
 * ⚠ verification_status הוא draft_needs_verification, תמיד ובלי יוצא
 * מן הכלל — גם אם החילוץ ביקש אחרת. פריט שלא נחתם ע"י רופא/ה אינו
 * משתתף בפלט קליני, וזו ההגנה האמיתית היחידה על הידע שנכנס כאן.
 * הקבוע נמצא כאן ולא בקריאה, כדי שלא יהיה נתיב שעוקף אותו.
 */
export const DRAFT_STATUS = 'draft_needs_verification';

/**
 * ממיר condition.value למחרוזת.
 *
 * ⚠ שכבת האחסון מקבלת בשדה הזה מחרוזת בלבד: מספר או מערך מפילים את
 * הכתיבה כולה. המנוע ממיר בחזרה ב-parseRange/Number ב-rulesEngine,
 * ולכן ההמרה בטוחה.
 *
 * טווח נכתב כ-"lo-hi" ולא כ-JSON: זו הצורה שרופא/ה קורא/ת במסך
 * אימות הידע, והמנוע מפרש אותה נכון.
 */
export function stringifyConditionValue(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.join('-');
  return String(v);
}

function normalizeConditions(conditions) {
  return (conditions ?? []).map((c) => ({ ...c, value: stringifyConditionValue(c.value) }));
}

/**
 * הציטוט נשמר ב-review_note_he — הוא מה שהרופא/ה בודק/ת מולו.
 * פריט בלי ציטוט לא אמור להגיע לכאן; אם הגיע, ההערה תאמר זאת
 * במפורש במקום להיראות כאילו יש מקור.
 */
function reviewNote(r) {
  const quote = r.source_quote_he;
  if (!quote) return '⚠ אין ציטוט מקור לפריט זה — יש לאמת מול המקור לפני חתימה.';
  return `ציטוט מקור: "${quote}"`;
}

/** המיפוי עצמו. שדה לשדה, בלי לוגיקה. */
const MAPPERS = {
  KnowledgeTopic: (t) => ({
    topic_key: t.topic_key,
    topic_title_he: t.topic_title_he,
    topic_title_en: t.topic_title_en ?? null,
    chapter_number: t.chapter_number ?? null,
    chapter_title_he: t.chapter_title_he ?? null,
    page_start: t.page_start ?? null,
    page_end: t.page_end ?? null,
    // ⚠ אין כאן source_edition. השדה נוסה ונדחה על ידי שכבת
    // האחסון — הכתיבה החזירה הצלחה והערך נעלם בשקט.
    // שדה שנמחק בשקט גרוע משדה שאינו קיים: המפה מצהירה
    // על ייחוס שלא נשמר. הייחוס נשמר במקום אחר ובשלוש דרכים:
    // chapter_number, page_start/page_end, והקידומת שב-topic_key.
    summary_he: t.summary_he,
    keywords: t.keywords ?? [],
    age_scope: t.age_scope ?? 'all',
    review_note_he: reviewNote(t),
  }),

  LabPattern: (p) => ({
    pattern_key: p.pattern_key,
    title_he: p.title_he,
    components: p.components,
    min_components: p.min_components ?? 2,
    direction_he: p.direction_he,
    suspicion: p.suspicion,
    clinical_reasoning_he: p.clinical_reasoning_he ?? null,
    confirm_with_he: p.confirm_with_he ?? [],
    age_scope: p.age_scope ?? 'all',
    source_anchor: p.source_anchor,
    review_note_he: reviewNote(p),
  }),

  RedFlag: (f) => ({
    flag_key: f.flag_key,
    label_he: f.label_he,
    trigger: f.trigger,
    age_min_days: f.age_min_days ?? null,
    age_max_days: f.age_max_days ?? null,
    severity: f.severity ?? 'red',
    action_he: f.action_he,
    reason_he: f.reason_he ?? null,
    source_anchor: f.source_anchor,
    review_note_he: reviewNote(f),
  }),

  ClinicalRule: (r) => ({
    rule_key: r.rule_key,
    title_he: r.title_he,
    category: r.category ?? null,
    domain: r.domain ?? null,
    conditions: normalizeConditions(r.conditions),
    logic: r.logic ?? 'all',
    min_count: r.min_count ?? 0,
    conclusion_he: r.conclusion_he,
    suspicion: r.suspicion,
    clinical_reasoning_he: r.clinical_reasoning_he ?? null,
    recommended_workup_he: r.recommended_workup_he ?? [],
    source_anchor: r.source_anchor,
    review_note_he: reviewNote(r),
  }),

  Association: (a) => ({
    assoc_key: a.assoc_key,
    anchor_finding_he: a.anchor_finding_he,
    co_findings: a.co_findings ?? [],
    implies_he: a.implies_he,
    suspicion: a.suspicion,
    mechanism_he: a.mechanism_he ?? null,
    action_he: a.action_he ?? null,
    age_scope: a.age_scope ?? 'all',
    source_anchor: a.source_anchor,
    review_note_he: reviewNote(a),
  }),
};

/**
 * ממפה חילוץ מאומת לרשומות KB, מקובצות לפי ישות.
 *
 * @param {object} kept  פלט `validateExtraction().kept`
 * @returns {Record<string, object[]>}
 */
export function toKbRecords(kept) {
  const out = {};
  for (const entity of WRITE_ORDER) {
    const rows = kept?.[LIST_BY_ENTITY[entity]] ?? [];
    if (!rows.length) continue;
    out[entity] = rows.map((row) => ({
      ...MAPPERS[entity](row),
      verification_status: DRAFT_STATUS,
    }));
  }
  return out;
}

/**
 * השדות שנבדקים בקריאה-חוזרת אחרי הכתיבה.
 *
 * ⚠ אין טעם להשוות את כל השדות: שכבת האחסון מוסיפה שדות משלה
 * ומנרמלת ערכי null. מה שנבדק הוא מה שאסור שישתנה בשקט —
 * המפתח, העוגן, סטטוס האימות, והטקסט הקליני שנושא את המשמעות.
 *
 * הנימוק הקליני (reason_he, clinical_reasoning_he, mechanism_he)
 * נכנס לרשימה אחרי שסטיית טקסט שלו עברה בשקט: הוא מה שרופא/ה
 * קורא/ת כדי להחליט אם לחתום, ולכן שינוי בו משנה את ההחלטה.
 */
export const VERIFY_FIELDS = {
  KnowledgeTopic: [
    'topic_key', 'topic_title_he', 'summary_he', 'verification_status',
    // שדות הייחוס — בלעדיהם הנושא אינו בר-אימות מול המקור
    'chapter_number', 'page_start', 'page_end',
  ],
  LabPattern: [
    'pattern_key', 'title_he', 'direction_he', 'suspicion',
    'source_anchor', 'verification_status', 'min_components',
    'clinical_reasoning_he',
  ],
  RedFlag: [
    'flag_key', 'label_he', 'action_he', 'severity',
    'source_anchor', 'verification_status',
    // חלון הגיל קובע למי הדגל נורה. השמטה שלו מרחיבה
    // אותו לכל הגילאים — שינוי בטיחותי שקט.
    'age_min_days', 'age_max_days',
    'reason_he',
  ],
  ClinicalRule: [
    'rule_key', 'title_he', 'conclusion_he', 'suspicion',
    'source_anchor', 'verification_status', 'logic',
    'clinical_reasoning_he',
  ],
  Association: [
    'assoc_key', 'anchor_finding_he', 'implies_he', 'suspicion',
    'source_anchor', 'verification_status', 'age_scope',
    'mechanism_he', 'action_he',
  ],
};
