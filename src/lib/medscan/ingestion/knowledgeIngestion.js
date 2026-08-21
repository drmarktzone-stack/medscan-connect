/**
 * MedScan — Knowledge Ingestion
 *
 * מסלול הכניסה של תוכן קליני למערכת: טקסט → חילוץ מובנה → טיוטות.
 *
 * ## למה זה החלק המסוכן ביותר בכל המערכת
 * כל שאר השכבות מגינות על **הפלט**. הן מוודאות שהמודל לא ימציא מעבר
 * למה שב-KB. אבל אם ה-KB עצמו מכיל טעות — היא תעבור את כולן בשלום,
 * כי היא תיראה כמו ידע מאומת.
 *
 * לכן כאן ההגנה שונה באופיה:
 *   · כל פריט נושא ציטוט-מקור — בלעדיו הוא לא נשמר
 *   · כל פריט נכנס כטיוטה, תמיד, בלי יוצא מן הכלל
 *   · מינונים אינם מחולצים לכללים — רק מדווחים לעיון
 *   · פערים מוצהרים; רשימת פערים ריקה היא סימן אזהרה בפני עצמו
 *
 * ההגנה האמיתית היא הרופא/ה שמאשר/ת. התפקיד שלנו הוא להביא לו/ה
 * חומר שניתן לבדוק — עם ציטוט לכל טענה.
 */

import { createInvokeLLM, createKbRecord } from '../llmAdapter.js';

export {
  CHUNK_CHARS, detectSeams, chunkText, validateExtraction,
} from './extractionCore.js';

// ⚠ extractFromChunk חייב להיות כאן. הוא נשכח בריפוטור שהעביר אותו
// ל-extractionCore, ו-ingestChunk קרא לשם לא-מוגדר. זה בדיוק הכשל
// שהפיל 947 מתוך 1001 חילוצים בהרצה הקודמת — והוא אינו נתפס
// בבדיקת ייבוא: שם לא-מוגדר בתוך גוף פונקציה נכשל רק בזמן הקריאה.
import { detectSeams, validateExtraction, extractFromChunk } from './extractionCore.js';
import { NATURAL_KEY, WRITE_ORDER, LIST_BY_ENTITY, toKbRecords } from './kbRecords.js';

export { NATURAL_KEY };

/**
 * שומר חילוץ מאומת-מבנית ל-KB. הכל כטיוטה.
 *
 * ## למה יש כאן existingKeys
 * הגרסה הראשונה קראה ל-create בלי לבדוק קיום. הרצה חוזרת —
 * אחרי עצירה, אחרי שגיאה, או פשוט פעמיים — יצרה רשומות כפולות.
 * כפילות ב-KB אינה מטרד קוסמטי: היא מגיעה ל-FACT BLOCK פעמיים
 * ונקראת כשני מקורות עצמאיים שמסכימים זה עם זה.
 *
 * @param {object} kept
 * @param {Set<string>} [existingKeys] מפתחות קיימות ב-KB, בצורה "Entity:key"
 * @returns {Promise<{saved: object, skipped: object[], failed: object[]}>}
 */
export async function saveExtraction(kept, existingKeys = null) {
  const saved = { topics: 0, lab_patterns: 0, red_flags: 0, clinical_rules: 0, associations: 0 };
  const failed = [];
  const skipped = [];

  // ⚠ המיפוי מגיע מ-kbRecords.js ולא ממומש כאן. קודם הוא היה
  // משוכפל בין קובץ זה לסקריפט ה-Node, ושני העותקים נפרדו:
  // אחד המיר conditions[].value למחרוזת והשני לא. שכבת האחסון
  // מקבלת שם מחרוזת בלבד, ולכן המסלול הזה היה מפיל כל כלל
  // עם ערך מספרי — בלי שאיש ישים לב, כי הנתיב השני עבד.
  const records = toKbRecords(kept);
  const COUNTER = {
    KnowledgeTopic: 'topics',
    LabPattern: 'lab_patterns',
    RedFlag: 'red_flags',
    ClinicalRule: 'clinical_rules',
    Association: 'associations',
  };

  for (const entity of WRITE_ORDER) {
    const rows = records[entity] ?? [];
    const keyField = NATURAL_KEY[entity];
    for (const rec of rows) {
      const key = rec[keyField];
      if (existingKeys?.has(`${entity}:${key}`)) {
        skipped.push({ entity, key, why_he: 'רשומה עם מפתח זה כבר קיימת — לא נוצרה כפילות.' });
        continue;
      }
      try {
        await createKbRecord(entity, rec);
        existingKeys?.add(`${entity}:${key}`); // מונע כפילות גם בתוך אותה הרצה
        saved[COUNTER[entity]] += 1;
      } catch (e) {
        failed.push({ entity, key, error: String(e?.message ?? e) });
      }
    }
  }

  return { saved, skipped, failed };
}

/**
 * הזרימה המלאה לקטע אחד.
 *
 * קטע שזוהה כמשובש **אינו מחולץ כלל**. עדיף לאבד קטע
 * מאשר לייצר ממנו ידע שמערבב שתי מחלות — טעות כזו תעבור
 * את כל שכבות ההגנה, כי הציטוט שלה אמיתי.
 */
export async function ingestChunk({ text, chapterHint, invokeLLM, allowSuspect = false }) {
  const seams = detectSeams(text);
  if (seams.verdict === 'corrupt' || (seams.verdict === 'suspect' && !allowSuspect)) {
    return {
      ok: false,
      error: 'text_seams_detected',
      seams,
      message_he:
        `הקטע לא חולץ: זוהו סימני תפר בין עמודות ב-${Math.round(seams.score * 100)}% מהשורות. ` +
        'טקסט שמערבב שתי עמודות מייצר ידע שנראה תקין ומערבב עובדות ' +
        'משתי מחלות שונות — והוא יעבור את כל הבדיקות, כי הציטוט שלו אמיתי.',
    };
  }

  const { extraction, error } = await extractFromChunk({ text, chapterHint, invokeLLM });
  if (error || !extraction) return { ok: false, error, extraction: null, seams };

  const { kept, problems, dropped } = validateExtraction(extraction);
  if (seams.verdict === 'suspect') {
    problems.push({
      kind: 'extraction', key: '—', severity: 'warn',
      why_he: `זוהו סימני תפר ב-${Math.round(seams.score * 100)}% מהשורות. יש לבדוק כל פריט מול המקור.`,
    });
  }
  return {
    ok: true,
    extraction,
    kept,
    problems,
    dropped,
    seams,
    gaps_he: extraction.gaps_he ?? [],
    dosing_mentions_he: extraction.dosing_mentions_he ?? [],
  };
}

export { createInvokeLLM };
