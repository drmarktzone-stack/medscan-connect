/**
 * MedScan — אחסון הספר באפליקציה
 *
 * הספר נטען פעם אחת ונשמר בישות NelsonChapter. מרגע זה הוא חלק
 * מהאפליקציה: נגיש מהמאגר, ומשמש כיעד לכל source_anchor שהמערכת מצטטת.
 *
 * כאן רק ה-I/O. כל הלוגיקה — מה נכנס לספר, איך מחפשים בו, ואיך נפתר
 * עוגן — יושבת ב-bookCore.js ונבדקת שם.
 */

import { base44 } from "@/api/base44Client";
import { buildChapterRecords } from "@/lib/medscan/knowledge/bookCore";

export {
  buildChapterRecords,
  searchBook,
  resolveAnchor,
  bookStats,
  topicKeyFor,
  BOOK_SOURCE_NOTE_HE,
} from "@/lib/medscan/knowledge/bookCore";

/**
 * שומר את הספר באפליקציה.
 *
 * מעדכן פרק קיים לפי chapter_no במקום לשכפל אותו — טעינה חוזרת של
 * אותו קובץ אינה מייצרת ספר שני. זו הפעולה היחידה שהמשתמש צריך לבצע
 * כדי שהספר יהיה זמין לכל הכלים.
 */
export async function saveBookToApp(book, { onProgress } = {}) {
  const records = buildChapterRecords(book);
  const existing = await base44.entities.NelsonChapter.list("chapter_no", 200);
  const byNo = new Map(existing.map((r) => [r.chapter_no, r]));

  const summary = { created: 0, updated: 0, failed: 0, errors: [] };

  for (let i = 0; i < records.length; i += 1) {
    const rec = records[i];
    onProgress?.({ done: i, total: records.length, title: rec.title_he });
    try {
      const prev = byNo.get(rec.chapter_no);
      if (prev) {
        await base44.entities.NelsonChapter.update(prev.id, rec);
        summary.updated += 1;
      } else {
        await base44.entities.NelsonChapter.create(rec);
        summary.created += 1;
      }
    } catch (e) {
      summary.failed += 1;
      summary.errors.push({ chapter: rec.title_he, error: e?.message || String(e) });
    }
  }

  onProgress?.({ done: records.length, total: records.length, title: null });
  return summary;
}

export async function loadBook() {
  return base44.entities.NelsonChapter.list("chapter_no", 200);
}

/** האם הספר כבר באפליקציה. זול — לא מושך את התוכן כולו. */
export async function isBookLoaded() {
  try {
    const rows = await base44.entities.NelsonChapter.list("chapter_no", 1);
    return rows.length > 0;
  } catch {
    return false;
  }
}
