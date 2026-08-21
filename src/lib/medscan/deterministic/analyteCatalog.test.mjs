/**
 * MedScan — בדיקות קטלוג המדדים
 *
 * שתי דרישות בטיחות נבדקות כאן:
 *   1. הקטלוג **אינו מכיל** טווחי ייחוס — אלה של המעבדה בלבד
 *   2. מפתח קנוני גורם ל-LabPattern להתאים בפועל
 *
 * הרצה:  node src/lib/medscan/deterministic/analyteCatalog.test.mjs
 */

import {
  resolveAnalyte, canonicalKey, searchAnalytes, analytesByCategory,
  ALL_ANALYTES, CATALOG_SIZE, CATEGORIES, RESULT_TYPES,
} from './analyteCatalog.js';
import { normalizeLabs, toPatientFacts } from './labNormalize.js';
import { __resetRegistry } from './refRanges.js';
import { matchLabPatterns } from '../rules/rulesEngine.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

console.log('\nקטלוג מדדי מעבדה\n');

/* ═══ הדרישה הבטיחותית המרכזית ═══ */

t('הקטלוג אינו מכיל טווחי ייחוס — בשום רשומה', () => {
  const forbidden = ['ref_low', 'ref_high', 'normal_low', 'normal_high', 'range', 'threshold', 'cutoff'];
  for (const a of ALL_ANALYTES) {
    for (const key of Object.keys(a)) {
      ok(!forbidden.includes(key),
        `הרשומה ${a.key} מכילה שדה טווח "${key}" — טווחים הם של המעבדה בלבד`);
    }
  }
});

t('הקטלוג מכסה את כל הקטגוריות שנדרשו', () => {
  const byCat = analytesByCategory();
  const required = [
    'hematology', 'chemistry', 'microbiology', 'genetics',
    'endocrine', 'immunology', 'tumor', 'urine', 'csf',
    'coagulation', 'liver', 'lipids', 'renal', 'metabolic',
    'inflammation', 'serology', 'bloodgas', 'cardiac', 'vitamins',
  ];
  for (const c of required) {
    ok(byCat[c]?.length > 0, `קטגוריה חסרה או ריקה: ${c} (${CATEGORIES[c]})`);
  }
  ok(CATALOG_SIZE >= 150, `הקטלוג קטן מדי: ${CATALOG_SIZE}`);
});

/* ═══ זיהוי ═══ */

t('זיהוי לפי שם עברי, אנגלי, מפתח וקיצור', () => {
  for (const input of ['המוגלובין', 'Hemoglobin', 'hemoglobin', 'Hb', 'HGB']) {
    eq(resolveAnalyte(input)?.key, 'hemoglobin', `לא זוהה: ${input}`);
  }
});

t('זיהוי עמיד לרווחים, מקפים וגרשיים', () => {
  eq(resolveAnalyte('  HB  ')?.key, 'hemoglobin');
  eq(resolveAnalyte('anti-ccp')?.key, 'anti_ccp');
  eq(resolveAnalyte('D dimer')?.key, 'd_dimer');
});

t('מדד שאינו בקטלוג מחזיר null ולא מנוחש', () => {
  eq(resolveAnalyte('מדד מומצא לגמרי'), null, 'הומצאה זהות למדד לא מוכר');
  eq(resolveAnalyte(''), null);
});

t('canonicalKey נופל חזרה לטקסט מנורמל', () => {
  eq(canonicalKey('CRP'), 'crp');
  eq(canonicalKey('מדד לא מוכר'), 'מדדלאמוכר');
});

/* ═══ סוגי תוצאה ═══ */

t('מיקרוביולוגיה מסומנת כזיהוי מחולל, לא כמספר', () => {
  eq(resolveAnalyte('תרבית דם').type, RESULT_TYPES.ORGANISM);
  eq(resolveAnalyte('urine culture').type, RESULT_TYPES.ORGANISM);
});

t('גנטיקה מסומנת כטקסט', () => {
  eq(resolveAnalyte('קריוטיפ').type, RESULT_TYPES.TEXT);
  eq(resolveAnalyte('CMA').type, RESULT_TYPES.TEXT);
  eq(resolveAnalyte('WES').type, RESULT_TYPES.TEXT);
});

t('ANA מסומן כטיטר', () => {
  eq(resolveAnalyte('ANA').type, RESULT_TYPES.TITER);
});

t('מדדים כמותיים מסומנים כמספריים כברירת מחדל', () => {
  eq(resolveAnalyte('CRP').type, RESULT_TYPES.NUMERIC);
  eq(resolveAnalyte('אלבומין').type, RESULT_TYPES.NUMERIC);
});

/* ═══ חיפוש ═══ */

t('חיפוש מדרג התאמה מדויקת לפני חלקית', () => {
  const r = searchAnalytes('CRP');
  eq(r[0].key, 'crp', 'התאמה מדויקת לא הופיעה ראשונה');
});

t('חיפוש בעברית עובד', () => {
  const r = searchAnalytes('תרבית');
  ok(r.length >= 3, 'חיפוש עברי החזיר מעט מדי');
  ok(r.every((a) => a.cat === 'microbiology'), 'תוצאות לא רלוונטיות');
});

t('חיפוש ריק מחזיר ריק', () => {
  eq(searchAnalytes('').length, 0);
  eq(searchAnalytes('   ').length, 0);
});

/* ═══ אינטגרציה עם הנרמול ═══ */

t('נרמול מוסיף מפתח קנוני', () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({
    labs: [{ analyte: 'Hb', value: 9, unit: 'g/dL', ref_low: 11, ref_high: 14 }],
    patient: { age_days: 1461 },
  });
  eq(normalized[0].canonical_key, 'hemoglobin', 'המפתח הקנוני חסר');
  eq(normalized[0].flag, 'low');
  eq(normalized[0].category, 'hematology');
});

t('דפוס מותאם גם כשהמשתמש הקליד קיצור', () => {
  __resetRegistry();
  const PATTERN = {
    pattern_key: 'test.anemia',
    title_he: 'אנמיה',
    components: [
      { analyte: 'hemoglobin', direction: 'low' },
      { analyte: 'mcv', direction: 'low' },
    ],
    min_components: 2,
    direction_he: 'כיוון לאנמיה מיקרוציטית',
    suspicion: 'yellow',
    source_anchor: 'nelson.heme.anemia',
    verification_status: 'verified',
  };

  // המשתמש הקליד קיצורים, לא את המפתח הקנוני
  const { normalized } = normalizeLabs({
    labs: [
      { analyte: 'HGB', value: 9, unit: 'g/dL', ref_low: 11, ref_high: 14 },
      { analyte: 'MCV', value: 68, unit: 'fL', ref_low: 75, ref_high: 87 },
    ],
    patient: { age_days: 1461 },
  });

  const { matched } = matchLabPatterns({
    patternKb: [PATTERN], labs: normalized, patient: { age_days: 1461 },
  });
  eq(matched.length, 1, 'הדפוס לא הופעל — הקטלוג לא מחובר להתאמה');
  eq(matched[0].matched_ratio, 1);
});

t('תוצאה איכותית עוברת בלי לדרוש טווח', () => {
  __resetRegistry();
  const { normalized, missingRanges, warnings } = normalizeLabs({
    labs: [{ analyte: 'תרבית דם', value: 'Streptococcus pneumoniae' }],
    patient: { age_days: 1461 },
  });
  eq(normalized[0].range_status, 'not_applicable');
  eq(normalized[0].flag, 'qualitative', 'שם מחולל לא סווג נכון');
  eq(missingRanges.length, 0, 'תוצאה איכותית נספרה כחסרת טווח');
  ok(!warnings.some((w) => w.code === 'non_numeric_value'), 'הופקה אזהרת ערך לא-מספרי מיותרת');
});

t('חיובי/שלילי מזוהים בעברית ובאנגלית', () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({
    labs: [
      { analyte: 'בדיקת סטרפ מהירה', value: 'חיובי' },
      { analyte: 'RSV', value: 'negative' },
      { analyte: 'covid_pcr', value: 'לא ברור' },
    ],
    patient: { age_days: 1461 },
  });
  eq(normalized[0].flag, 'positive');
  eq(normalized[1].flag, 'negative');
  eq(normalized[2].flag, 'qualitative', 'ערך לא-חד-משמעי נוחש');
});

t('תוצאה איכותית אינה מייצרת דגל high/low ב-P#', () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({
    labs: [{ analyte: 'קריוטיפ', value: '46,XY' }],
    patient: { age_days: 1461 },
  });
  const facts = toPatientFacts(normalized);
  eq(facts[0].flag, null, 'תוצאה איכותית קיבלה דגל כמותי');
  eq(facts[0].key, 'karyotype', 'המפתח הקנוני לא הועבר');
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}  ·  מדדים בקטלוג: ${CATALOG_SIZE}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('הקטלוג תקין.');
