/**
 * MedScan — Self-Consistency Sampling
 *
 * העיקרון: **הזיה אינה יציבה.** טענה שנשענת על ראיה אמיתית תחזור על
 * עצמה כשמריצים את אותה שאלה שוב; טענה שנולדה מהשלמה סטטיסטית תיעלם
 * או תשתנה. זהו אחד האותות החזקים שקיימים, והוא אינו דורש שהמודל
 * ידווח על עצמו בכנות.
 *
 * המימוש: מריצים את הקריאה k פעמים, ומודדים עבור כל כיוון אבחוני
 * בכמה מהריצות הוא הופיע.
 *
 *   הופיע בכל הריצות   → יציב. הביטחון נשאר.
 *   הופיע ברוב         → יציב חלקית. תקרת ביטחון יורדת.
 *   הופיע פעם אחת      → לא יציב. מוסר, ומוצהר שהוסר.
 *
 * עלות: k קריאות במקום אחת. לכן זה **opt-in** ומיועד למסלולים
 * בעלי-סיכון: חשד אדום, מטופל מורכב, או בקשה מפורשת של הרופא/ה.
 *
 * חריג מכוון: כיוונים שנשענים על דגל אדום בטיחותי אינם מוסרים גם אם
 * הופיעו פעם אחת. בבטיחות, אות בודד עדיף על החמצה.
 */

import { normalizeText } from '../rules/rulesEngine.js';

export const CONSISTENCY_THRESHOLDS = {
  /** מתחת לזה — הכיוון מוסר לגמרי */
  drop_below: 0.34,
  /** מתחת לזה (ומעל drop_below) — תקרת הביטחון יורדת לצהוב */
  downgrade_below: 0.67,
};

/**
 * מפתח השוואה לכיוון. מנרמל כדי ששינויי-ניסוח קלים לא ייחשבו
 * לכיוונים שונים — אחרת כל ריצה תיראה "לא עקבית" בגלל מילה אחת.
 */
export function directionKey(direction) {
  const text = normalizeText(direction?.diagnosis_direction_he ?? '');
  const anchors = [...(direction?.source_anchors ?? [])].sort().join('|');
  // העוגן מבחין בין שני כיוונים שנשמעים דומה אך נשענים על ידע שונה
  return anchors ? `${text}::${anchors}` : text;
}

/**
 * מריץ k דגימות ומודד יציבות.
 *
 * @param {object} params
 * @param {function} params.runOnce  () => Promise<object>  — קריאה בודדת מלאה
 * @param {number} [params.samples]  ברירת מחדל 3
 * @returns {Promise<{primary: object|null, agreement: Map, samplesRun: number, failures: number}>}
 */
export async function sampleForConsistency({ runOnce, samples = 3 }) {
  const results = [];
  let failures = 0;

  for (let i = 0; i < samples; i += 1) {
    try {
      const r = await runOnce(i);
      if (r && typeof r === 'object') results.push(r);
      else failures += 1;
    } catch {
      failures += 1;
    }
  }

  if (!results.length) {
    return { primary: null, agreement: new Map(), samplesRun: 0, failures };
  }

  // ספירת הופעות לכל כיוון
  const agreement = new Map();
  for (const result of results) {
    const dirs = [...(result.directions ?? []), ...(result.differential ?? [])];
    const seenInThisRun = new Set();
    for (const d of dirs) {
      const key = directionKey(d);
      if (!key || seenInThisRun.has(key)) continue;
      seenInThisRun.add(key);

      const entry = agreement.get(key) ?? { count: 0, examples: [], levels: [] };
      entry.count += 1;
      entry.examples.push(d.diagnosis_direction_he);
      entry.levels.push(d?.confidence?.level ?? 'yellow');
      agreement.set(key, entry);
    }
  }

  // הריצה הראשית: זו שמכילה הכי הרבה כיוונים יציבים
  const score = (result) => {
    const dirs = [...(result.directions ?? []), ...(result.differential ?? [])];
    return dirs.reduce((acc, d) => acc + (agreement.get(directionKey(d))?.count ?? 0), 0);
  };
  const primary = results.reduce((best, r) => (score(r) > score(best) ? r : best), results[0]);

  return { primary, agreement, samplesRun: results.length, failures };
}

/**
 * מחיל את מדד היציבות על הפלט.
 *
 * @returns {{output: object, dropped: object[], downgraded: object[], notes_he: string[]}}
 */
export function applyConsistency({ output, agreement, samplesRun, redFlags = [] }) {
  if (!samplesRun || samplesRun < 2) {
    return { output, dropped: [], downgraded: [], notes_he: [] };
  }

  const clone = structuredClone(output);
  const dropped = [];
  const downgraded = [];
  const hasRedFlag = (redFlags?.length ?? 0) > 0;

  const process = (list, listName) => {
    if (!Array.isArray(list)) return list;
    return list.filter((d) => {
      const key = directionKey(d);
      const entry = agreement.get(key);
      const ratio = entry ? entry.count / samplesRun : 0;

      d.consistency = {
        appeared_in: entry?.count ?? 0,
        of_samples: samplesRun,
        ratio: Number(ratio.toFixed(2)),
      };

      // בטיחות גוברת על יציבות: כיוון שקשור לדגל אדום לא מוסר
      const safetyProtected = hasRedFlag && d?.confidence?.level === 'red';

      if (ratio < CONSISTENCY_THRESHOLDS.drop_below && !safetyProtected) {
        dropped.push({
          list: listName,
          direction_id: d.direction_id,
          text_he: d.diagnosis_direction_he,
          ratio: d.consistency.ratio,
          reason_he:
            `הכיוון הופיע ב-${entry?.count ?? 0} מתוך ${samplesRun} ריצות בלבד. ` +
            'כיוון שאינו חוזר על עצמו בהרצות חוזרות מתנהג כמו השלמה סטטיסטית, לא כמו ראיה.',
        });
        return false;
      }

      if (ratio < CONSISTENCY_THRESHOLDS.downgrade_below) {
        const before = d.confidence?.level;
        if (before === 'red' && !safetyProtected) {
          d.confidence = {
            ...(d.confidence ?? {}),
            level: 'yellow',
            consistency_downgraded: true,
            confidence_reason_he:
              `${d.confidence?.confidence_reason_he ?? ''} ` +
              `הביטחון הורד מ-"אדום" ל-"צהוב" מכיוון שהכיוון הופיע רק ב-${entry?.count} ` +
              `מתוך ${samplesRun} הרצות עצמאיות.`.trim(),
          };
          downgraded.push({
            direction_id: d.direction_id, text_he: d.diagnosis_direction_he,
            from: before, to: 'yellow', ratio: d.consistency.ratio,
          });
        }
      }

      if (safetyProtected && ratio < CONSISTENCY_THRESHOLDS.downgrade_below) {
        d.consistency.safety_protected = true;
        d.consistency.note_he =
          'הכיוון אינו יציב בין הרצות, אך הוא קשור לדגל אדום בטיחותי ולכן לא הוסר. ' +
          'יש להתייחס אליו בזהירות מוגברת.';
      }

      return true;
    });
  };

  clone.directions = process(clone.directions, 'directions');
  clone.differential = process(clone.differential, 'differential');

  const notes_he = [];
  if (dropped.length) {
    notes_he.push(
      `${dropped.length} כיוונים הוסרו מכיוון שלא חזרו על עצמם ב-${samplesRun} הרצות עצמאיות.`
    );
    clone.unknowns_he = [
      ...(clone.unknowns_he ?? []),
      ...dropped.map((d) => `כיוון שנשקל והוסר בשל חוסר יציבות: ${d.text_he} (${d.ratio}).`),
    ];
  }
  if (downgraded.length) {
    notes_he.push(`${downgraded.length} כיוונים הוחלשו בשל יציבות חלקית.`);
  }

  return { output: clone, dropped, downgraded, notes_he };
}

/** האם כדאי להפעיל דגימה — מדיניות ברירת מחדל. */
export function shouldSample({ redFlags = [], grounding = {}, requested = false }) {
  if (requested) return true;
  if (redFlags.length) return true;
  const hasRedKb = [
    ...(grounding.matchedPatterns ?? []),
    ...(grounding.firedRules ?? []),
    ...(grounding.associations ?? []),
  ].some((i) => i.suspicion === 'red');
  return hasRedKb;
}
