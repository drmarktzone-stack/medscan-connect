/**
 * בדיקות למריץ החילוץ — ובפרט לשלושה כשלים שהיו בו.
 *
 * ## הכשלים
 *
 * **1. דילוג חלקי.** תנאי הדילוג היה `existing.has(topic_key) && part === 1`.
 *    בנושא שנחתך לשלושה חלקים, הרצה חוזרת דילגה על הראשון וחילצה מחדש
 *    את השניים הבאים. התוצאה: כפילות חלקית בכל הרצה חוזרת, בלי אינדיקציה,
 *    ובלי שאיש יראה זאת — הסיכום דיווח "דולג 1" והכל נראה תקין.
 *
 * **2. שמירה ללא בדיקת קיום.** `saveExtraction` קראה ל-create תמיד.
 *    כפילות ב-KB אינה מטרד: פריט כפול נכנס ל-FACT BLOCK פעמיים ונקרא
 *    כשני מקורות עצמאיים שמסכימים זה עם זה. זו הסכמה מזויפת.
 *
 * **3. `extractFromChunk` לא היה מיובא ב-knowledgeIngestion.**
 *    בדיוק הכשל שהפיל 947 מתוך 1001 חילוצים. בדיקת ייבוא אינה תופסת
 *    אותו — שם לא-מוגדר בתוך גוף פונקציה נכשל רק בזמן הקריאה.
 *    לכן הבדיקה כאן **קוראת** לפונקציה.
 */

import assert from 'node:assert';
import { buildExtractionUnits } from './runIngestion.js';
import { saveExtraction, NATURAL_KEY } from './knowledgeIngestion.js';
import * as ingestion from './knowledgeIngestion.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  const run = () => { pass += 1; console.log(`  ✓ ${name}`); };
  try {
    const r = fn();
    if (r instanceof Promise) return r.then(run, (e) => { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); });
    run();
  } catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};

console.log('\nמריץ החילוץ\n');

/* ── 1. חלוקה לחלקים ── */

test('נושא ארוך נחתך לכמה חלקים ממוספרים', () => {
  const long = 'שורה קלינית ארוכה מאוד. '.repeat(700);
  const units = buildExtractionUnits([
    { chapter: 'המטולוגיה', chapter_no: 6, topic: 'אנמיות', text: long, page: 1 },
  ]);
  assert.ok(units.length > 1, 'הטקסט הארוך לא נחתך');
  assert.deepStrictEqual(units.map((u) => u.part), units.map((_, i) => i + 1));
  assert.strictEqual(new Set(units.map((u) => u.topic_key)).size, 1, 'החלקים קיבלו מפתחות שונים');
});

/* ── 2. אין כפילות בשמירה ── */

const KEPT = () => ({
  topics: [{ topic_key: 'nelson.a.b', topic_title_he: 'נושא', summary_he: 'ס', source_quote_he: 'צ' }],
  lab_patterns: [],
  red_flags: [],
  clinical_rules: [{
    rule_key: 'nelson.r.1', title_he: 'כלל', conditions: [], conclusion_he: 'מ',
    suspicion: 'yellow', source_anchor: 'nelson.a.b', source_quote_he: 'צ',
  }],
  associations: [],
});

test('רשומה שכבר קיימת אינה נוצרת שוב', async () => {
  const existing = new Set(['KnowledgeTopic:nelson.a.b', 'ClinicalRule:nelson.r.1']);
  const { saved, skipped } = await saveExtraction(KEPT(), existing);
  assert.strictEqual(saved.topics, 0, 'נושא כפול נוצר');
  assert.strictEqual(saved.clinical_rules, 0, 'כלל כפול נוצר');
  assert.strictEqual(skipped.length, 2, 'הדילוג לא דווח');
});

test('אותה רשומה פעמיים באותה הרצה נשמרת פעם אחת', async () => {
  const existing = new Set();
  await saveExtraction(KEPT(), existing).catch(() => {});
  const { saved } = await saveExtraction(KEPT(), existing);
  assert.strictEqual(saved.topics, 0, 'הקריאה השנייה יצרה כפילות');
});

test('הדילוג מדווח ואינו שקט', async () => {
  const { skipped } = await saveExtraction(KEPT(), new Set(['KnowledgeTopic:nelson.a.b']));
  assert.ok(skipped[0].why_he, 'אין הסבר לדילוג');
  assert.strictEqual(skipped[0].key, 'nelson.a.b');
});

/* ── 3. שלמות המפתחות ── */

test('לכל ישות מוגדר מפתח טבעי', () => {
  for (const e of ['KnowledgeTopic', 'LabPattern', 'RedFlag', 'ClinicalRule', 'Association']) {
    assert.ok(NATURAL_KEY[e], `חסר מפתח טבעי ל-${e}`);
  }
});

/* ── 4. הרגרסיה של 947 הכשלים ── */

test('ingestChunk קוראת ל-extractFromChunk בלי ReferenceError', async () => {
  // הקריאה חייבת להגיע עד ה-LLM המדומה. אם extractFromChunk אינו
  // מיובא — נקבל ReferenceError, וזה בדיוק מה שקרה בפרודקשן.
  let reached = false;
  const invokeLLM = async () => { reached = true; return { topics: [], lab_patterns: [], red_flags: [], clinical_rules: [], associations: [] }; };

  const out = await ingestion.ingestChunk({
    text: 'ילדים עם חום מעל 38 מעלות. בדיקת דם מלאה. תרבית שתן. מעקב צמוד.',
    chapterHint: 'נלסון · בדיקה',
    invokeLLM,
  });

  assert.ok(reached, 'ה-LLM לא נקרא — extractFromChunk כנראה אינו מוגדר');
  assert.strictEqual(out.ok, true);
});

Promise.resolve().then(() => {
  setTimeout(() => {
    console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
    process.exit(fail > 0 ? 1 : 0);
  }, 50);
});
