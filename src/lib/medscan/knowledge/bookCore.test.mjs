/**
 * בדיקות אחסון הספר.
 *
 * שתי הבדיקות שנושאות כאן משקל אמיתי:
 *
 * 1. **שום תא לא נעלם.** הגרסה הראשונה סיננה תאים קצרים כ"תוויות",
 *    ובלעה איתם ספי-החלטה («71 מ"ג/ד"ל»). ספר שמשמיט בשקט גרוע מספר
 *    שאינו קיים — כי אי-אפשר לדעת שחסר.
 * 2. **הציטוט מוביל למקור.** עוגן שנשבר בשקט הוא כישלון גרוע מקריסה:
 *    הפלט ייראה מעוגן, הקישור יוביל לדף ריק, ואף בדיקה לא תתלונן.
 */

import assert from 'node:assert';
import {
  buildChapterRecords, searchBook, resolveAnchor, bookStats, topicKeyFor,
} from './bookCore.js';
import { bookToChunks, topicKeyFor as parserKey } from '../ingestion/bookParser.js';

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass += 1; console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name}\n      ${e.message}`); }
};
const eq = assert.strictEqual;
const ok = assert.ok;

const BOOK = {
  chapters: [
    {
      t: 'מחלות זיהומיות',
      topics: [
        {
          t: 'חום ללא מקור',
          pg: '12-14',
          b: [
            {
              k: 't', p: 12,
              v: [
                ['תינוק עד חודש', 'ילד מעל 3 חודשים'],
                [
                  'כל חום מעל 38 מחייב בירור ספסיס מלא כולל ניקור מותני',
                  'ניתן להסתפק בבדיקת שתן ובמעקב צמוד אם המצב הכללי טוב',
                ],
                ['61-90 ימים: 71 מ"ג/ד"ל', 'CRP'],
                ['', ''],
              ],
            },
            {
              k: 'p', p: 13,
              v: 'ירוד/טוקסיים/מדדים חיוניים לא -תקינים יש חשד לזיהום חיידק י ולכן פנאומוקוק',
            },
          ],
        },
      ],
    },
    {
      t: 'המטולוגיה',
      topics: [
        { t: 'אנמיה', pg: '40', b: [{ k: 'p', v: 'טקסט פסקה בלבד, ארוך מספיק כדי לעבור סף' }] },
      ],
    },
  ],
};

const cellsOf = (chapters) =>
  chapters.flatMap((ch) =>
    ch.topics.flatMap((t) => (t.tb ?? []).flatMap((tb) => tb.r.flat())),
  ).filter(Boolean);

console.log('\nbookCore\n');

/* ── אין השמטה שקטה ────────────────────────────────────────────────── */

test('סף מספרי קצר נשמר ואינו מסונן כתווית', () => {
  const cells = cellsOf(buildChapterRecords(BOOK));
  ok(cells.includes('61-90 ימים: 71 מ"ג/ד"ל'), 'סף החלטה נעלם מהספר');
  ok(cells.includes('CRP'), 'תווית קצרה נעלמה');
});

test('כל תא לא-ריק מהטבלה נשמר', () => {
  const cells = cellsOf(buildChapterRecords(BOOK));
  eq(cells.length, 6, 'מספר התאים אינו תואם את המקור');
});

test('שורה ריקה לגמרי מושמטת — תצוגה, לא תוכן', () => {
  const [ch] = buildChapterRecords(BOOK);
  eq(ch.topics[0].tb[0].r.length, 3);
});

/* ── פסקאות ────────────────────────────────────────────────────────── */

test('פסקאות אינן נכנסות לספר', () => {
  const all = JSON.stringify(buildChapterRecords(BOOK));
  ok(!all.includes('טוקסיים'), 'טקסט פסקה משובש נכנס לספר');
  ok(!all.includes('טקסט פסקה בלבד'), 'פסקה נכנסה לספר');
});

test('פרק שכולו פסקאות מושמט לגמרי', () => {
  const chapters = buildChapterRecords(BOOK);
  eq(chapters.length, 1);
  eq(chapters[0].title_he, 'מחלות זיהומיות');
});

test('מבנה הטבלה נשמר — שורות ועמודות, לא רשימה שטוחה', () => {
  const [tbl] = buildChapterRecords(BOOK)[0].topics[0].tb;
  eq(tbl.p, 12, 'עמוד לא נשמר');
  ok(Array.isArray(tbl.r[0]), 'שורה אינה מערך');
  eq(tbl.r[0][0], 'תינוק עד חודש');
  eq(tbl.r[0][1], 'ילד מעל 3 חודשים');
});

test('ספירת התאים תואמת את התוכן בפועל', () => {
  const [ch] = buildChapterRecords(BOOK);
  eq(ch.cell_count, cellsOf([ch]).length);
});

/* ── חוזה העוגן ────────────────────────────────────────────────────── */

test('מפתח העוגן בספר זהה לזה שמייצר החילוץ', () => {
  const [ch] = buildChapterRecords(BOOK);
  eq(ch.topics[0].k, parserKey('מחלות זיהומיות', 'חום ללא מקור'));
});

test('כל עוגן שהחילוץ מייצר נפתר בספר', () => {
  const chapters = buildChapterRecords(BOOK);
  const fromExtraction = bookToChunks(BOOK, { minChars: 10 })
    .filter((c) => c.kind === 'table_cell')
    .map((c) => topicKeyFor(c.chapter, c.topic));

  ok(fromExtraction.length > 0, 'החילוץ לא ייצר קטעים — הבדיקה חסרת ערך');
  for (const key of new Set(fromExtraction)) {
    ok(resolveAnchor(chapters, key), `עוגן ${key} אינו נפתר בספר`);
  }
});

test('עוגן שאינו קיים מחזיר null ולא זורק', () => {
  const chapters = buildChapterRecords(BOOK);
  eq(resolveAnchor(chapters, 'nelson.לא.קיים'), null);
  eq(resolveAnchor(chapters, null), null);
});

test('resolveAnchor מחזיר את הפרק והנושא, לא רק דגל', () => {
  const chapters = buildChapterRecords(BOOK);
  const r = resolveAnchor(chapters, chapters[0].topics[0].k);
  eq(r.chapter.title_he, 'מחלות זיהומיות');
  eq(r.topic.t, 'חום ללא מקור');
});

/* ── חיפוש ─────────────────────────────────────────────────────────── */

test('חיפוש מחזיר את התא עם השיוך המלא שלו', () => {
  const chapters = buildChapterRecords(BOOK);
  const [hit] = searchBook(chapters, 'ניקור מותני');
  eq(hit.chapter, 'מחלות זיהומיות');
  eq(hit.topic, 'חום ללא מקור');
  eq(hit.page, 12);
  ok(hit.topic_key.startsWith('nelson.'));
});

test('תוצאה נושאת את השורה כולה — תא בטבלה חסר פשר לבדו', () => {
  const chapters = buildChapterRecords(BOOK);
  const [hit] = searchBook(chapters, '71 מ"ג');
  ok(hit.row.includes('CRP'), 'הקשר השורה אבד — לא ברור מה נמדד');
});

test('שאילתה קצרה מדי אינה מחזירה את כל הספר', () => {
  const chapters = buildChapterRecords(BOOK);
  eq(searchBook(chapters, 'א').length, 0);
  eq(searchBook(chapters, '').length, 0);
});

test('חיפוש מכבד את מגבלת התוצאות', () => {
  const chapters = buildChapterRecords(BOOK);
  ok(searchBook(chapters, 'ח', { limit: 1, minChars: 1 }).length <= 1);
});

test('חיפוש בספר ריק אינו קורס', () => {
  eq(searchBook(null, 'חום').length, 0);
  eq(searchBook([], 'חום').length, 0);
});

test('bookStats סופר את מה שבאמת נשמר', () => {
  const s = bookStats(buildChapterRecords(BOOK));
  eq(s.chapters, 1);
  eq(s.topics, 1);
  eq(s.cells, 6);
});

test('קלט פגום אינו מפיל את הבנייה', () => {
  eq(buildChapterRecords(null).length, 0);
  eq(buildChapterRecords({}).length, 0);
  eq(buildChapterRecords({ chapters: [{ t: 'ריק' }] }).length, 0);
  eq(buildChapterRecords({ chapters: [{ t: 'א', topics: [{ t: 'ב', b: null }] }] }).length, 0);
  eq(buildChapterRecords({ chapters: [{ t: 'א', topics: [{ t: 'ב', b: [{ k: 't', v: null }] }] }] }).length, 0);
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
