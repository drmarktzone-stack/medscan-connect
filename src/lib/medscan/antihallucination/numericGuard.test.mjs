/**
 * בדיקות ל-numericGuard — ובפרט לחור שהיה בו.
 *
 * ## החור
 * `UNIVERSALLY_ALLOWED` ({0,1,2,3,100}) נבדק **לפני** סיווג ההקשר.
 * לכן «2 מ"ג/ק"ג» עבר תמיד, בלי שום מקור, בכל מסלול במערכת —
 * גם במסלולים הקליניים המלאים.
 *
 * הרשימה נועדה למספרי ספירה בפרוזה ("שני ממצאים", "שלב 1"), אבל
 * היא חלה גם על מינונים. וספרה בודדת היא בדיוק המינון הכי סביר
 * ברפואת ילדים — ולכן הכי מסוכן להמציא: מינון של 2 מ"ג/ק"ג נראה
 * תקין לחלוטין לעין, גם כשהוא שגוי פי חמישה.
 *
 * הבדיקות כאן מקבעות את ההפרדה: בהקשר קריטי אין היתר גורף.
 */

import assert from 'node:assert';
import { numericGuard, redactUnsourcedNumbers } from './numericGuard.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

/** FACT BLOCK שבו אין ולו מספר אחד — כדי שכל מספר יהיה חסר-מקור. */
const EMPTY = { allowedNumbers: new Set() };
const WITH = (...nums) => ({ allowedNumbers: new Set(nums.map(String)) });

const sev = (text, fb = EMPTY) => {
  const r = numericGuard({ note: text }, fb);
  return r.violations[0]?.severity ?? null;
};

console.log('\nnumericGuard\n');

/* ── הרגרסיה ── */

test('«2 מ"ג/ק"ג» ללא מקור נחסם — אף שהמספר 2 ברשימת ההיתר', () => {
  const r = numericGuard({ note: 'מתן 2 מ"ג/ק"ג ליום.' }, EMPTY);
  assert.strictEqual(r.blocked.length, 1, 'מינון חד-ספרתי לא נחסם');
});

test('«1 מ"ל/ק"ג» ללא מקור נחסם', () => {
  assert.strictEqual(sev('בולוס 1 מ"ל/ק"ג.'), 'block');
});

test('«3 mg/kg» באנגלית נחסם גם הוא', () => {
  assert.strictEqual(sev('give 3 mg/kg now'), 'block');
});

test('אותו מספר בהקשר קריטי עובר כשיש לו מקור', () => {
  const r = numericGuard({ note: 'מתן 2 מ"ג/ק"ג ליום.' }, WITH(2));
  assert.strictEqual(r.blocked.length, 0, 'מינון מעוגן נחסם בטעות');
});

/* ── ההיתר עדיין עובד היכן שנועד ── */

test('מספר ספירה בפרוזה רגילה עובר בלי מקור', () => {
  const r = numericGuard({ note: 'נמצאו 2 ממצאים בתמונה.' }, EMPTY);
  assert.strictEqual(r.violations.length, 0, 'מספר ספירה תמים סומן');
});

test('100 בפרוזה עובר', () => {
  const r = numericGuard({ note: 'כיסוי של 100 מהשדה.' }, EMPTY);
  assert.strictEqual(r.violations.length, 0);
});

test('מספר שאינו ברשימה ואינו בהקשר קריטי — אזהרה, לא חסימה', () => {
  assert.strictEqual(sev('נצפו 47 מוקדים.'), 'warn');
});

test('סף מספרי — אזהרה מוחמרת', () => {
  assert.strictEqual(sev('ערכים מעל 95 אחוזון.'), 'warn_high');
});

/* ── redact: אותה הפרדה ── */

test('redact מנטרל מינון חד-ספרתי חסר-מקור', () => {
  const out = redactUnsourcedNumbers('מתן 2 מ"ג/ק"ג ליום.', EMPTY);
  assert.ok(!/\b2\s*מ"ג/.test(out), 'המינון שרד את הניטרול');
  assert.ok(/הוסר/.test(out), 'ההסרה אינה מוצהרת');
});

test('redact אינו נוגע במספר ספירה בפרוזה', () => {
  const out = redactUnsourcedNumbers('נמצאו 2 ממצאים.', EMPTY);
  assert.strictEqual(out, 'נמצאו 2 ממצאים.');
});

test('redact אינו נוגע במספר שיש לו מקור', () => {
  const out = redactUnsourcedNumbers('מתן 15 מ"ג/ק"ג.', WITH(15));
  assert.ok(/15/.test(out));
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
