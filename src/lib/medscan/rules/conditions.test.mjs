/**
 * בדיקות הערכת תנאים במנוע ה-Rules.
 *
 * ## למה הבדיקות האלה קיימות
 * אופרטור `range` היה מת בפרודקשן במשך כל חיי המערכת, ואיש לא ידע:
 * שכבת האחסון של הישויות שומרת את `condition.value` כמחרוזת בלבד —
 * מערך כלל אינו נכתב — והקוד דרש `Array.isArray`. כל כלל עם טווח
 * גיל או טווח ערכים החזיר null ולעולם לא נורה.
 *
 * לא היתה שגיאה, לא היתה אזהרה, והכלל נראה קיים ב-KB. זהו בדיוק
 * הכשל שהמערכת כולה נבנתה כדי למנוע — מנגנון שנראה פעיל ואינו.
 *
 * לכן הבדיקות כאן עובדות על **הצורה שבה הערך מגיע מהאחסון**, ולא
 * על הצורה שנוח לכתוב בבדיקה.
 */

import assert from 'node:assert';
import { runRulesEngine } from './rulesEngine.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

const rule = (conditions, key = 'r1') => ({
  rule_key: key,
  title_he: 'כלל בדיקה',
  conditions,
  logic: 'all',
  conclusion_he: 'מסקנה',
  suspicion: 'yellow',
  source_anchor: 'nelson.test.topic',
  verification_status: 'verified',
});

const fired = (conditions, ctx) => {
  const out = runRulesEngine({
    kb: { rules: [rule(conditions)], associations: [], labPatterns: [], redFlags: [], protocols: [], topics: [] },
    patient: ctx,
    labs: ctx.labs ?? [],
    mode: 'clinical',
  });
  return (out.rules ?? out.firedRules ?? []).length > 0;
};

console.log('\nהערכת תנאים\n');

/* ── range: הצורה שמגיעה מהאחסון ────────────────────────────────────── */

test('range כמחרוזת "29-90" — הצורה שנשמרת בפועל', () => {
  const c = [{ type: 'age', key: 'age', op: 'range', value: '29-90' }];
  assert.strictEqual(fired(c, { age_days: 60 }), true, 'בתוך הטווח ולא נורה');
  assert.strictEqual(fired(c, { age_days: 10 }), false, 'מתחת לטווח ונורה');
  assert.strictEqual(fired(c, { age_days: 200 }), false, 'מעל הטווח ונורה');
});

test('range כמחרוזת "[29,90]"', () => {
  const c = [{ type: 'age', key: 'age', op: 'range', value: '[29,90]' }];
  assert.strictEqual(fired(c, { age_days: 60 }), true);
  assert.strictEqual(fired(c, { age_days: 91 }), false);
});

test('range כמערך — עדיין נתמך', () => {
  const c = [{ type: 'age', key: 'age', op: 'range', value: [29, 90] }];
  assert.strictEqual(fired(c, { age_days: 29 }), true, 'הגבול התחתון כלול');
  assert.strictEqual(fired(c, { age_days: 90 }), true, 'הגבול העליון כלול');
});

test('range עם ערך שאינו טווח אינו יורה', () => {
  const c = [{ type: 'age', key: 'age', op: 'range', value: 'לא ידוע' }];
  assert.strictEqual(fired(c, { age_days: 60 }), false);
});

/* ── ספים מספריים כמחרוזת ──────────────────────────────────────────── */

test('סף ">" כמחרוזת "200"', () => {
  const c = [{ type: 'age', key: 'age', op: '>', value: '200' }];
  assert.strictEqual(fired(c, { age_days: 300 }), true);
  assert.strictEqual(fired(c, { age_days: 100 }), false);
});

test('סף "<=" כמחרוזת — גבול כלול', () => {
  const c = [{ type: 'age', key: 'age', op: '<=', value: '28' }];
  assert.strictEqual(fired(c, { age_days: 28 }), true);
  assert.strictEqual(fired(c, { age_days: 29 }), false);
});

test('השוואת מחרוזות אינה לקסיקוגרפית', () => {
  // "30" > "200" לקסיקוגרפית הוא true, ומספרית false.
  // זו התקלה שהיתה מתקבלת אילו ההשוואה נעשתה על מחרוזות.
  const c = [{ type: 'age', key: 'age', op: '>', value: '200' }];
  assert.strictEqual(fired(c, { age_days: 30 }), false);
});

/* ── סף פגום אינו "שלילה ודאית" ────────────────────────────────────── */

test('סף לא-מספרי מחזיר "לא ידוע" ולא "לא מתקיים"', () => {
  const c = [{ type: 'age', key: 'age', op: '>', value: 'הרבה' }];
  assert.strictEqual(fired(c, { age_days: 300 }), false, 'כלל עם סף פגום לא אמור לירות');
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
