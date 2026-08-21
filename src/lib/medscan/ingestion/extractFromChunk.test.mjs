/**
 * בדיקות extractFromChunk.
 *
 * ## הפער שהקובץ הזה סוגר
 * הפונקציה הזו רצה בפרודקשן וזרקה `EXTRACTION_SYSTEM_PROMPT is not
 * defined` — שגיאת ReferenceError פשוטה. היא הועברה ל-extractionCore.js
 * בריפקטור, ושני האימפורטים שלה נשארו ב-knowledgeIngestion.js.
 *
 * 253 בדיקות עברו ואף אחת לא תפסה את זה, כי **אף בדיקה לא קראה
 * לפונקציה**. ההנחה היתה שהיא דורשת LLM ולכן אינה בדיקה — אבל היא
 * מקבלת את `invokeLLM` כפרמטר בדיוק כדי שאפשר יהיה להזריק לה בדל.
 *
 * הלקח: `catch` שממיר כל חריגה למחרוזת שגיאה הופך באג תכנותי
 * לתוצאה עסקית שנראית לגיטימית. הריצה דיווחה "947 נכשלו" בשלווה
 * במקום לקרוס — ולכן נראתה כמו בעיית תוכן ולא כמו קוד שבור.
 */

import assert from 'node:assert';
import { extractFromChunk } from './extractionCore.js';

let pass = 0, fail = 0;
const test = async (name, fn) => {
  try { await fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const eq = assert.strictEqual;
const ok = assert.ok;

const VALID = {
  topics: [{ topic_key: 'nelson.a.b', topic_title_he: 'נושא', summary_he: 'סיכום',
    source_quote_he: 'ציטוט מספיק ארוך' }],
  gaps_he: ['פער'],
};

console.log('\nחילוץ מקטע\n');

await test('קריאה תקינה מחזירה חילוץ ללא שגיאה', async () => {
  const { extraction, error } = await extractFromChunk({
    text: 'טקסט קליני לחילוץ',
    invokeLLM: async () => VALID,
  });
  eq(error, null);
  eq(extraction.topics[0].topic_key, 'nelson.a.b');
});

/* ── מה שנשבר בפרודקשן ─────────────────────────────────────────────── */

await test('הסכמה והפרומפט מועברים בפועל — לא undefined', async () => {
  let received = null;
  await extractFromChunk({
    text: 'טקסט',
    invokeLLM: async (args) => { received = args; return VALID; },
  });
  ok(received, 'invokeLLM לא נקראה');
  ok(received.schema, 'לא הועברה סכמה — זה הבאג שהפיל 947 קריאות');
  ok(received.system, 'לא הועבר פרומפט מערכת');
  eq(received.schema.type, 'object');
  ok(received.schema.properties?.topics, 'הסכמה אינה סכמת החילוץ');
  ok(received.system.includes('verbatim'), 'הפרומפט אינו פרומפט החילוץ');
});

await test('purpose מסומן כחילוץ ידע', async () => {
  let received = null;
  await extractFromChunk({ text: 'x', invokeLLM: async (a) => { received = a; return VALID; } });
  eq(received.purpose, 'knowledge_extraction');
});

await test('הטקסט עצמו מגיע לפרומפט', async () => {
  let received = null;
  const text = 'תינוק בן 5 ימים עם חום';
  await extractFromChunk({ text, invokeLLM: async (a) => { received = a; return VALID; } });
  ok(received.prompt.includes(text), 'הטקסט לא הועבר');
});

await test('chapterHint מופיע בפרומפט כשניתן, ולא כשלא', async () => {
  let withHint = null, without = null;
  await extractFromChunk({ text: 'x', chapterHint: 'נלסון › זיהומיות',
    invokeLLM: async (a) => { withHint = a; return VALID; } });
  await extractFromChunk({ text: 'x',
    invokeLLM: async (a) => { without = a; return VALID; } });
  ok(withHint.prompt.includes('נלסון › זיהומיות'));
  ok(!without.prompt.includes('הקשר:'));
});

/* ── טיפול בכשל ────────────────────────────────────────────────────── */

await test('חריגה מה-LLM מוחזרת כשגיאה ולא מפילה', async () => {
  const { extraction, error } = await extractFromChunk({
    text: 'x',
    invokeLLM: async () => { throw new Error('rate limit'); },
  });
  eq(extraction, null);
  ok(error.includes('rate limit'));
});

await test('פלט שאינו אובייקט מדווח כמעוות', async () => {
  for (const bad of ['מחרוזת', 42, null, undefined]) {
    const { extraction, error } = await extractFromChunk({
      text: 'x', invokeLLM: async () => bad,
    });
    eq(extraction, null);
    eq(error, 'extraction_malformed', `לא זוהה פלט מעוות: ${JSON.stringify(bad)}`);
  }
});

await test('שגיאת ReferenceError אינה נבלעת כתוצאה עסקית', async () => {
  // זה בדיוק מה שקרה: באג תכנותי הופיע כ"נכשל" ולא כקריסה.
  // הבדיקה מוודאת שההודעה עצמה מגיעה החוצה ולא נמחקת.
  const { error } = await extractFromChunk({
    text: 'x',
    invokeLLM: async () => { throw new ReferenceError('SOMETHING is not defined'); },
  });
  ok(error.includes('is not defined'), 'ההודעה נבלעה');
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
