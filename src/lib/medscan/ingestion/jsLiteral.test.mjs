/**
 * בדיקות פענוח אובייקט-ליטרל.
 *
 * ## הבדיקה שבגללה הקובץ הזה קיים
 * הגרסה הקודמת המירה JS ל-JSON ברג'קס. על הספר האמיתי היא נכשלה,
 * ובבדיקה התברר למה: הדפוס שנועד לצטט מפתחות תפס טקסט **בתוך
 * מחרוזת** — «III, V :Early onset» הפך ל-«III, "V":Early onset».
 *
 * זו לא תקלת פענוח אלא שחיתות תוכן. במקרה הזה היא רעשה ולכן נתפסה;
 * בכל מקום שבו המרה כזו מצליחה, היא משנה טקסט קליני בשקט.
 *
 * לכן הבדיקה הראשונה כאן היא בדיוק המחרוזת ההיא.
 */

import assert from 'node:assert';
import { parseJsLiteral } from './jsLiteral.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); }
};
const eq = assert.strictEqual;
const deep = assert.deepStrictEqual;

console.log('\nפענוח אובייקט-ליטרל\n');

/* ── שחיתות תוכן: המקרה האמיתי ─────────────────────────────────────── */

test('טקסט קליני עם "מילה :" נשאר שלם', () => {
  const src = "{v:['סרוטיפים אופיניים ל-Ia, Ib, II, III, V :Early onset.']}";
  const out = parseJsLiteral(src);
  eq(out.v[0], 'סרוטיפים אופיניים ל-Ia, Ib, II, III, V :Early onset.');
});

test('נקודתיים בתוך מחרוזת אינם הופכים למפתח', () => {
  const out = parseJsLiteral("{t:'אבחנה: יש לשלול, ואז: לטפל'}");
  eq(out.t, 'אבחנה: יש לשלול, ואז: לטפל');
});

test('סוגריים מסולסלים בתוך מחרוזת אינם פותחים אובייקט', () => {
  const out = parseJsLiteral("{t:'ערך {נמוך} או [גבוה]'}");
  eq(out.t, 'ערך {נמוך} או [גבוה]');
});

/* ── תחביר JS שאינו JSON ───────────────────────────────────────────── */

test('מפתחות ללא מרכאות', () => {
  deep(parseJsLiteral('{k:"t",p:1}'), { k: 't', p: 1 });
});

test('מחרוזת בגרש בודד ובגרש הפוך', () => {
  deep(parseJsLiteral("{a:'אחד',b:`שניים`}"), { a: 'אחד', b: 'שניים' });
});

test('פסיק נגרר באובייקט ובמערך', () => {
  deep(parseJsLiteral('{a:[1,2,],}'), { a: [1, 2] });
});

test('מרכאות כפולות בתוך מחרוזת בגרש בודד', () => {
  eq(parseJsLiteral(`{t:'בד"כ תוך 24 שעות'}`).t, 'בד"כ תוך 24 שעות');
});

test('גרש בודד מוברח בתוך מחרוזת', () => {
  eq(parseJsLiteral(`{t:'יח\\' לק"ג'}`).t, `יח' לק"ג`);
});

/* ── ערכים ─────────────────────────────────────────────────────────── */

test('מספרים, שליליים ועשרוניים', () => {
  deep(parseJsLiteral('{a:1,b:-2,c:3.5,d:0.5}'), { a: 1, b: -2, c: 3.5, d: 0.5 });
});

test('true / false / null', () => {
  deep(parseJsLiteral('{a:true,b:false,c:null}'), { a: true, b: false, c: null });
});

test('קינון עמוק נשמר', () => {
  const out = parseJsLiteral('{chapters:[{t:"א",topics:[{t:"ב",b:[{k:"t",v:[["x","y"]]}]}]}]}');
  eq(out.chapters[0].topics[0].b[0].v[0][1], 'y');
});

test('מערך ריק ואובייקט ריק', () => {
  deep(parseJsLiteral('{a:[],b:{}}'), { a: [], b: {} });
});

test('תווי בריחה: שורה חדשה וטאב', () => {
  eq(parseJsLiteral('{t:"א\\nב\\tג"}').t, 'א\nב\tג');
});

test('רצף יוניקוד מוברח', () => {
  eq(parseJsLiteral('{t:"\\u05d0"}').t, 'א');
});

test('רווח קשיח מדולג כרווח לבן מבני', () => {
  deep(parseJsLiteral('{\u00a0a:\u00a01\u00a0}'), { a: 1 });
});

/* ── בטיחות ────────────────────────────────────────────────────────── */

test('אין הרצת קוד — קריאת פונקציה נדחית', () => {
  assert.throws(() => parseJsLiteral('{a:alert(1)}'));
});

test('מבנה פגום נכשל ברעש ולא מחזיר חלקי', () => {
  assert.throws(() => parseJsLiteral('{a:[1,2'));
  assert.throws(() => parseJsLiteral('{a:'));
  assert.throws(() => parseJsLiteral("{a:'לא נסגר"));
});

test('תוכן עודף אחרי המבנה נדחה', () => {
  assert.throws(() => parseJsLiteral('{a:1} זבל'));
});

test('הודעת השגיאה כוללת מיקום והקשר', () => {
  try { parseJsLiteral('{a:1,b:@}'); assert.fail('לא נזרקה שגיאה'); }
  catch (e) {
    assert.ok(/במיקום \d+/.test(e.message), 'אין מיקום');
    assert.ok(e.message.includes('…'), 'אין הקשר');
  }
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
