/**
 * MedScan — Lab Normalization (שכבה דטרמיניסטית)
 *
 * ממיר תוצאות גולמיות לצורה שהמנוע יודע לעבוד איתה: יחידות, טווח-גיל, דגל.
 * **אין כאן LLM.** הסימון high/low הוא החלטה קלינית — הוא נעשה בקוד או שאינו נעשה.
 *
 * כלל מרכזי: כשאין טווח ייחוס מאומת — הערך מסומן `unknown_range`, לא `normal`.
 * "לא יודע" ו-"תקין" הם שני דברים שונים לחלוטין, ובלבול ביניהם הוא באג בטיחותי.
 */

import { resolveRange, RANGE_STATUS } from './refRanges.js';
import { resolveAnalyte, canonicalKey, RESULT_TYPES } from './analyteCatalog.js';

/**
 * המרות יחידות מקובלות. רק המרות שהן **זהות מתמטית**, לא הערכות.
 * המרה שדורשת משקל מולקולרי מוגדרת במפורש עם המקדם ומקורו.
 */
const UNIT_CONVERSIONS = {
  // ספירת דם — 10^3/µL ו-10^9/L זהים מספרית
  '10^3/ul→10^9/l': { factor: 1, note: 'זהות מספרית' },
  '10^9/l→10^3/ul': { factor: 1, note: 'זהות מספרית' },
  'k/ul→10^9/l': { factor: 1, note: 'זהות מספרית' },
  // CRP
  'mg/dl→mg/l': { factor: 10, note: 'המרה ישירה' },
  'mg/l→mg/dl': { factor: 0.1, note: 'המרה ישירה' },
  // כללי
  'g/dl→g/l': { factor: 10, note: 'המרה ישירה' },
  'g/l→g/dl': { factor: 0.1, note: 'המרה ישירה' },
};

const norm = (u) => String(u ?? '').trim().toLowerCase().replace(/\s+/g, '');

export function convertUnit(value, from, to) {
  if (!from || !to) return { value, converted: false, note: null };
  if (norm(from) === norm(to)) return { value, converted: false, note: null };

  const key = `${norm(from)}→${norm(to)}`;
  const conv = UNIT_CONVERSIONS[key];
  if (!conv) {
    return {
      value,
      converted: false,
      error: 'unsupported_conversion',
      note: `אין המרה מאומתת מ-${from} ל-${to}. הערך נשאר ביחידות המקוריות.`,
    };
  }
  return { value: value * conv.factor, converted: true, note: conv.note };
}

/**
 * מנרמל מערך תוצאות.
 *
 * @param {object} params
 * @param {object[]} params.labs   [{analyte, value, unit, ref_low?, ref_high?}]
 * @param {object} params.patient  {age_days, sex}
 * @returns {{normalized: object[], missingRanges: string[], warnings: object[]}}
 */
export function normalizeLabs({ labs = [], patient = {} } = {}) {
  const ageDays = Number(patient.age_days);
  const sex = patient.sex ?? 'any';
  const normalized = [];
  const missingRanges = [];
  const warnings = [];

  if (!Number.isFinite(ageDays)) {
    warnings.push({
      code: 'missing_age',
      severity: 'block',
      message_he:
        'לא סופק גיל המטופל בימים. ברפואת ילדים כמעט כל טווח ייחוס תלוי-גיל — ' +
        'בלי גיל אין נרמול, ולכן לא יבוצע סימון חריגות.',
    });
  }

  for (const lab of labs) {
    if (!lab?.analyte) continue;
    const rawValue = Number(lab.value);

    // זיהוי המדד בקטלוג — מקנה מפתח קנוני שהוא מה ש-LabPattern
    // מתאים מולו. בלי זה, "המוגלובין" ו-"Hb" הם שני מדדים שונים.
    const known = resolveAnalyte(lab.analyte);
    const resultType = lab.result_type ?? known?.type ?? RESULT_TYPES.NUMERIC;

    // תוצאה שאינה מספרית מטבעה (תרבית, גנטיקה, איכותי) —
    // לא שגיאה, ולא צריך עבורה טווח ייחוס. היא עוברת כממצא.
    if (resultType !== RESULT_TYPES.NUMERIC) {
      const positive = isPositiveResult(lab.value);
      normalized.push({
        analyte: lab.analyte,
        canonical_key: known?.key ?? canonicalKey(lab.analyte),
        label_he: lab.label_he ?? known?.he ?? lab.analyte,
        value: lab.value,
        unit: null,
        flag: positive === null ? 'qualitative' : (positive ? 'positive' : 'negative'),
        result_type: resultType,
        range_status: 'not_applicable',
        category: known?.cat ?? null,
        note_he: 'תוצאה איכותית — אינה דורשת טווח ייחוס.',
      });
      continue;
    }

    if (!Number.isFinite(rawValue)) {
      warnings.push({
        code: 'non_numeric_value',
        severity: 'warn',
        analyte: lab.analyte,
        message_he:
          `הערך של ${lab.analyte} אינו מספרי ולכן לא נורמל. ` +
          'אם זו תוצאה איכותית (תרבית/גנטיקה) — יש לסמן את סוג התוצאה.',
      });
      normalized.push({
        analyte: lab.analyte,
        canonical_key: known?.key ?? canonicalKey(lab.analyte),
        label_he: lab.label_he ?? known?.he ?? lab.analyte,
        value: lab.value,
        unit: lab.unit ?? null,
        flag: 'unknown_range',
        range_status: RANGE_STATUS.UNKNOWN_RANGE,
        category: known?.cat ?? null,
      });
      continue;
    }

    // פתירת הטווח לפי המפתח הקנוני (לא לפי השם הגולמי) — אחרת שם מורכב
    // כמו "CHOLESTEROL- HDL" זוהה בקטלוג אך לא ימצא את טווח הייחוס שמפתחו 'hdl'.
    const rangeKey = known?.key ?? lab.analyte;
    const range = Number.isFinite(ageDays)
      ? resolveRange({ analyte: rangeKey, ageDays, sex })
      : { status: RANGE_STATUS.UNKNOWN_RANGE, low: null, high: null, unit: null,
          note_he: 'לא ניתן לפתור טווח ללא גיל.' };

    // טווח שהוזן ידנית ע"י המשתמש (מגיליון המעבדה) גובר — הוא המדויק ביותר.
    //
    // ⚠ שער-בטיחות קריטי: חילוץ אוטומטי מגיליון המעבדה מקודד "אין גבול" כ-0,
    // ולעיתים מחזיר 0/0 כשלא הצליח לפענח את הטווח (נפוץ בשומנים שבהם הטווח
    // מודפס כסף חד-צדדי: "<200", ">40"). טווח 0/0 שהתקבל כך הופך כל ערך חיובי
    // ל"גבוה" — זו בדיוק התקלה של HDL 34 שסומן "גבוה". לכן:
    //   · תקרה של 0 אינה גבול-עליון אמיתי לאף מדד → מבוטלת.
    //   · רצפת 0 ללא תקרה = אין גבול כלל → מבוטלת (המקרה 0/0).
    //   · תקרה ≤ רצפה (טווח הפוך/מנוון) → נזרק, נופלים לטווח-הזרע.
    //   · גבולות שליליים אמיתיים (למשל Base Excess ‎-2..2) נשמרים.
    let manualLow = Number.isFinite(Number(lab.ref_low)) ? Number(lab.ref_low) : null;
    let manualHigh = Number.isFinite(Number(lab.ref_high)) ? Number(lab.ref_high) : null;
    if (manualHigh === 0) manualHigh = null;                 // תקרה של 0 = אין גבול-עליון
    if (manualLow === 0 && manualHigh === null) manualLow = null; // 0/0 = אין טווח בכלל
    if (manualLow !== null && manualHigh !== null && manualHigh <= manualLow) {
      manualLow = null; manualHigh = null;                   // טווח הפוך/מנוון — לא אמין
    }
    const usingManual = manualLow !== null || manualHigh !== null;

    let value = rawValue;
    let unit = lab.unit ?? range.unit ?? null;
    let conversionNote = null;

    if (!usingManual && lab.unit && range.unit && norm(lab.unit) !== norm(range.unit)) {
      const conv = convertUnit(rawValue, lab.unit, range.unit);
      if (conv.error) {
        warnings.push({
          code: 'unit_mismatch',
          severity: 'warn_high',
          analyte: lab.analyte,
          message_he:
            `יחידות ${lab.analyte} (${lab.unit}) אינן תואמות לטווח הייחוס (${range.unit}) ` +
            'ואין המרה מאומתת. הערך לא יסומן כחריג.',
        });
      } else {
        value = conv.value;
        unit = range.unit;
        conversionNote = conv.note;
      }
    }

    const low = usingManual ? manualLow : range.low;
    const high = usingManual ? manualHigh : range.high;
    const canFlag =
      (usingManual || range.status === RANGE_STATUS.OK || range.status === RANGE_STATUS.UNVERIFIED_RANGE) &&
      (low !== null || high !== null) &&
      !(!usingManual && lab.unit && range.unit && norm(lab.unit) !== norm(range.unit) && !conversionNote);

    let flag = 'unknown_range';
    if (canFlag) {
      if (high !== null && value > high) flag = 'high';
      else if (low !== null && value < low) flag = 'low';
      else flag = 'normal';
    } else if (!usingManual && range.status === RANGE_STATUS.UNKNOWN_RANGE) {
      missingRanges.push(lab.analyte);
    }

    const rangeStatus = usingManual ? 'manual_range' : range.status;

    normalized.push({
      analyte: lab.analyte,
      canonical_key: known?.key ?? canonicalKey(lab.analyte),
      category: known?.cat ?? null,
      result_type: RESULT_TYPES.NUMERIC,
      label_he: lab.label_he ?? range.label_he ?? known?.he ?? lab.analyte,
      value,
      original_value: rawValue,
      unit,
      original_unit: lab.unit ?? null,
      ref_low: low,
      ref_high: high,
      flag,
      range_status: rangeStatus,
      range_source: usingManual ? 'הוזן ידנית מגיליון המעבדה' : range.source ?? null,
      range_verification: usingManual ? 'user_provided' : range.verification_status ?? null,
      // הסימון נשען על טווח שטרם אומת — מסומן כדי שהכיול
      // יוכל להגביל את הביטחון שנבנה מעליו.
      flagged_by_draft_range:
        !usingManual && flag !== 'unknown_range' && range.status === RANGE_STATUS.UNVERIFIED_RANGE,
      note_he: conversionNote ?? range.note_he ?? null,
    });

    if (!usingManual && range.status === RANGE_STATUS.UNVERIFIED_RANGE) {
      warnings.push({
        code: 'unverified_range',
        severity: 'warn_high',
        analyte: lab.analyte,
        message_he: range.note_he,
      });
    }
  }

  if (missingRanges.length) {
    warnings.push({
      code: 'missing_reference_ranges',
      severity: 'warn_high',
      analytes: missingRanges,
      message_he:
        `לא נטענו טווחי ייחוס מאומתים עבור: ${missingRanges.join(', ')}. ` +
        'מדדים אלה לא סומנו כחריגים או כתקינים, ולא ישתתפו בהתאמת דפוסים.',
    });
  }

  return { normalized, missingRanges, warnings };
}

/**
 * האם תוצאה איכותית חיובית. null = לא ניתן להכריע —
 * ואז לא מנחשים, משאירים כטקסט.
 */
function isPositiveResult(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (/^(חיובי|positive|pos|נמצא|detected|reactive|\+)$/.test(v)) return true;
  if (/^(שלילי|negative|neg|לא נמצא|not detected|non-?reactive|סטרילי|no growth|-)$/.test(v)) return false;
  return null;
}

/** ממיר תוצאות מנורמלות לפריטי P# עבור ה-FACT BLOCK. */
export function toPatientFacts(normalized = []) {
  return normalized.map((n) => ({
    key: n.canonical_key ?? n.analyte,
    label_he: n.label_he,
    value: n.value,
    unit: n.unit,
    flag: (n.flag === 'unknown_range' || n.flag === 'qualitative') ? null : n.flag,
    ref_low: n.ref_low,
    ref_high: n.ref_high,
  }));
}

/** גיל בימים מכל צורת קלט סבירה. */
export function toAgeDays({ age_days, age_months, age_years, birth_date } = {}) {
  if (Number.isFinite(Number(age_days))) return Number(age_days);
  if (Number.isFinite(Number(age_months))) return Math.round(Number(age_months) * 30.4375);
  if (Number.isFinite(Number(age_years))) return Math.round(Number(age_years) * 365.25);
  if (birth_date) {
    const ms = Date.now() - new Date(birth_date).getTime();
    if (Number.isFinite(ms) && ms >= 0) return Math.floor(ms / 86400000);
  }
  return null;
}
