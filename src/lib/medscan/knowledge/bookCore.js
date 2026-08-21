/**
 * MedScan — לוגיקת הספר, ללא צד-שרת
 *
 * מופרד מ-bookStore.js כדי שיהיה בדיק: אין כאן ייבוא של base44,
 * ולכן הכל רץ ב-node ישירות. bookStore מוסיף מעליו רק את ה-I/O.
 *
 * ## מה נכנס לספר ומה לא
 *
 * **נכנס:** הטבלאות **כפי שהן** — שורות ועמודות, כל תא במקומו.
 *
 * ⚠ הניסיון הראשון כאן שיטח את הטבלאות ל"סעיפים" לפי כותרת-עמודה,
 * תוך סינון תאים קצרים כתוויות. מדידה על הספר בפועל הראתה ש-31%
 * מהתאים נזרקו כך, וביניהם ספי-החלטה:
 *   «61-90 ימים: 71 מ"ג/ד"ל» · «29-90 ימים: 8 תאים/מ"מ»
 * כלומר בדיוק המספרים שבגללם פותחים את הספר. סינון הוא הימור על מה
 * חשוב; טבלה שנשמרת כמות שהיא אינה מהמרת.
 *
 * ההיוריסטיקה של כותרת/תוכן נשארת ב-bookToChunks, במקום שבו היא באמת
 * נדרשת — חילוץ יחידות ידע. שם ההשמטה גורמת לחוסר, לא לטעות. כאן,
 * במקור עצמו, אין סיבה להשמיט דבר.
 *
 * **לא נכנס:** בלוקי הפסקאות שבמקור. הם שאריות טקסט משובש מחילוץ
 * ה-PDF — רסיסי משפטים משתי עמודות שנתפרו זה לזה. הם קריאים למראית
 * עין, ולכן מסוכנים במיוחד: משפט אחד יכול לערבב עובדות משתי מחלות.
 *
 * ⚠ גלאי-התפר (detectSeams) לא סימן אותם: הוא מחפש תפר *בתוך* שורה,
 * וכאן החיבור עובר *בין* שורות. לכן ההחרגה כאן מבנית ולא מבוססת-גלאי:
 * בלוק k='p' לא נכנס, נקודה.
 */

import { clean, topicKeyFor } from '../ingestion/bookParser.js';

export { topicKeyFor };

export const BOOK_SOURCE_NOTE_HE =
  'ספרון סיכומי נלסון 21 בטבלאות. נכללות הטבלאות במלואן, כפי שהן. ' +
  'בלוקי הפסקאות שבמקור הושמטו בכוונה: הם טקסט משובש מחילוץ ה-PDF ' +
  '(רסיסי משפטים מעמודות שונות) ואינם מקור מהימן.';

/** שורה שכל תאיה ריקים אינה מוסיפה דבר ומקשה על הקריאה. */
const hasContent = (row) => (row ?? []).some((c) => clean(c).length > 0);

/**
 * הופך את מבנה BOOK הגולמי לרשומות פרק מוכנות לשמירה.
 *
 * הטבלאות נשמרות verbatim. הניקוי היחיד הוא רווחים ותווי-רוחב —
 * שינוי תצוגה, לא שינוי תוכן.
 */
export function buildChapterRecords(book) {
  const chapters = [];

  (book?.chapters ?? []).forEach((ch, ci) => {
    const topics = [];

    for (const tp of ch.topics ?? []) {
      const tables = [];

      for (const block of tp.b ?? []) {
        if (block.k !== 't') continue; // פסקאות — ראה הערת הקובץ

        const rows = (block.v ?? [])
          .filter(hasContent)
          .map((row) => (row ?? []).map(clean));

        if (rows.length) tables.push({ p: block.p ?? tp.pg ?? null, r: rows });
      }

      if (tables.length) {
        topics.push({
          t: tp.t,
          k: topicKeyFor(ch.t, tp.t),
          pg: tp.pg ?? null,
          tb: tables,
        });
      }
    }

    if (topics.length) {
      chapters.push({
        chapter_no: ci + 1,
        title_he: ch.t,
        topic_count: topics.length,
        cell_count: topics.reduce((n, t) => n + countCells(t), 0),
        topics,
        source_note_he: BOOK_SOURCE_NOTE_HE,
      });
    }
  });

  return chapters;
}

function countCells(topic) {
  let n = 0;
  for (const tbl of topic.tb ?? []) {
    for (const row of tbl.r ?? []) {
      for (const cell of row) if (cell) n += 1;
    }
  }
  return n;
}

/**
 * חיפוש חופשי בספר.
 *
 * מחזיר תאים, לא נושאים — היחידה שהרופא/ה צריך/ה לראות היא המשפט
 * עצמו במקומו. כל תוצאה נושאת את השורה המלאה שבה נמצא התא, כי בטבלה
 * המשמעות של תא נקבעת ע"י שכניו: «71 מ"ג/ד"ל» לבדו חסר פשר.
 */
export function searchBook(chapters, query, { limit = 80, minChars = 2 } = {}) {
  const q = clean(query).toLowerCase();
  if (q.length < minChars) return [];

  const hits = [];
  for (const ch of chapters ?? []) {
    for (const tp of ch.topics ?? []) {
      for (const tbl of tp.tb ?? []) {
        for (const row of tbl.r ?? []) {
          for (const cell of row) {
            if (!cell || !cell.toLowerCase().includes(q)) continue;
            hits.push({
              chapter_no: ch.chapter_no,
              chapter: ch.title_he,
              topic: tp.t,
              topic_key: tp.k,
              page: tbl.p,
              text: cell,
              row: row.filter(Boolean),
            });
            if (hits.length >= limit) return hits;
            break; // תא אחד לכל שורה — לא מציפים תוצאה אחת פעמיים
          }
        }
      }
    }
  }
  return hits;
}

/**
 * פותר source_anchor לנושא בספר.
 *
 * זה החיבור בין הפלט הקליני למקור: עוגן שאינו נפתר כאן הוא ציטוט
 * שאי-אפשר לבדוק — וכזה חסום ממילא ב-anchorGuard לפני שהגיע לכאן.
 */
export function resolveAnchor(chapters, anchor) {
  if (!anchor) return null;
  const key = String(anchor).trim();
  for (const ch of chapters ?? []) {
    for (const tp of ch.topics ?? []) {
      if (tp.k === key) return { chapter: ch, topic: tp };
    }
  }
  return null;
}

export function bookStats(chapters) {
  let topics = 0;
  let cells = 0;
  for (const ch of chapters ?? []) {
    topics += ch.topics?.length ?? 0;
    for (const tp of ch.topics ?? []) cells += countCells(tp);
  }
  return { chapters: chapters?.length ?? 0, topics, cells };
}
