/**
 * MedScan — בדיקות seed טווחי הייחוס
 *
 * הבדיקה המרכזית: טווח-טיוטה **אינו יכול** לייצר חשד אדום.
 * השרשרת ערך → סימון → דפוס → כיוון חזקה כחולשת החוליה החלשה בה.
 *
 * הרצה:  node src/lib/medscan/deterministic/referenceRangeSeed.test.mjs
 */

import { SEED_RANGES, seedToEntityRows, SEED_COUNT } from './referenceRangeSeed.js';
import { loadReferenceRanges, __resetRegistry, RANGE_STATUS, resolveRange } from './refRanges.js';
import { normalizeLabs, toPatientFacts } from './labNormalize.js';
import { resolveAnalyte } from './analyteCatalog.js';
import { matchLabPatterns } from '../rules/rulesEngine.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { calibrateOutput } from '../antihallucination/calibration.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

console.log('\nטווחי ייחוס — seed ואכיפת סטטוס\n');

/* ═══ תקינות מבנית ═══ */

t('כל מדד ב-seed מזוהה בקטלוג', () => {
  for (const r of SEED_RANGES) {
    ok(resolveAnalyte(r.analyte), `מדד לא מזוהה בקטלוג: ${r.analyte}`);
  }
});

t('היחידות תואמות לקטלוג', () => {
  for (const r of SEED_RANGES) {
    const cat = resolveAnalyte(r.analyte);
    if (!cat.unit || !r.unit) continue;
    eq(r.unit, cat.unit, `אי-התאמת יחידות ב-${r.analyte}`);
  }
});

t('מדרגות הגיל תקינות ואינן חופפות', () => {
  for (const r of SEED_RANGES) {
    ok(r.bands.length > 0, `${r.analyte}: אין מדרגות`);
    const sorted = [...r.bands].sort((a, b) => a.age_min_days - b.age_min_days);
    for (const bd of sorted) {
      ok(bd.age_min_days <= bd.age_max_days, `${r.analyte}: מדרגה הפוכה`);
      ok(bd.low !== undefined && bd.high !== undefined, `${r.analyte}: חסר גבול`);
      if (bd.low !== null && bd.high !== null) {
        ok(bd.low < bd.high, `${r.analyte}: low >= high במדרגה ${bd.age_min_days}`);
      }
    }
    for (let i = 1; i < sorted.length; i += 1) {
      ok(sorted[i].age_min_days > sorted[i - 1].age_max_days,
        `${r.analyte}: חפיפה בין מדרגות ${sorted[i - 1].age_max_days} ו-${sorted[i].age_min_days}`);
    }
  }
});

/* ═══ הדרישה הבטיחותית ═══ */

t('כל רשומה יוצאת כטיוטה — אין דרך לעקוף', () => {
  const rows = seedToEntityRows('מעבדה כלשהי');
  eq(rows.length, SEED_COUNT);
  for (const row of rows) {
    eq(row.verification_status, 'draft_needs_verification', `${row.analyte} לא סומן כטיוטה`);
    ok(row.review_note_he.includes('לא אומתו'), `${row.analyte}: הפרובננס לא נשמר`);
  }
});

t('טווח טיוטה מסמן — אך מסומן כטיוטה', () => {
  __resetRegistry();
  loadReferenceRanges({ analytes: seedToEntityRows('בדיקה') });

  const r = resolveRange({ analyte: 'crp', ageDays: 1461 });
  eq(r.status, RANGE_STATUS.UNVERIFIED_RANGE, 'טווח טיוטה סווג כמאומת');

  const { normalized, warnings } = normalizeLabs({
    labs: [{ analyte: 'CRP', value: 60, unit: 'mg/L' }],
    patient: { age_days: 1461 },
  });
  eq(normalized[0].flag, 'high', 'הערך לא סומן כלל — הכלי היה נשאר חסר-שימוש');
  eq(normalized[0].flagged_by_draft_range, true, 'הסימון לא סומן כנשען על טיוטה');
  ok(warnings.some((w) => w.code === 'unverified_range'), 'לא הופקה אזהרה על טווח לא-מאומת');
});

t('טווח מאומת אינו מסמן כטיוטה', () => {
  __resetRegistry();
  loadReferenceRanges({
    analytes: seedToEntityRows('בדיקה').map((r) =>
      r.analyte === 'crp' ? { ...r, verification_status: 'verified' } : r),
  });
  const { normalized } = normalizeLabs({
    labs: [{ analyte: 'CRP', value: 60, unit: 'mg/L' }],
    patient: { age_days: 1461 },
  });
  eq(normalized[0].flagged_by_draft_range, false);
});

t('טווח שהוזן ידנית גובר על ה-seed ואינו טיוטה', () => {
  __resetRegistry();
  loadReferenceRanges({ analytes: seedToEntityRows('בדיקה') });
  const { normalized } = normalizeLabs({
    labs: [{ analyte: 'CRP', value: 60, unit: 'mg/L', ref_high: 10 }],
    patient: { age_days: 1461 },
  });
  eq(normalized[0].range_status, 'manual_range');
  eq(normalized[0].flagged_by_draft_range, false, 'טווח ידני סומן בטעות כטיוטה');
});

/* ═══ השרשרת המלאה — הבדיקה החשובה ═══ */

t('דפוס שנשען על טווח טיוטה אינו יכול להגיע לאדום', () => {
  __resetRegistry();
  loadReferenceRanges({ analytes: seedToEntityRows('בדיקה') });

  const PATTERN = {
    pattern_key: 'test.inflam', title_he: 'דלקת',
    components: [{ analyte: 'crp', direction: 'high' }, { analyte: 'wbc', direction: 'high' }],
    min_components: 2, direction_he: 'זיהום', suspicion: 'red',
    source_anchor: 'nelson.test', verification_status: 'verified',
  };

  const { normalized } = normalizeLabs({
    labs: [
      { analyte: 'CRP', value: 60, unit: 'mg/L' },
      { analyte: 'WBC', value: 22, unit: '10^9/L' },
    ],
    patient: { age_days: 1461 },
  });

  const { matched } = matchLabPatterns({
    patternKb: [PATTERN], labs: normalized, patient: { age_days: 1461 },
  });
  eq(matched.length, 1, 'הדפוס לא הופעל');
  eq(matched[0].relies_on_draft_range, true, 'הדפוס לא סומן כנשען על טווח טיוטה');

  const fb = buildFactBlock({ kbItems: matched, patientData: toPatientFacts(normalized) });
  const output = {
    directions: [{
      direction_id: 'D1', diagnosis_direction_he: 'זיהום',
      confidence: { level: 'red', confidence_reason_he: 'סמנים מוגברים', evidence_strength: 'strong' },
      fact_refs: ['F1', 'P1'], based_on_patterns: ['test.inflam'],
      supports_he: ['x'], refutes_he: ['y'],
    }],
    overall_suspicion: 'red', disclaimer_he: DISCLAIMER_HE,
  };

  const { output: cal } = calibrateOutput({ output, factBlock: fb, matchedPatterns: matched });
  eq(cal.directions[0].confidence.level, 'yellow',
    'חשד אדום נבנה על טווח ייחוס שלא אומת — זו בדיוק ההזיה שהמנגנון מונע');
  ok(
    cal.directions[0].confidence.calibration_reasons_he.some((r) => r.includes('טרם אומת')),
    'הסיבה לא הוסברה למשתמש'
  );
});

t('אותו דפוס עם טווח מאומת — כן מגיע לאדום', () => {
  __resetRegistry();
  loadReferenceRanges({
    analytes: seedToEntityRows('בדיקה').map((r) => ({ ...r, verification_status: 'verified' })),
  });

  const PATTERN = {
    pattern_key: 'test.inflam', title_he: 'דלקת',
    components: [{ analyte: 'crp', direction: 'high' }, { analyte: 'wbc', direction: 'high' }],
    min_components: 2, direction_he: 'זיהום', suspicion: 'red',
    source_anchor: 'nelson.test', verification_status: 'verified',
  };
  const { normalized } = normalizeLabs({
    labs: [
      { analyte: 'CRP', value: 60, unit: 'mg/L' },
      { analyte: 'WBC', value: 22, unit: '10^9/L' },
    ],
    patient: { age_days: 1461 },
  });
  const { matched } = matchLabPatterns({ patternKb: [PATTERN], labs: normalized, patient: { age_days: 1461 } });
  eq(matched[0].relies_on_draft_range, false);

  const fb = buildFactBlock({ kbItems: matched, patientData: toPatientFacts(normalized) });
  const output = {
    directions: [{
      direction_id: 'D1', diagnosis_direction_he: 'זיהום',
      confidence: { level: 'red', confidence_reason_he: 'סמנים מוגברים', evidence_strength: 'strong' },
      fact_refs: ['F1', 'P1'], based_on_patterns: ['test.inflam'],
      supports_he: ['x'], refutes_he: ['y'],
    }],
    overall_suspicion: 'red', disclaimer_he: DISCLAIMER_HE,
  };
  const { output: cal } = calibrateOutput({ output, factBlock: fb, matchedPatterns: matched });
  eq(cal.directions[0].confidence.level, 'red', 'טווח מאומת לא איפשר אדום — הכלי חסר-שימוש');
});

t('גיל מחוץ לכל המדרגות אינו מסמן', () => {
  __resetRegistry();
  loadReferenceRanges({ analytes: seedToEntityRows('בדיקה') });
  // amylase מוגדר רק מגיל שנה
  const { normalized } = normalizeLabs({
    labs: [{ analyte: 'עמילאז', value: 200, unit: 'U/L' }],
    patient: { age_days: 10 },
  });
  eq(normalized[0].flag, 'unknown_range', 'סומן ערך מחוץ למדרגות הגיל');
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}  ·  מדדים ב-seed: ${SEED_COUNT}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('ה-seed תקין ואכיפת הסטטוס עובדת.');
