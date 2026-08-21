/**
 * MedScan — בדיקות מפענח ספר הטבלאות
 *
 * הרצה:  node src/lib/medscan/ingestion/bookParser.test.mjs
 */

import {
  extractBookSource, bookToChunks, topicKeyFor, summarizeBook, chunksForChapter,
} from './bookParser.js';
import { detectSeams } from './extractionCore.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/** מבנה זהה למקור האמיתי. */
const BOOK = {
  chapters: [
    {
      t: 'מחלות זיהומיות',
      topics: [
        {
          t: 'מדוכאי חיסון',
          pg: '5',
          b: [
            {
              k: 't', p: 5,
              v: [
                ['', 'חום במדוכאי חיסון', '', 'חום בילד 2-24 חודשים'],
                [
                  'זיהומים בחסרי חיסון ראשוניים: הפרעה משולבת בתאי T ובתאי B, פירוט נרחב על הסוגים',
                  '', '',
                  'בניגוד ליילודים ניתן להסתמך הרבה יותר על קליניקה ובדיקה גופנית מלאה',
                ],
                ['', 'חום ונויטרופניה', '', ''],
                ['בהינתן חום מעל 38.3 מעלות ונויטרופניה יש לבצע הערכה קלינית מלאה ותרביות', '', '', ''],
              ],
            },
            { k: 'p', p: 5, v: 'פסקה חופשית עם תוכן קליני מספיק ארוך כדי לעבור את סף המינימום שהוגדר' },
            { k: 'p', p: 5, v: 'קצר' },
          ],
        },
      ],
    },
    { t: 'קרדיולוגיה', topics: [{ t: 'אלקטרופיזיולוגיה', pg: '59', b: [] }] },
  ],
};

console.log('\nמפענח ספר הטבלאות\n');

/* ═══ חילוץ מ-HTML ═══ */

t('BOOK מחולץ מ-HTML עם איזון סוגריים', () => {
  const html = `<script>\nconst SYN={a:1};\nconst BOOK = {"chapters":[{"t":"א","topics":[]}]};\nconst X=2;\n</script>`;
  const { source, error } = extractBookSource(html);
  eq(error, null);
  ok(source.startsWith('{') && source.endsWith('}'));
  ok(source.includes('chapters'));
});

t('סוגריים בתוך מחרוזת אינם שוברים את האיזון', () => {
  const html = `const BOOK = {"t":"טקסט עם } סוגר בתוך מחרוזת","x":1};`;
  const { source, error } = extractBookSource(html);
  eq(error, null);
  ok(source.includes('"x":1'), 'האיזון נשבר על סוגר בתוך מחרוזת');
});

t('BOOK חסר מדווח ולא זורק', () => {
  eq(extractBookSource('<html>ללא נתונים</html>').error, 'BOOK_not_found');
});

t('אין הרצת קוד מהקובץ', () => {
  // הפענוח טקסטואלי בלבד — קלט חיצוני לא מורץ
  const src = extractBookSource.toString();
  ok(!/\beval\b|new Function/.test(src), 'המפענח מריץ קוד מקובץ שהמשתמש העלה');
});

/* ═══ המרה לקטעים ═══ */

t('כל תא הופך לקטע נפרד — זה מה שמונע ערבוב בין עמודות', () => {
  const chunks = bookToChunks(BOOK);
  const cells = chunks.filter((c) => c.kind === 'table_cell');
  eq(cells.length, 3, 'מספר התאים שגוי');
  // שני התאים בשורה 2 הם שתי מחלות שונות — חייבים להיות נפרדים
  ok(cells[0].text.includes('חסרי חיסון'));
  ok(cells[1].text.includes('בניגוד ליילודים'));
  ok(!cells[0].text.includes('בניגוד ליילודים'), 'שני תאים נתפרו יחד');
});

t('כותרת עמודה מוצמדת לתאים שמתחתיה', () => {
  const cells = bookToChunks(BOOK).filter((c) => c.kind === 'table_cell');
  eq(cells[0].section, 'חום במדוכאי חיסון', 'הכותרת לא הוצמדה');
  eq(cells[1].section, 'חום בילד 2-24 חודשים');
});

t('כותרת מתחלפת באותה עמודה', () => {
  const cells = bookToChunks(BOOK).filter((c) => c.kind === 'table_cell');
  const neutropenia = cells.find((c) => c.text.includes('38.3'));
  eq(neutropenia.section, 'חום ונויטרופניה', 'הכותרת השנייה לא החליפה את הראשונה');
});

t('כותרת אינה נשמרת כידע בפני עצמה', () => {
  const texts = bookToChunks(BOOK).map((c) => c.text);
  ok(!texts.includes('חום ונויטרופניה'), 'כותרת נשמרה כקטע ידע');
});

t('פסקאות אינן נכנסות לחילוץ כברירת מחדל', () => {
  // בלוקי פסקאות במקור הם שאריות טקסט משובש — 80% מהנפח,
  // 0% מהערך. הספר מחריג אותם, והחילוץ חייב להסכים איתו.
  eq(bookToChunks(BOOK).filter((c) => c.kind === 'paragraph').length, 0);
});

t('פסקאות נכנסות רק בבקשה מפורשת, וקצרה מסוננת', () => {
  const paras = bookToChunks(BOOK, { includeParagraphs: true })
    .filter((c) => c.kind === 'paragraph');
  eq(paras.length, 1, 'פסקה קצרה מדי נשמרה');
});

t('כל קטע נושא שיוך מלא לחזרה למקור', () => {
  for (const c of bookToChunks(BOOK)) {
    ok(c.chapter && c.topic && c.page, `שיוך חסר: ${JSON.stringify(c).slice(0, 80)}`);
    ok(Number.isFinite(c.chapter_no));
  }
});

/* ═══ עוגנים ═══ */

t('topic_key יציב ונגזר מהתוכן', () => {
  const k = topicKeyFor('מחלות זיהומיות', 'מדוכאי חיסון');
  ok(k.startsWith('nelson.'), 'פורמט שגוי');
  eq(k, topicKeyFor('מחלות זיהומיות', 'מדוכאי חיסון'), 'לא דטרמיניסטי');
  ok(!/[^\p{L}\p{N}._]/u.test(k), `תווים לא חוקיים: ${k}`);
});

t('שמות שונים → מפתחות שונים', () => {
  ok(topicKeyFor('א', 'ב') !== topicKeyFor('א', 'ג'));
});

/* ═══ סיכום וייבוא פרק-אחר-פרק ═══ */

t('סיכום מונה נכון', () => {
  const s = summarizeBook(BOOK);
  eq(s.chapters, 2);
  eq(s.topics, 2);
  eq(s.tables, 1);
  eq(s.paragraphs, 2);
  eq(s.chapter_list[0].title, 'מחלות זיהומיות');
});

t('ייבוא פרק-אחר-פרק מסנן נכון', () => {
  eq(chunksForChapter(BOOK, 1).length, 3, 'תאי טבלה בלבד');
  eq(chunksForChapter(BOOK, 1, { includeParagraphs: true }).length, 4);
  eq(chunksForChapter(BOOK, 2).length, 0);
});

/* ═══ האינטגרציה שבגללה כל זה נבנה ═══ */

t('קטעים מהספר אינם מסומנים כתפורים', () => {
  // זו הנקודה כולה: התא הוא גבול הידע, ולכן אין ערבוב עמודות
  for (const c of bookToChunks(BOOK)) {
    eq(detectSeams(c.text).verdict, 'clean', `קטע סומן כתפור: ${c.text.slice(0, 50)}`);
  }
});

t('ספר ריק אינו מפיל', () => {
  eq(bookToChunks({}).length, 0);
  eq(bookToChunks(null).length, 0);
  eq(summarizeBook(null).chapters, 0);
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('המפענח תקין.');
