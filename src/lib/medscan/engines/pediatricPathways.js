/**
 * MedScan — Pediatric Pathways (מילון מסלולי בירור לקהילה)
 *
 * שכבת ניתוב מעל תשתית הפרוטוקול הקיימת:
 *   pediatric_pathways (מילון) → protocolTree.resolveStep (ניווט עץ) →
 *   protocolRunner (הסבר שלב, בלי לברוא צעדים) → FACT BLOCK / AnchorGuard.
 *
 * ## מה זה
 * התאמה דטרמיניסטית של פנייה בקהילה למסלול בירור מובנה (ADHD, סקר כיתה א',
 * קומה נמוכה, חיסוני שגרה, חום בקהילה, חוזרי משרד הבריאות).
 *
 * ## מה זה לא
 * לא אבחנה, לא מינון, לא סף מעבדה, לא לוח חיסונים verbatim מהזיכרון.
 * כל המסלולים כאן הם `draft_needs_verification` עד שאימות רופא מול החוזר
 * / הפרוטוקול המחלקתי הופך אותם ל-`verified`. במצב clinical הם מותאמים
 * לניתוב בלבד ואינם נכנסים ל-FACT BLOCK — בדיוק כמו Protocol לא-מאומת.
 */

import { resolveStep } from './protocolTree.js';
import { t, finalizeLocale } from '../i18n/localize.js';

export const PATHWAY_CATEGORIES = Object.freeze([
  'acute',
  'developmental',
  'routine',
  'regulatory',
]);

export const DRAFT_STATUS = 'draft_needs_verification';

/** גיל 18 שנים בימים (~365.25 × 18). */
const AGE_18Y = 6574;

/**
 * מילון ראשוני. תוכן תהליכי בלבד — בלי מינונים ובלי ספים מספריים.
 * source_anchor מתחיל ב-needs_verification כדי שלא ייחשב ציטוט נלסון אמיתי.
 */
export const PEDIATRIC_PATHWAYS = Object.freeze([
  Object.freeze({
    pathway_key: 'community.adhd.workup',
    title_he: 'בירור הפרעת קשב וריכוז (ADHD) בקהילה',
    category: 'developmental',
    source_anchor: 'needs_verification.moh.adhd_community',
    min_age_days: 1461, // ~4 שנים — גיל הפנייה השכיח בקהילה, לאימות
    max_age_days: AGE_18Y,
    local_protocol_ref: 'חוזר משרד הבריאות / פרוטוקול נוירולוגיה-התפתחות בקופה — לאימות',
    verification_status: DRAFT_STATUS,
    aliases: [
      'adhd', 'add', 'הפרעת קשב', 'קשב וריכוז', 'היפראקטיביות',
      'ונדרבילט', 'vanderbilt', 'conners',
    ],
    triggers_he: [
      'קשיי קשב', 'אימפולסיביות', 'היפראקטיביות', 'בעיות בבית ספר',
    ],
    entry_criteria_he: [
      'חשד להפרעת קשב/היפראקטיביות מגורם מטפל, הורה או בית ספר',
      'גיל בחלון המסלול (טיוטה — לאימות מול החוזר העדכני)',
    ],
    steps: [
      {
        step_id: 'adhd.intake',
        title_he: 'אנמנזה מובנית והקשר בית-ספר',
        actions_he: [
          'תיעוד גיל הופעת התסמינים, משך, ופגיעה בשני הקשרים לפחות (בית + מסגרת)',
          'איסוף מידע מהורה ומהמסגרת החינוכית — לא מאחד מהם בלבד',
          'בירור שינה, ראייה/שמיעה, מצב רוח, חרדה, וקשיים לימודיים מתחרים',
        ],
        red_flags_he: [
          'ירידה חדה בתפקוד', 'מחשבות אובדניות', 'חשד להתעללות או הזנחה',
        ],
        deterministic_refs: [],
        branches: [
          { condition_he: 'דגל אדום בטיחותי', next_step_id: 'adhd.safety' },
          { condition_he: 'אין דגל אדום — המשך בירור', next_step_id: 'adhd.questionnaires' },
        ],
      },
      {
        step_id: 'adhd.safety',
        title_he: 'מסלול בטיחות — לא המשך בירור שגרתי',
        actions_he: [
          'טיפול בדגל הבטיחות לפי הפרוטוקול המקומי המאומת',
          'אין להתחיל מסלול ADHD שגרתי כל עוד לא יוצב הדגל',
        ],
        red_flags_he: ['מחשבות אובדניות', 'חשד להתעללות'],
        deterministic_refs: [],
        branches: [],
      },
      {
        step_id: 'adhd.questionnaires',
        title_he: 'שאלונים סטנדרטיים (כלי — לא אבחנה)',
        actions_he: [
          'הפעלת שאלוני הורה ומורה שאומתו בפרוטוקול הקופה (למשל Vanderbilt/Conners אם הם הכלים המקומיים)',
          'אין לקבוע אבחנה לפי ציון שאלון בלבד, ואין למלא ספי ציון מהזיכרון',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'שאלונים הוחזרו', next_step_id: 'adhd.ruleout' },
        ],
      },
      {
        step_id: 'adhd.ruleout',
        title_he: 'שלילת מצבים מתחרים בקהילה',
        actions_he: [
          'וידוא בדיקת ראייה ושמיעה עדכנית לפי הסטנדרט המקומי',
          'הערכת שינה, מצב רוח וחרדה כהסברים חלופיים או נלווים',
          'בדיקות מעבדה — רק לפי הפרוטוקול המקומי המאומת, לא לפי רשימה מהזיכרון',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'מתאים להמשך בקהילה', next_step_id: 'adhd.plan' },
          { condition_he: 'נדרש גורם מקצועי נוסף', next_step_id: 'adhd.plan' },
        ],
      },
      {
        step_id: 'adhd.plan',
        title_he: 'תוכנית: מעקב קהילה מול הפניה',
        actions_he: [
          'סיכום ממצאים והפניה (אם נדרשת) לנוירולוגיה/התפתחות לפי הקריטריונים המקומיים המאומתים',
          'אין לרשום טיפול תרופתי ממסלול זה — מינון רק מ-DoseRecord מאומת ומחשבון',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [],
      },
    ],
  }),

  Object.freeze({
    pathway_key: 'community.school.grade1_screening',
    title_he: 'בדיקות סקר לקראת כיתה א׳',
    category: 'routine',
    source_anchor: 'needs_verification.moh.school.grade1_screening',
    min_age_days: 1826, // ~5 שנים
    max_age_days: 2922, // ~8 שנים
    local_protocol_ref: 'חוזר משרד הבריאות — סקר תלמידים / כיתה א׳ — לאימות מול החוזר העדכני',
    verification_status: DRAFT_STATUS,
    aliases: [
      'כיתה א', 'כיתה א׳', 'סקר בית ספר', 'בדיקות סקר', 'grade 1',
      'מוכנות לבית ספר', 'טיפת חלב בית ספר',
    ],
    triggers_he: ['סקר כיתה א', 'בדיקה לכיתה א', 'רישום לכיתה א'],
    entry_criteria_he: [
      'ילד בגיל כניסה לבית ספר / כיתה א׳ לפי הרשות המקומית',
    ],
    steps: [
      {
        step_id: 'grade1.intake',
        title_he: 'אימות גיל וסטטוס רישום',
        actions_he: [
          'אימות גיל כניסה לבית ספר לפי הרשות — לא לפי כלל גיל מהזיכרון',
          'תיעוד האם הסקר טרם בוצע / חלקי / הושלם',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'המשך סקר', next_step_id: 'grade1.growth' },
        ],
      },
      {
        step_id: 'grade1.growth',
        title_he: 'גדילה — מדידה מול עקומה מקומית מאומתת',
        actions_he: [
          'מדידת גובה ומשקל בכלים מכוילים',
          'שרטוט על עקומת הגדילה של המוסד/הקופה — לא על אחוזונים מהזיכרון',
        ],
        red_flags_he: ['ירידת ערוץ גדילה משמעותית לפי העקומה המקומית'],
        deterministic_refs: [],
        branches: [
          { condition_he: 'גדילה חשודה לפי העקומה המקומית — שקול מסלול קומה נמוכה', next_step_id: 'grade1.senses' },
          { condition_he: 'המשך סקר', next_step_id: 'grade1.senses' },
        ],
      },
      {
        step_id: 'grade1.senses',
        title_he: 'סקר ראייה ושמיעה',
        actions_he: [
          'ביצוע סקר ראייה ושמיעה לפי חוזר משרד הבריאות המאומת (כלי, מרחק, קריטריון הפניה — מהחוזר, לא מהזיכרון)',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'המשך סקר', next_step_id: 'grade1.vaccines' },
        ],
      },
      {
        step_id: 'grade1.vaccines',
        title_he: 'השלמת חיסונים מול הלוח הרשמי',
        actions_he: [
          'השוואת פנקס החיסונים ללוח משרד הבריאות העדכני המאומת במערכת',
          'אין להשלים מנות או מרווחים מהזיכרון',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'המשך סקר', next_step_id: 'grade1.development' },
        ],
      },
      {
        step_id: 'grade1.development',
        title_he: 'התפתחות ומוכנות לבית ספר',
        actions_he: [
          'תיעוד חשש התפתחותי/לימודי/התנהגותי מההורה או מהגן',
          'אם עולה חשד ADHD — מעבר למסלול community.adhd.workup (לא אבחנה כאן)',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [],
      },
    ],
  }),

  Object.freeze({
    pathway_key: 'community.growth.short_stature',
    title_he: 'בירור קומה נמוכה בקהילה',
    category: 'developmental',
    source_anchor: 'needs_verification.nelson.endocrinology.short_stature',
    min_age_days: 730, // ~2 שנים — בירור מובנה בקהילה, לאימות
    max_age_days: AGE_18Y,
    local_protocol_ref: 'פרוטוקול אנדוקרינולוגית ילדים בקופה — לאימות',
    verification_status: DRAFT_STATUS,
    aliases: [
      'קומה נמוכה', 'גובה נמוך', 'short stature', 'עיכוב גדילה',
      'failure to thrive', 'faltering growth', 'לא גדל',
    ],
    triggers_he: ['קומה נמוכה', 'גובה נמוך', 'עיכוב גדילה'],
    entry_criteria_he: [
      'חשד לקומה נמוכה או האטת גדילה לפי עקומה מקומית מאומתת — לא לפי אחוזון מהזיכרון',
    ],
    steps: [
      {
        step_id: 'stature.measure',
        title_he: 'מדידה מדויקת ושרטוט עקומה',
        actions_he: [
          'מדידת גובה (או אורך מתחת לגיל שבו המדידה היא שכיבה, לפי הפרוטוקול המקומי) ומשקל',
          'שרטוט על עקומת הגדילה המאומתת של המוסד. אין לקבוע אחוזון מהזיכרון',
        ],
        red_flags_he: [
          'ירידת ערוץ חדה', 'סימני מחלה כרונית פעילה', 'הקאה ממושכת / שלשול כרוני',
        ],
        deterministic_refs: [],
        branches: [
          { condition_he: 'דגל אדום מערכתי', next_step_id: 'stature.refer' },
          { condition_he: 'המשך בירור קהילה', next_step_id: 'stature.history' },
        ],
      },
      {
        step_id: 'stature.history',
        title_he: 'אנמנזה: תזונה, מחלות, התבגרות, גובה הורים',
        actions_he: [
          'תיעוד מהירות גדילה אם יש מדידות קודמות מתועדות',
          'גובה הורים — חישוב גובה-מטרה רק בנוסחה מאומתת בקוד, לא מהזיכרון (אם אין מחשבון — הערך אינו זמין)',
          'בירור תזונה, מחלות כרוניות, תרופות, גיל התבגרות',
        ],
        red_flags_he: [],
        deterministic_refs: ['bsa'],
        branches: [
          { condition_he: 'המשך בירור', next_step_id: 'stature.labs' },
        ],
      },
      {
        step_id: 'stature.labs',
        title_he: 'בירור ראשוני בקהילה לפי פרוטוקול מקומי',
        actions_he: [
          'הזמנת בדיקות ראשוניות רק לפי הפרוטוקול המחלקתי/הקופתי המאומת',
          'אין להשלים רשימת בדיקות או ספים מהזיכרון. מה שאין במקור המאומת — חסר',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'ממצא חריג מנורמל מול טווח מאומת — הפניה', next_step_id: 'stature.refer' },
          { condition_he: 'מעקב קהילה לפי הפרוטוקול המקומי', next_step_id: 'stature.refer' },
        ],
      },
      {
        step_id: 'stature.refer',
        title_he: 'החלטת הפניה לאנדוקרינולוגיה',
        actions_he: [
          'הפניה לפי קריטריוני הפרוטוקול המקומי המאומת (לא לפי סף SDS מהזיכרון)',
          'צירוף עקומת גדילה ומדידות קודמות להפניה',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [],
      },
    ],
  }),

  Object.freeze({
    pathway_key: 'community.immunization.routine',
    title_he: 'חיסוני שגרה והשלמות מול לוח משרד הבריאות',
    category: 'routine',
    source_anchor: 'needs_verification.moh.immunization.schedule',
    min_age_days: 0,
    max_age_days: AGE_18Y,
    local_protocol_ref: 'לוח החיסונים של משרד הבריאות — לאימות מול הנוסח העדכני',
    verification_status: DRAFT_STATUS,
    aliases: [
      'חיסון', 'חיסונים', 'חיסוני שגרה', 'פנקס חיסונים', 'vaccination',
      'immunization', 'טיפת חלב חיסון',
    ],
    triggers_he: ['חיסון חסר', 'השלמת חיסונים', 'לוח חיסונים'],
    entry_criteria_he: [
      'כל מפגש שבו נדרש לבדוק סטטוס חיסונים או להשלים חיסון שגרה',
    ],
    steps: [
      {
        step_id: 'vax.record',
        title_he: 'תיעוד מול פנקס / מאגר מאומת',
        actions_he: [
          'השוואת הרשומה ללוח משרד הבריאות העדכני שמאומת במערכת',
          'אין לפרט מנות, מרווחים או גילי מתן מהזיכרון',
        ],
        red_flags_he: ['תגובה חמורה לחיסון קודם', 'אנפילקסיס'],
        deterministic_refs: [],
        branches: [
          { condition_he: 'דגל בטיחות לחיסון', next_step_id: 'vax.safety' },
          { condition_he: 'אין דגל — המשך', next_step_id: 'vax.catchup' },
        ],
      },
      {
        step_id: 'vax.safety',
        title_he: 'הערכת הוריית-נגד לפי מקור מאומת',
        actions_he: [
          'בדיקת הוריית-נגד לפי העלון וחוזר משרד הבריאות המאומת — לא מהזיכרון',
          'אין לתת חיסון ממסלול זה; המסלול מנתב בלבד',
        ],
        red_flags_he: ['אנפילקסיס'],
        deterministic_refs: [],
        branches: [],
      },
      {
        step_id: 'vax.catchup',
        title_he: 'תכנון השלמה',
        actions_he: [
          'בניית תוכנית השלמה רק מול הלוח המאומת (כולל מרווחים מינימליים מהמקור)',
          'הפניה לטיפת חלב / אחות חיסונים לפי המסלול המקומי',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [],
      },
    ],
  }),

  Object.freeze({
    pathway_key: 'community.acute.fever',
    title_he: 'חום בקהילה — מסלול בטיחות והפניה',
    category: 'acute',
    source_anchor: 'needs_verification.moh.fws_community',
    min_age_days: 0,
    max_age_days: AGE_18Y,
    local_protocol_ref: 'פרוטוקול חום ללא מקור בקהילה / מיון ילדים — לאימות',
    verification_status: DRAFT_STATUS,
    aliases: ['חום', 'fever', 'pyrexia', 'חום ללא מקור', 'fws'],
    triggers_he: ['חום', 'חשד לזיהום', 'נראה חולה'],
    entry_criteria_he: [
      'פנייה בקהילה עם חום או חשד לזיהום',
    ],
    steps: [
      {
        step_id: 'fever.triage',
        title_he: 'חלוקה לפי גיל ומראה — לפני כל שיקול אבחוני',
        actions_he: [
          'קביעת גיל בימים — בתינוק צעיר המסלול המקומי המאומת גובר על שיקול כללי',
          'הערכת מראה כללי וסימנים חיוניים. דגלים אדומים מחושבים במנוע RedFlag — לא מוחלפים כאן',
        ],
        red_flags_he: [
          'תינוק צעיר עם חום לפי הסף המקומי המאומת',
          'מראה חולה / ירידת הכרה / פריחה שאינה מחווירה',
        ],
        deterministic_refs: [],
        branches: [
          { condition_he: 'דגל אדום / גיל במסלול דחוף מאומת', next_step_id: 'fever.urgent' },
          { condition_he: 'מראה תקין — בירור מקור בקהילה', next_step_id: 'fever.source' },
        ],
      },
      {
        step_id: 'fever.urgent',
        title_he: 'הפניה דחופה',
        actions_he: [
          'הפניה למיון/מוקד לפי הפרוטוקול המקומי המאומת',
          'אין לתת אנטיביוטיקה או מינון ממסלול זה',
        ],
        red_flags_he: ['מראה חולה', 'פריחה פטכיאלית'],
        deterministic_refs: [],
        branches: [],
      },
      {
        step_id: 'fever.source',
        title_he: 'חיפוש מקור בקהילה',
        actions_he: [
          'בדיקה ממוקדת למקור (דרכי נשימה, אוזן, שתן, עור) לפי הפרוטוקול המקומי',
          'בדיקות עזר — רק אם הפרוטוקול המאומת מורה עליהן לגיל הזה',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'נמצא מקור שמטופל בקהילה לפי הפרוטוקול המקומי', next_step_id: 'fever.source' },
          { condition_he: 'אין מקור או הרעה — הפניה דחופה', next_step_id: 'fever.urgent' },
        ],
      },
    ],
  }),

  Object.freeze({
    pathway_key: 'community.regulatory.moh_circulars',
    title_he: 'חוזרי משרד הבריאות — איתור ויישום בקהילה',
    category: 'regulatory',
    source_anchor: 'needs_verification.moh.circulars.index',
    min_age_days: 0,
    max_age_days: AGE_18Y,
    local_protocol_ref: 'מאגר חוזרי משרד הבריאות המאומת במערכת — לאימות',
    verification_status: DRAFT_STATUS,
    aliases: [
      'חוזר משרד הבריאות', 'חוזר', 'moh circular', 'הנחיית משרד',
      'הוראת מנכ״ל', 'הוראת מנכ"ל',
    ],
    triggers_he: ['חוזר משרד הבריאות', 'עדכון רגולטורי'],
    entry_criteria_he: [
      'שאלה שתשובתה היא חוזר/הנחיה רשמית ולא הסקה קלינית כללית',
    ],
    steps: [
      {
        step_id: 'moh.identify',
        title_he: 'זיהוי נושא החוזר',
        actions_he: [
          'ניסוח נושא החוזר הנדרש (חיסונים / סקר / דיווח / בידוד וכו׳)',
          'אין לצטט מספר חוזר או תאריך מהזיכרון',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'נושא זוהה', next_step_id: 'moh.retrieve' },
        ],
      },
      {
        step_id: 'moh.retrieve',
        title_he: 'שליפה ממקור מאומת בלבד',
        actions_he: [
          'שליפת נוסח החוזר מהמאגר המאומת במערכת',
          'אם החוזר אינו במאגר — UNKNOWN. אין לפרפרז מהזיכרון',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [
          { condition_he: 'החוזר נשלף ואומת', next_step_id: 'moh.apply' },
        ],
      },
      {
        step_id: 'moh.apply',
        title_he: 'יישום מקומי',
        actions_he: [
          'הצגת ההוראה כפי שהיא בחוזר, עם source_anchor',
          'בסתירה בין חוזר לנלסון — החוזר המקומי המאומת גובר, והסתירה מוצהרת',
        ],
        red_flags_he: [],
        deterministic_refs: [],
        branches: [],
      },
    ],
  }),
]);

const CATALOG_BY_KEY = new Map(PEDIATRIC_PATHWAYS.map((p) => [p.pathway_key, p]));

export function getPediatricPathway(pathwayKey, catalog = PEDIATRIC_PATHWAYS) {
  if (catalog === PEDIATRIC_PATHWAYS) return CATALOG_BY_KEY.get(pathwayKey) ?? null;
  return (catalog ?? []).find((p) => p.pathway_key === pathwayKey) ?? null;
}

export function listPediatricPathways({ age_days, category, catalog = PEDIATRIC_PATHWAYS } = {}) {
  return (catalog ?? []).filter((p) => {
    if (category && p.category !== category) return false;
    return ageWindowMatches(p, age_days);
  });
}

/**
 * ממפה מסלול לצורה ש-`resolveStep` מצפה לה (Protocol tree).
 */
export function toProtocolView(pathway) {
  if (!pathway) return null;
  return {
    protocol_key: pathway.pathway_key,
    title_he: pathway.title_he,
    verification_status: pathway.verification_status ?? DRAFT_STATUS,
    source_anchor: pathway.source_anchor,
    local_protocol_ref: pathway.local_protocol_ref ?? null,
    steps: pathway.steps ?? [],
  };
}

/**
 * התאמת מסלול דטרמיניסטית.
 *
 * @param {object} params
 * @param {string} [params.query]  תלונה / ממצאים / מילות חיפוש
 * @param {number} [params.age_days]
 * @param {'acute'|'developmental'|'routine'|'regulatory'} [params.category]
 * @param {string} [params.currentStepId]  שלב פעיל; חוסר = השלב הראשון
 * @param {object[]} [params.catalog]      דילול לבדיקות
 * @returns {{
 *   matched: object|null,
 *   active_step: object|null,
 *   candidates: object[],
 *   skipped: object[],
 *   protocol_view: object|null,
 *   broken_branches: object[],
 *   error_he: string|null,
 * }}
 */
export function matchPediatricPathway({
  query = '',
  age_days,
  category = null,
  currentStepId = null,
  catalog = PEDIATRIC_PATHWAYS,
  locale = 'he',
} = {}) {
  const skipped = [];
  const scored = [];
  const q = normalizeQuery(query);

  for (const pathway of catalog ?? []) {
    if (category && pathway.category !== category) {
      skipped.push({ pathway_key: pathway.pathway_key, why: 'category_mismatch' });
      continue;
    }
    if (!ageWindowMatches(pathway, age_days)) {
      const why = Number.isFinite(Number(age_days)) ? 'age_window' : 'unknown_age';
      // בלי גיל: מסלול עם חלון גיל לא נבחר בשקט
      if (!Number.isFinite(Number(age_days))
          && (Number.isFinite(pathway.min_age_days) || Number.isFinite(pathway.max_age_days))) {
        skipped.push({
          pathway_key: pathway.pathway_key,
          why,
          message_he: `המסלול "${pathway.title_he}" תלוי-גיל ולא ניתן היה להתאים אותו ללא גיל המטופל.`,
        });
        continue;
      }
      if (Number.isFinite(Number(age_days))) {
        skipped.push({ pathway_key: pathway.pathway_key, why: 'age_window' });
        continue;
      }
    }

    const score = scorePathway(pathway, q);
    if (score <= 0) {
      skipped.push({ pathway_key: pathway.pathway_key, why: 'no_query_match' });
      continue;
    }
    scored.push({ pathway, score });
  }

  scored.sort((a, b) => b.score - a.score || specificity(b.pathway) - specificity(a.pathway));

  const candidates = scored.map(({ pathway, score }) => ({
    pathway_key: pathway.pathway_key,
    title_he: pathway.title_he,
    category: pathway.category,
    score,
    verification_status: pathway.verification_status ?? DRAFT_STATUS,
  }));

  const matched = scored[0]?.pathway ?? null;
  if (!matched) {
    return finalizeLocale({
      matched: null,
      active_step: null,
      candidates,
      skipped,
      protocol_view: null,
      broken_branches: [],
      i18n_error_key: q ? 'pathway.no_match' : 'pathway.no_query',
      error_he: q ? t(locale, 'pathway.no_match') : t(locale, 'pathway.no_query'),
    }, locale);
  }

  const protocol_view = toProtocolView(matched);
  const resolved = resolveStep(protocol_view, currentStepId);

  return finalizeLocale({
    matched,
    active_step: resolved.step,
    candidates,
    skipped,
    protocol_view,
    broken_branches: resolved.brokenBranches ?? [],
    error_he: resolved.error_he,
  }, locale);
}

/**
 * פריט KB ל-FACT BLOCK. הסטטוס נשמר — הסינון נעשה ב-filterByVerification.
 */
export function pathwayToKbItem(match) {
  const pathway = match?.matched;
  const step = match?.active_step;
  if (!pathway || !step) return null;

  const status = pathway.verification_status ?? DRAFT_STATUS;
  return {
    pathway_key: pathway.pathway_key,
    protocol_key: pathway.pathway_key,
    title_he: `${pathway.title_he} — שלב: ${step.title_he}`,
    conclusion_he: (step.actions_he ?? []).join('; '),
    action_he: (step.actions_he ?? [])[0] ?? null,
    recommended_workup_he: step.actions_he ?? [],
    suspicion: pathway.category === 'acute' ? 'yellow' : 'green',
    source_anchor: pathway.source_anchor,
    verification_status: status,
    active_step_id: step.step_id,
    active_step_title_he: step.title_he,
    category: pathway.category,
    local_protocol_ref: pathway.local_protocol_ref ?? null,
  };
}

export function buildClinicalAuditPayload({
  encounter = {},
  factBlock = null,
  redFlags = [],
  pathwayMatch = null,
  engine = 'smart_pediatrician',
  mode = 'clinical',
  outputStatus = null,
  reasonCodes = [],
} = {}) {
  return {
    engine,
    mode,
    output_status: outputStatus,
    patient_snapshot: {
      age_days: encounter.age_days ?? null,
      sex: encounter.sex ?? null,
      weight_kg: encounter.weight_kg ?? null,
      height_cm: encounter.height_cm ?? null,
      vitals: encounter.vitals ?? {},
      chief_complaint_he: encounter.chief_complaint_he ?? null,
      findings_he: encounter.findings_he ?? encounter.findings ?? [],
    },
    fact_block: factBlock
      ? {
          text: factBlock.text ?? null,
          facts: (factBlock.facts ?? []).map((f) => ({
            id: f.id,
            kind: f.kind,
            source_anchor: f.source_anchor ?? null,
            verification_status: f.verification_status ?? null,
            is_draft: Boolean(f.is_draft),
            entity_key: f.entity_key ?? null,
          })),
          draft_items_rejected: factBlock.draftRejectedCount ?? 0,
          has_verified_clinical_content: Boolean(factBlock.hasVerifiedClinicalContent),
        }
      : {},
    red_flags: redFlags,
    matched_pathway_key: pathwayMatch?.matched?.pathway_key ?? null,
    matched_pathway: pathwayMatch?.matched
      ? {
          pathway_key: pathwayMatch.matched.pathway_key,
          title_he: pathwayMatch.matched.title_he,
          category: pathwayMatch.matched.category,
          source_anchor: pathwayMatch.matched.source_anchor,
          verification_status: pathwayMatch.matched.verification_status ?? DRAFT_STATUS,
          active_step_id: pathwayMatch.active_step?.step_id ?? null,
        }
      : null,
    active_step_id: pathwayMatch?.active_step?.step_id ?? null,
    draft_items_rejected: factBlock?.draftRejectedCount ?? 0,
    reason_codes: reasonCodes,
  };
}

/* ═══════════════════════════════════════════════════════════════════════ */

function ageWindowMatches(pathway, ageDays) {
  const age = Number(ageDays);
  const hasWindow = Number.isFinite(pathway.min_age_days) || Number.isFinite(pathway.max_age_days);
  if (!Number.isFinite(age)) {
    // בלי גיל: מסלול ללא חלון יכול להתאים; מסלול עם חלון — לא.
    return !hasWindow;
  }
  if (Number.isFinite(pathway.min_age_days) && age < pathway.min_age_days) return false;
  if (Number.isFinite(pathway.max_age_days) && age > pathway.max_age_days) return false;
  return true;
}

function scorePathway(pathway, queryNorm) {
  if (!queryNorm) return 0;
  let score = 0;

  if (normalizeQuery(pathway.pathway_key) && queryNorm.includes(normalizeQuery(pathway.pathway_key))) {
    score += 5;
  }

  for (const alias of pathway.aliases ?? []) {
    const a = normalizeQuery(alias);
    if (!a) continue;
    if (queryNorm === a) score += 4;
    else if (queryNorm.includes(a) || a.includes(queryNorm)) score += 3;
  }

  for (const trigger of pathway.triggers_he ?? []) {
    const t = normalizeQuery(trigger);
    if (!t) continue;
    if (queryNorm.includes(t) || t.includes(queryNorm)) score += 2;
  }

  const title = normalizeQuery(pathway.title_he);
  if (title && (queryNorm.includes(title) || title.includes(queryNorm))) score += 1;

  return score;
}

function specificity(pathway) {
  const min = Number.isFinite(pathway.min_age_days) ? pathway.min_age_days : 0;
  const max = Number.isFinite(pathway.max_age_days) ? pathway.max_age_days : AGE_18Y;
  return Math.max(0, AGE_18Y - (max - min));
}

export function normalizeQuery(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/["'׳״]/g, '')
    .replace(/[‐‑–—]/g, '-')
    .replace(/\s+/g, ' ');
}
