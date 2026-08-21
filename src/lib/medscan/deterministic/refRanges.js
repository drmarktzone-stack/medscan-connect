/**
 * MedScan — Age-Banded Reference Range Registry
 *
 * ⚠ החלטה קלינית מכוונת: **הקובץ הזה נשלח ריק מערכים.**
 *
 * הסיבה אינה עצלנות אלא נכונות קלינית: טווחי ייחוס במעבדה הם
 * ספציפיים למעבדה המבצעת — הם תלויים בשיטת המדידה, במכשור ובאוכלוסיית
 * הייחוס. טווח שנלקח מספר לימוד או ממודל שפה ויושם על תוצאה ממעבדה אחרת
 * הוא מקור שקט לשגיאה: הערך "יסומן תקין" כשהוא חריג, או להפך.
 *
 * לכן: הטווחים נטענים מישות `ReferenceRange`, שמולאה ואומתה ע"י הרופא/ה
 * מול טווחי המעבדה בפועל. עד שנטען טווח מאומת למדד מסוים, המנרמל
 * **אינו מסמן** אותו high/low — הוא מסמן `unknown_range`, וזה בכוונה:
 * אין סימון שגוי, יש הצהרה על חוסר.
 */

export const RANGE_STATUS = {
  OK: 'ok',
  UNKNOWN_RANGE: 'unknown_range',
  UNVERIFIED_RANGE: 'unverified_range',
};

/**
 * רישום ריק בכוונה. אין כאן ולו ערך קליני אחד.
 * מולא ע"י loadReferenceRanges().
 */
const registry = new Map();

let registryMeta = {
  loaded: false,
  source: null,
  loaded_at: null,
  analyte_count: 0,
  verified_count: 0,
};

/**
 * טוען טווחי ייחוס. קורא לזה פעם אחת באתחול, מרשומות ישות ReferenceRange.
 * @param {{analytes: object[], source?: string}} payload
 */
export function loadReferenceRanges(payload) {
  registry.clear();
  const analytes = payload?.analytes ?? [];
  let verified = 0;

  for (const a of analytes) {
    if (!a?.analyte || !Array.isArray(a.bands)) continue;
    const status = a.verification_status ?? 'draft_needs_verification';
    if (status === 'verified') verified += 1;
    registry.set(normalizeKey(a.analyte), {
      ...a,
      verification_status: status,
      bands: a.bands.slice().sort((x, y) => (x.age_min_days ?? 0) - (y.age_min_days ?? 0)),
    });
  }

  registryMeta = {
    loaded: true,
    source: payload?.source ?? null,
    loaded_at: new Date().toISOString(),
    analyte_count: registry.size,
    verified_count: verified,
  };
  return registryMeta;
}

export function getRegistryMeta() {
  return { ...registryMeta };
}

export function hasRange(analyte) {
  return registry.has(normalizeKey(analyte));
}

/**
 * מאתר את הטווח המתאים לגיל ולמין.
 */
export function resolveRange({ analyte, ageDays, sex = 'any' }) {
  const entry = registry.get(normalizeKey(analyte));

  if (!entry) {
    return {
      status: RANGE_STATUS.UNKNOWN_RANGE,
      low: null, high: null, unit: null, source: null,
      verification_status: null, label_he: null,
      note_he: `לא נטען טווח ייחוס מאומת עבור ${analyte}. הערך לא יסומן כחריג או כתקין.`,
    };
  }

  const band = entry.bands.find((b) => {
    const minOk = ageDays >= (b.age_min_days ?? 0);
    const maxOk = ageDays <= (b.age_max_days ?? Number.MAX_SAFE_INTEGER);
    const sexOk = !b.sex || b.sex === 'any' || b.sex === sex;
    return minOk && maxOk && sexOk;
  });

  if (!band) {
    return {
      status: RANGE_STATUS.UNKNOWN_RANGE,
      low: null, high: null, unit: entry.unit ?? null, source: entry.source ?? null,
      verification_status: entry.verification_status, label_he: entry.label_he ?? entry.analyte,
      note_he: `קיים טווח ל-${analyte} אך לא לגיל ${ageDays} ימים. הערך לא יסומן.`,
    };
  }

  const unverified = entry.verification_status !== 'verified';

  return {
    status: unverified ? RANGE_STATUS.UNVERIFIED_RANGE : RANGE_STATUS.OK,
    low: band.low ?? null,
    high: band.high ?? null,
    unit: entry.unit ?? null,
    source: entry.source ?? null,
    verification_status: entry.verification_status,
    label_he: entry.label_he ?? entry.analyte,
    note_he: unverified
      ? `טווח הייחוס ל-${analyte} עדיין לא אומת. הסימון מוצג כטיוטה בלבד.`
      : null,
  };
}

/** רשימת המדדים שאין להם טווח — לתצוגה לרופא/ה כפער ידוע. */
export function listMissingRanges(analytes = []) {
  return analytes.filter((a) => !hasRange(a));
}

function normalizeKey(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

/** ניקוי — לשימוש בבדיקות. */
export function __resetRegistry() {
  registry.clear();
  registryMeta = { loaded: false, source: null, loaded_at: null, analyte_count: 0, verified_count: 0 };
}
