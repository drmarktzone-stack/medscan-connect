/**
 * MedScan — בדיקות חילוץ תצפיות מכל מודליות Vision
 *
 * הרצה:  node src/lib/medscan/engines/visionObservations.test.mjs
 */

import {
  extractObservationsFor, extractEcgMeasurements,
  toPatientFacts, toFindingStrings, extractIndeterminateZones,
} from './visionObservations.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { numericGuard } from '../antihallucination/numericGuard.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const ECG = {
  is_ecg: true, interpretable: true,
  rhythm_and_rate: { rhythm: 'סינוס', rate_bpm: 110 },
  intervals: { pr_ms: 120, qrs_ms: 80, qt_ms: 360, rr_ms: 545, qtc_bazett_ms: 487, qtc_status: 'Prolonged' },
  wave_and_segment_morphology: { st_segment: 'עליית ST ב-V1-V3', t_waves: 'תקין', q_waves: 'תקין' },
  hypertrophy_and_enlargement: { lvh_present: true, rvh_present: false, atrial_enlargement: 'None' },
  primary_findings: ['QTc מוארך', 'עליית ST'],
  finding_evidence: [{ finding: 'QTc מוארך', leads: 'II', evidence: 'QTc 487ms' }],
  differential_diagnoses: [{ diagnosis: 'Long QT syndrome', likelihood: 'Moderate' }],
  critical_red_flags: [],
};

const SKIN = {
  is_relevant: true, interpretable: true,
  image_metadata: { anatomical_location: 'זרוע ימין', estimated_fitzpatrick_type: 'IV', technical_quality: 'Adequate' },
  dermatological_descriptors: {
    primary_lesions: ['מקולה אריתמטוטית'],
    secondary_lesions: ['קשקש'],
    configuration: 'אנולרית',
    distribution_pattern: 'מפושט',
    color_and_border: 'גבולות ברורים',
  },
  key_findings_summary: ['נגע אנולרי עם שוליים פעילים'],
  differential_diagnoses: [{ diagnosis: 'Tinea corporis', likelihood: 'High' }],
  critical_red_flags: [],
};

const RADIOLOGY = {
  image_metadata: { modality_detected: 'X-Ray', anatomical_region: 'Chest', technical_quality: 'Adequate' },
  systematic_findings: [
    { anatomical_zone: 'ריאה ימין', status: 'Abnormal', description: 'תסנין' },
    { anatomical_zone: 'לב', status: 'Indeterminate', description: 'לא ניתן להעריך' },
  ],
  key_abnormalities: [{ finding: 'תסנין', location: 'אונה תחתונה ימנית', characteristics: 'אטימות' }],
  differential_diagnoses: [{ diagnosis: 'דלקת ריאות', likelihood: 'High' }],
  critical_red_flags: [],
};

console.log('\nחילוץ תצפיות — שלוש המודליות\n');

/* ═══ ECG ═══ */

t('ECG: finding_evidence הוא המקור העיקרי', () => {
  const obs = extractObservationsFor('ecg', ECG);
  const qtc = obs.find((o) => o.finding_he === 'QTc מוארך');
  ok(qtc, 'הממצא לא חולץ');
  eq(qtc.characteristics_he, 'QTc 487ms', 'הראיה המדידה לא נשמרה');
  eq(qtc.source, 'finding_evidence');
});

t('ECG: ממצא ללא רשומת-ראיה מסומן ככזה', () => {
  const obs = extractObservationsFor('ecg', ECG);
  const st = obs.find((o) => o.finding_he === 'עליית ST');
  eq(st.source, 'primary_finding_without_evidence', 'ממצא ללא ראיה לא סומן');
});

t('ECG: מורפולוגיה תקינה אינה נספרת כממצא', () => {
  const texts = extractObservationsFor('ecg', ECG).map((o) => o.finding_he).join(' | ');
  ok(!texts.includes('גלי T: תקין'), 'ממצא תקין נספר');
  ok(texts.includes('מקטע ST: עליית ST'), 'מורפולוגיה חריגה לא חולצה');
});

t('ECG: LVH חולץ, RVH שאינו קיים לא', () => {
  const texts = extractObservationsFor('ecg', ECG).map((o) => o.finding_he).join(' | ');
  ok(texts.includes('חדר שמאל'), 'LVH לא חולץ');
  ok(!texts.includes('חדר ימין'), 'RVH שאינו קיים חולץ');
});

t('ECG: אבחנות המודל אינן דולפות לתצפיות', () => {
  const texts = extractObservationsFor('ecg', ECG).map((o) => o.finding_he).join(' | ');
  ok(!texts.includes('Long QT syndrome'), 'אבחנה של המודל דלפה — לולאת אישור-עצמי');
});

/* ═══ המדידות — הנקודה הקריטית ל-numericGuard ═══ */

t('ECG: מדידות מספריות נכנסות כערכי P#', () => {
  const m = extractEcgMeasurements(ECG);
  const qtc = m.find((x) => x.key === 'ecg_qtc_bazett_ms');
  eq(qtc.value, 487);
  eq(qtc.unit, 'ms');
  ok(qtc.label_he.includes('נמדד מהתרשים'), 'לא מסומן כתצפית ולא כערך מחושב');
});

t('ECG: המרווחים הופכים למספרים מותרים ב-numericGuard', () => {
  const obs = extractObservationsFor('ecg', ECG);
  const fb = buildFactBlock({ kbItems: [], patientData: toPatientFacts(obs, ECG, 'ecg') });

  // ציטוט לגיטימי של מרווח שנמדד — חייב לעבור
  const out = { uncertainty_note_he: 'QTc 487 ms מוארך ביחס לקצב 110' };
  eq(numericGuard(out, fb).blocked.length, 0, 'מרווח שנמדד נחסם — הפלט ייראה כאילו הומצא');

  // מספר שלא נמדד — חייב להיחסם
  const bad = { uncertainty_note_he: 'מרווח QT מתוקן 612 ms' };
  ok(numericGuard(bad, fb).violations.some((v) => v.number === '612'), 'מספר מומצא עבר');
});

t('ECG: מרווח שלא סופק אינו נכנס', () => {
  const partial = { intervals: { pr_ms: 120, qrs_ms: 80, qt_ms: 360, rr_ms: 545 } };
  const m = extractEcgMeasurements(partial);
  ok(!m.some((x) => x.key === 'ecg_qtc_bazett_ms'), 'מרווח שלא נמדד הומצא');
});

/* ═══ עור ═══ */

t('עור: נגעים ראשוניים ומשניים מובחנים', () => {
  const obs = extractObservationsFor('skin', SKIN);
  const texts = obs.map((o) => o.finding_he);
  ok(texts.some((x) => x.includes('נגע ראשוני: מקולה')), 'נגע ראשוני לא חולץ');
  ok(texts.some((x) => x.includes('נגע משני: קשקש')), 'נגע משני לא חולץ');
});

t('עור: המיקום האנטומי מוצמד לכל ממצא', () => {
  const obs = extractObservationsFor('skin', SKIN);
  ok(obs.every((o) => o.location_he === 'זרוע ימין'), 'המיקום לא הוצמד');
});

t('עור: Fitzpatrick נכנס למאפייני התמונה', () => {
  const facts = toPatientFacts(extractObservationsFor('skin', SKIN), SKIN, 'skin');
  const meta = facts.find((f) => f.key === 'image_meta');
  ok(meta.value.includes('Fitzpatrick IV'), 'סוג העור לא נשמר — הוא מגביל את הוודאות');
});

t('עור: אבחנת המודל אינה דולפת', () => {
  const texts = extractObservationsFor('skin', SKIN).map((o) => o.finding_he).join(' | ');
  ok(!texts.includes('Tinea'), 'אבחנה דלפה לתצפיות');
});

/* ═══ רדיולוגיה — רגרסיה ═══ */

t('רדיולוגיה: עדיין עובד דרך ה-API המאוחד', () => {
  const obs = extractObservationsFor('radiology', RADIOLOGY);
  const texts = obs.map((o) => o.finding_he).join(' | ');
  ok(texts.includes('תסנין'));
  ok(!texts.includes('דלקת ריאות'), 'אבחנה דלפה');
  ok(!texts.includes('לא ניתן להעריך'), 'אזור Indeterminate נספר כממצא');
});

t('רדיולוגיה: אזור שלא הוערך נאסף בנפרד', () => {
  eq(extractIndeterminateZones(RADIOLOGY)[0], 'לב');
});

t('מודליות לא מוכרת זורקת שגיאה מפורשת', () => {
  try {
    extractObservationsFor('mri_brain', {});
    throw new Error('לא נזרקה שגיאה');
  } catch (e) {
    ok(e.message.includes('Unknown vision modality'));
  }
});

t('דגל שהמודל דיווח נכנס כממצא בכל המודליות', () => {
  for (const [mod, data] of [['ecg', ECG], ['skin', SKIN], ['radiology', RADIOLOGY]]) {
    const withFlag = { ...data, critical_red_flags: ['חשד למצב מסכן חיים'] };
    const obs = extractObservationsFor(mod, withFlag);
    const flag = obs.find((o) => o.source === 'model_reported_flag');
    ok(flag, `${mod}: דגל שדווח לא נכנס כממצא`);
    eq(flag.severity, 'reported_red_flag');
  }
});

t('toFindingStrings מוסיף וריאנט עם מיקום', () => {
  const strings = toFindingStrings([{ finding_he: 'תסנין', location_he: 'אונה תחתונה' }]);
  ok(strings.includes('תסנין'));
  ok(strings.includes('תסנין אונה תחתונה'), 'וריאנט המיקום חסר — יפחית התאמות KB');
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('חילוץ התצפיות תקין בכל המודליות.');
