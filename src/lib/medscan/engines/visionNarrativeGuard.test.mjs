/**
 * בדיקות ל-numericGuard על נרטיב ה-Vision.
 *
 * ## למה הבדיקות האלה קיימות
 * שלושת מודולי ה-Vision כבר בשימוש בפרודקשן, והפלט שלהם — summary,
 * analysis, guideline — הוצג לרופא/ה **בלי אף בדיקה מספרית**. שכבת
 * האנטי-הזיה היתה קיימת במלואה בקוד ולא נקראה מהפייפליין הזה כלל.
 *
 * זהו בדיוק הכשל שהפרויקט נבנה נגדו: מנגנון שנראה קיים ואינו פעיל.
 *
 * הבדיקות כאן מתמקדות בשלוש נקודות:
 *   1. מספר שיש לו מקור בתצפית — עובר.
 *   2. מינון שאין לו מקור — נחסם ומנוטרל, לא מוסתר.
 *   3. הבדיקה אינה מתיימרת לאמת נכונות — רק עקיבות.
 */

import assert from 'node:assert';
import { guardVisionNarrative } from './visionNarrativeGuard.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

const MEASUREMENTS = [
  { parameter: 'QTc', value: '470 מילי-שניות' },
  { parameter: 'קצב', value: '88 לדקה' },
];

const run = (diagnosis, extra = {}) =>
  guardVisionNarrative({ diagnosis, measurements: MEASUREMENTS, ...extra });

console.log('\nnumericGuard על נרטיב ה-Vision\n');

/* ── מספר שנצפה ── */

test('מספר שחולץ כמדידה עובר', () => {
  const { integrity } = run({ summary: 'QTc מוארך — 470 מילי-שניות.' });
  assert.strictEqual(integrity.ok, true);
  assert.strictEqual(integrity.blocked.length, 0);
});

test('מספר מהקריאה המובנית של המנוע עובר', () => {
  const { integrity } = run(
    { summary: 'ציר QRS 62 מעלות.' },
    { engineStructured: { axis: { qrs_axis_degrees: 62 } } }
  );
  assert.strictEqual(integrity.blocked.length, 0, 'מספר מהמנוע נחסם בטעות');
});

test('מספר מההקשר הקליני שהרופא/ה הזין/ה עובר', () => {
  const { integrity } = run(
    { summary: 'ילד בן 7 שנים.' },
    { clinicalContext: 'ילד בן 7, ללא רקע.' }
  );
  assert.strictEqual(integrity.blocked.length, 0);
});

/* ── מינון מומצא: המקרה שבגללו המודול קיים ── */

test('מינון שאין לו מקור נחסם', () => {
  const { integrity } = run({ guideline: 'להתחיל פרופרנולול 2 מ"ג/ק"ג ליום.' });
  assert.strictEqual(integrity.ok, false, 'מינון חסר-מקור לא נחסם');
  assert.ok(integrity.blocked.length > 0);
});

test('המינון מנוטרל בפלט ולא נמחק בשקט', () => {
  const { diagnosis, integrity } = run({ guideline: 'פרופרנולול 2 מ"ג/ק"ג ליום.' });
  assert.ok(!/\b2\s*מ"ג/.test(diagnosis.guideline), 'המספר עדיין מוצג');
  assert.ok(/הוסר/.test(diagnosis.guideline), 'ההסרה אינה מוצהרת בטקסט');
  assert.ok(integrity.redacted_fields.includes('guideline'), 'ההסרה אינה מדווחת');
});

test('קצב נוזלים חסר-מקור נחסם גם הוא', () => {
  const { integrity } = run({ analysis: 'בולוס 20 מ"ל/ק"ג.' });
  assert.ok(integrity.blocked.length > 0);
});

/* ── חומרה מדורגת ── */

test('סף חסר-מקור מדווח כאזהרה ואינו מנוטרל', () => {
  const { diagnosis, integrity } = run({ analysis: 'ערכים מעל 95 אחוזון נחשבים חריגים.' });
  assert.ok(integrity.violations.length > 0, 'לא דווחה אזהרה');
  assert.strictEqual(integrity.redacted_fields.length, 0, 'אזהרה נוטרלה במקום להיות מוצגת');
  assert.ok(/95/.test(diagnosis.analysis), 'הטקסט הקליני רוקן מתוכן');
});

test('שדה שלא נפגע אינו משתנה', () => {
  const { diagnosis } = run({
    summary: 'QTc 470.',
    guideline: 'מתן 2 מ"ג/ק"ג.',
  });
  assert.strictEqual(diagnosis.summary, 'QTc 470.', 'שדה תקין שונה שלא לצורך');
});

/* ── המגבלה מוצהרת ── */

test('המגבלה — עקיבות ולא נכונות — מוצהרת תמיד', () => {
  const { integrity } = run({ summary: 'QTc 470.' });
  assert.ok(/לא שהתצפית נכונה/.test(integrity.limitation_he));
});

test('מדידה שגויה של קורא-התמונה נחשבת מקורית — וזו המגבלה', () => {
  // 999 אינו ערך QTc אפשרי, אבל הוא נצפה. הבדיקה הזו מתעדת
  // במפורש מה המודול אינו עושה, כדי שאיש לא יסתמך עליו לכך.
  const { integrity } = run(
    { summary: 'QTc 999 מילי-שניות.' },
    { measurements: [{ parameter: 'QTc', value: '999' }] }
  );
  assert.strictEqual(integrity.blocked.length, 0);
});

/* ── קלט חסר ── */

test('פלט ריק אינו מפיל את הבדיקה', () => {
  const { integrity } = run({});
  assert.strictEqual(integrity.ok, true);
});

/* ── מנדט: לעולם לא אבחנה סופית (validateScope על נרטיב ה-Vision) ── */

test('ניסוח "האבחנה היא" בנרטיב מסומן כחריגת-מנדט', () => {
  const { integrity } = run({ summary: 'האבחנה היא אוטיזם.' });
  assert.strictEqual(integrity.mandate_ok, false, 'ניסוח אבחנה סופית לא נתפס');
  assert.ok(integrity.mandate_violations.length > 0, 'לא דווחה חריגת מנדט');
  assert.ok(/מנדט/.test(integrity.mandate_note_he), 'אין הודעת מנדט למשתמש');
});

test('ניסוח דיספוזיציה ("ניתן לשחרר") מסומן כחריגת-מנדט', () => {
  const { integrity } = run({ guideline: 'מצב יציב — ניתן לשחרר לבית.' });
  assert.strictEqual(integrity.mandate_ok, false);
});

test('ניסוח תמיכה-בהחלטה תקין עובר ללא חריגה', () => {
  const { integrity } = run({
    summary: 'ממצאים מתאימים ל-QT מוארך; מומלץ בירור והתייעצות.',
    analysis: 'הכיוון הסביר ביותר הוא QT מוארך; יש לשקול אבחנות נוספות.',
  });
  assert.strictEqual(integrity.mandate_ok, true, 'ניסוח תקין סומן בטעות כחריגה');
  assert.strictEqual(integrity.mandate_violations.length, 0);
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
