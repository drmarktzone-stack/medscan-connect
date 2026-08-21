/**
 * MedScan — טעינת חילוץ מאומת ל-KB
 *
 * הצינור שדרכו נכנס ידע קליני שכבר חולץ ואומת מבנית — להבדיל
 * ממסלול ה-LLM ב-`knowledgeIngestion.js`, שמחלץ מטקסט גולמי.
 *
 * ## שלושה עקרונות שהצינור הזה בנוי סביבם
 *
 * **1. תכנון לפני כתיבה.** `planIngestion` הוא פונקציה טהורה: הוא
 * מחשב בדיוק מה ייכתב, מה יידלג ומה יידחה — בלי לגעת ברשת. מכאן
 * ש-dry-run אינו מצב מיוחד אלא פשוט אי-הפעלה של השלב השני, ושהתכנון
 * ניתן לבדיקה בלי מסד נתונים.
 *
 * **2. אין תיקון, יש דחייה.** הצינור אינו משלים שדה חסר, אינו מנחש
 * עוגן ואינו מנרמל טקסט קליני. פריט שאינו עומד בחוזה נדחה ומדווח.
 * השלמה שקטה היא בדיוק האופן שבו טעות נכנסת ל-KB ואז נראית כמו
 * ידע מאומת.
 *
 * **3. מה שנכתב נקרא בחזרה.** כתיבה שהחזירה 200 אינה הוכחה שהתוכן
 * נשמר כפי שנשלח. אחרי כל אצווה הרשומות נקראות מחדש והשדות
 * המהותיים מושווים. אי-התאמה מדווחת כשגיאה, לא כהצלחה.
 */

import { validateExtraction } from './extractionCore.js';
import {
  NATURAL_KEY, WRITE_ORDER, LIST_BY_ENTITY, VERIFY_FIELDS,
  toKbRecords,
} from './kbRecords.js';

/** ישויות שהעוגן שלהן חייב להצביע על נושא קיים. */
const ANCHORED_ENTITIES = ['LabPattern', 'RedFlag', 'ClinicalRule', 'Association'];

/**
 * מתכנן טעינה. פונקציה טהורה — אין כאן קריאת רשת.
 *
 * @param {object}   params
 * @param {object}   params.extraction    קובץ החילוץ הגולמי
 * @param {Set<string>} [params.existingKeys]  מפתחות קיימים, בצורה "Entity:key"
 * @param {Set<string>} [params.existingTopicKeys] topic_key קיימים ב-KB
 * @returns {object} תכנית מלאה
 */
export function planIngestion({ extraction, existingKeys = new Set(), existingTopicKeys = new Set() }) {
  // ⚠ העוגנים נבדקים במקום אחד — בתוך הוולידטור, שמקבל את
  // הנושאים שכבר ב-KB. בדיקה כפולה היתה מתפצלת מוקדם או מאוחר,
  // ואז שתי תשובות שונות לאותה שאלה נראות שתיהן נכונות.
  const { kept, problems, dropped } = validateExtraction(extraction, {
    knownTopicKeys: existingTopicKeys,
  });
  const records = toKbRecords(kept);

  // ── עוגנים תלויים ────────────────────────────────────────────────────
  // עוגן שמצביע על נושא שאינו קיים — לא בחילוץ הזה ולא ב-KB — הוא
  // ציטוט לשום מקום. הוא ייראה תקין בכל בדיקה עתידית, כי השדה מלא.
  // זו בדיוק הצורה שבה מקור מזויף שורד.
  const danglingAnchors = (problems ?? [])
    .filter((p) => p.code === 'dangling_anchor')
    .map((p) => ({ entity: p.kind, key: p.key, anchor: p.anchor, why_he: p.why_he }));

  // ── כפילויות ─────────────────────────────────────────────────────────
  // כפילות ב-KB אינה מטרד קוסמטי: היא מגיעה ל-FACT BLOCK פעמיים
  // ונקראת כשני מקורות עצמאיים שמסכימים זה עם זה.
  const toCreate = {};
  const duplicates = [];
  const withinBatch = new Set();

  for (const entity of WRITE_ORDER) {
    const keyField = NATURAL_KEY[entity];
    const list = [];
    for (const rec of records[entity] ?? []) {
      const key = rec[keyField];
      const composite = `${entity}:${key}`;

      if (existingKeys.has(composite)) {
        duplicates.push({ entity, key, where: 'kb', why_he: 'מפתח זה כבר קיים ב-KB.' });
        continue;
      }
      if (withinBatch.has(composite)) {
        duplicates.push({ entity, key, where: 'batch', why_he: 'המפתח מופיע פעמיים באותו קובץ חילוץ.' });
        continue;
      }
      withinBatch.add(composite);
      list.push(rec);
    }
    if (list.length) toCreate[entity] = list;
  }

  const createCount = Object.values(toCreate).reduce((n, l) => n + l.length, 0);

  // ── חסמים ────────────────────────────────────────────────────────────
  // עוגן תלוי חוסם את האצווה כולה ולא רק את הפריט: אם עוגן אחד
  // שגוי, סביר שהטקסונומיה של הקובץ אינה תואמת ל-KB, ולכתוב
  // חלק מהאצווה יותיר מצב חצי-עקבי שקשה לאתר בדיעבד.
  const blockers = [];
  if (danglingAnchors.length) {
    blockers.push({
      code: 'dangling_anchors',
      count: danglingAnchors.length,
      message_he:
        `${danglingAnchors.length} פריטים מפנים לעוגן שאינו קיים. ` +
        'עוגן ריק נראה תקין בכל בדיקה עתידית — לכן האצווה נעצרת.',
    });
  }

  return {
    kept,
    records,
    toCreate,
    createCount,
    duplicates,
    danglingAnchors,
    blockers,
    problems: problems ?? [],
    droppedCount: dropped ?? 0,
    gaps_he: extraction?.gaps_he ?? [],
    dosing_mentions_he: extraction?.dosing_mentions_he ?? [],
    provenance_he: extraction?._provenance_he ?? null,
    warnings: buildWarnings(extraction, kept),
    ok: blockers.length === 0,
  };
}

/**
 * אזהרות שאינן חוסמות — אבל שרופא/ה צריך/ה לראות לפני החתימה.
 */
function buildWarnings(extraction, kept) {
  const w = [];

  // רשימת פערים ריקה בקטע ארוך היא סימן אזהרה בפני עצמו: כמעט תמיד
  // היא אומרת שמשהו הושלם במקום שדווח עליו כחסר.
  if (!extraction?.gaps_he?.length) {
    w.push({
      code: 'no_gaps_declared',
      message_he:
        'לא הוצהר אף פער. בחילוץ מקטע ארוך זה כמעט תמיד אומר שמשהו הושלם ' +
        'במקום לדווח עליו כחסר.',
    });
  }

  if (!extraction?._provenance_he) {
    w.push({
      code: 'no_provenance',
      message_he: 'לקובץ אין שדה מקור (_provenance_he) — לא ניתן לדעת ממה הוא נגזר.',
    });
  }

  const topics = kept?.topics ?? [];
  const missingPages = topics.filter((t) => !t.page_start).map((t) => t.topic_key);
  if (missingPages.length) {
    w.push({
      code: 'topics_without_pages',
      count: missingPages.length,
      message_he:
        `${missingPages.length} נושאים ללא מספר עמוד. נושא בלי עמוד אינו בר-אימות ` +
        'מול המקור, ולכן לא ניתן יהיה לחתום עליו כ-verified.',
      keys: missingPages,
    });
  }

  return w;
}

/**
 * מבצע את התכנית.
 *
 * @param {object}   params
 * @param {object}   params.plan       פלט `planIngestion`
 * @param {object}   params.deps       { createRecord, listRecords }
 * @param {boolean}  [params.dryRun]   true = לא נכתב דבר
 * @param {function} [params.onProgress]
 * @param {boolean}  [params.verify]   קריאה-חוזרת אחרי הכתיבה
 */
export async function applyPlan({ plan, deps, dryRun = false, onProgress = null, verify = true }) {
  if (!plan.ok) {
    return {
      ran: false,
      dryRun,
      reason_he: 'התכנית חסומה — ראה blockers. לא בוצעה כתיבה.',
      blockers: plan.blockers,
      created: {}, createdCount: 0, failed: [], mismatches: [],
    };
  }

  const created = {};
  const failed = [];
  let createdCount = 0;
  const createdKeysByEntity = {};

  if (!dryRun) {
    for (const entity of WRITE_ORDER) {
      const rows = plan.toCreate[entity] ?? [];
      if (!rows.length) continue;
      const keyField = NATURAL_KEY[entity];
      created[entity] = 0;
      createdKeysByEntity[entity] = [];

      for (const rec of rows) {
        try {
          await deps.createRecord(entity, rec);
          created[entity] += 1;
          createdCount += 1;
          createdKeysByEntity[entity].push(rec[keyField]);
        } catch (e) {
          failed.push({ entity, key: rec[keyField], error: String(e?.message ?? e) });
        }
        onProgress?.({ entity, done: created[entity], total: rows.length, createdCount });
      }
    }
  }

  // ── קריאה-חוזרת ──────────────────────────────────────────────────────
  // כתיבה שהחזירה הצלחה אינה הוכחה שהתוכן נשמר כפי שנשלח.
  const mismatches = [];
  if (!dryRun && verify && createdCount > 0) {
    for (const entity of Object.keys(createdKeysByEntity)) {
      const keyField = NATURAL_KEY[entity];
      const wanted = new Map(
        (plan.toCreate[entity] ?? []).map((r) => [r[keyField], r])
      );
      let live = [];
      try {
        live = await deps.listRecords(entity);
      } catch (e) {
        mismatches.push({ entity, key: '—', field: '—', why_he: `קריאה חוזרת נכשלה: ${String(e?.message ?? e)}` });
        continue;
      }
      const liveByKey = new Map((live ?? []).map((r) => [r[keyField], r]));

      for (const key of createdKeysByEntity[entity]) {
        const sent = wanted.get(key);
        const got = liveByKey.get(key);
        if (!got) {
          mismatches.push({ entity, key, field: '—', why_he: 'הרשומה נכתבה אך לא נמצאה בקריאה חוזרת.' });
          continue;
        }
        for (const field of VERIFY_FIELDS[entity] ?? []) {
          const a = sent?.[field] ?? null;
          const b = got?.[field] ?? null;
          if (String(a) !== String(b)) {
            mismatches.push({
              entity, key, field,
              why_he: `נשלח ${JSON.stringify(a)} ונשמר ${JSON.stringify(b)}.`,
            });
          }
        }
      }
    }
  }

  return {
    ran: !dryRun,
    dryRun,
    created,
    createdCount,
    failed,
    mismatches,
    skipped: plan.duplicates,
    verified: !dryRun && verify,
    ok: failed.length === 0 && mismatches.length === 0,
  };
}

/** סיכום קריא בעברית — לשימוש ב-UI וב-CLI כאחד. */
export function summarize(plan, result = null) {
  const lines = [];
  lines.push(`נשמרים לאחר אימות: ${plan.createCount}`);
  if (plan.droppedCount) lines.push(`נדחו באימות: ${plan.droppedCount}`);
  if (plan.duplicates.length) lines.push(`דילוג על כפילויות: ${plan.duplicates.length}`);
  if (plan.danglingAnchors.length) lines.push(`⚠ עוגנים תלויים: ${plan.danglingAnchors.length}`);
  for (const w of plan.warnings) lines.push(`⚠ ${w.message_he}`);
  if (result) {
    if (result.dryRun) lines.push('הרצה יבשה — לא נכתב דבר.');
    else {
      lines.push(`נכתבו: ${result.createdCount}`);
      if (result.failed.length) lines.push(`⚠ כשלי כתיבה: ${result.failed.length}`);
      if (result.mismatches.length) lines.push(`⚠ אי-התאמה בקריאה חוזרת: ${result.mismatches.length}`);
      if (result.ok) lines.push('כל הרשומות אומתו בקריאה חוזרת.');
    }
  }
  return lines;
}

export { NATURAL_KEY, WRITE_ORDER, LIST_BY_ENTITY };
