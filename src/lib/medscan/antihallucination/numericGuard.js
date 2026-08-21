/**
 * MedScan — Numeric Guard
 * חלק ממנגנון 1 (Grounding) ומנגנון 7 (Multi-Check), ואכיפה של כלל-הברזל
 * "הפרדה דטרמיניסטי / LLM".
 *
 * הרציונל: ההזיה המסוכנת ביותר ברפואת ילדים אינה נרטיב שגוי — היא **מספר** שגוי.
 * מינון, סף, קצב נוזלים, גיל-חתך. נרטיב שגוי רופא/ה מזהה; מינון שגוי נראה סביר.
 *
 * לכן: כל אסימון מספרי בטקסט המיועד-למשתמש חייב להופיע ב-FACT BLOCK
 * (עובדה מאומתת, ערך דטרמיניסטי, או מדידת מטופל). מספר שאין לו מקור — נחסם.
 *
 * זהו בדיקה דטרמיניסטית לחלוטין. היא אינה תלויה בשיתוף-פעולה של המודל.
 */

import { extractNumbers, formatNumber } from './factBlock.js';

/**
 * מספרים שמותר להשתמש בהם בפרוזה רגילה: ספירה, סדר, ביטויים שגורים.
 * שמור בכוונה מצומצם. כל הרחבה כאן היא הרחבה של משטח-ההזיה.
 *
 * ⚠ היתר זה **אינו חל בהקשר קריטי** (מינון, קצב, סף).
 * הגרסה הראשונה בדקה את הרשימה לפני סיווג ההקשר, ולכן
 * «2 מ"ג/ק"ג» עבר תמיד בלי שום מקור. זה היה חור אמיתי: ספרה
 * בודדת היא בדיוק המינון הכי סביר — ולכן הכי מסוכן להמציא.
 */
const UNIVERSALLY_ALLOWED = new Set(['0', '1', '2', '3', '100']);

/**
 * הקשרים שהופכים מספר לא-מסומן ל**חסימה** ולא לאזהרה.
 * אלה המספרים שאם יומצאו — מישהו עלול להיפגע.
 */
const CRITICAL_NUMERIC_CONTEXT = [
  // מינון ומשקל
  /מ["׳']?ג\s*\/\s*ק["׳']?ג/, /mg\s*\/\s*kg/i, /מיליגרם\s*לק"?ג/,
  /מק["׳']?ג\s*\/\s*ק["׳']?ג/, /mcg\s*\/\s*kg/i, /µg\s*\/\s*kg/i,
  /יחב["׳']?\s*\/\s*ק["׳']?ג/, /units?\s*\/\s*kg/i,
  // נוזלים וקצב
  /מ["׳']?ל\s*\/\s*ק["׳']?ג/, /ml\s*\/\s*kg/i, /cc\s*\/\s*kg/i,
  /מ["׳']?ל\s*\/\s*שעה/, /ml\s*\/\s*h(r|our)?/i,
  // תדירות מתן
  /כל\s+\d+\s*שעות/, /פעמים\s+ביום/, /q\s*\d+\s*h/i,
  // ספים
  /סף/, /threshold/i, /cut[- ]?off/i,
  // יחידות מינון גולמיות
  /\d+\s*(מ["׳']?ג|mg|mcg|מק["׳']?ג|גרם|g\b|יח["׳']?ב|units?)\b/i,
];

/** ביטויים שמעידים על מספר קליני מהותי (סף/גיל-חתך) — אזהרה מוחמרת. */
const SEMI_CRITICAL_CONTEXT = [
  /≥|≤|>|</,
  /אחוז|%|percentile|אחוזון/,
  /ימים|שבועות|חודשים|שנים/,
  /מעל|מתחת|לפחות|לכל היותר/,
];

/** חלון טקסט סביב המספר, לקביעת ההקשר. */
function contextAround(text, matchIndex, matchLength, radius = 32) {
  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(text.length, matchIndex + matchLength + radius);
  return text.slice(start, end);
}

function classifySeverity(context) {
  if (CRITICAL_NUMERIC_CONTEXT.some((re) => re.test(context))) return 'block';
  if (SEMI_CRITICAL_CONTEXT.some((re) => re.test(context))) return 'warn_high';
  return 'warn';
}

/**
 * אוסף רקורסיבית את כל המחרוזות המיועדות-למשתמש מהפלט.
 * מדלג על שדות טכניים (מזהים, מפתחות, enum) שאינם נקראים ע"י הרופא/ה.
 */
const NON_PROSE_KEYS = new Set([
  'claim_id', 'direction_id', 'contradiction_id', 'step_id', 'next_step_id',
  'pattern_key', 'flag_key', 'protocol_key', 'rule_key', 'assoc_key', 'topic_key',
  'source_anchor', 'source_anchors', 'fact_refs', 'deterministic_refs', 'involved_refs',
  'based_on_patterns', 'claim_type', 'kind', 'stage', 'level', 'severity',
  'evidence_strength', 'verdict', 'overall', 'origin', 'step', 'rank',
]);

export function collectProseStrings(node, path = '', out = []) {
  if (node == null) return out;
  if (typeof node === 'string') {
    out.push({ path, text: node });
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectProseStrings(v, `${path}[${i}]`, out));
    return out;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (NON_PROSE_KEYS.has(k)) continue;
      collectProseStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

/**
 * הבדיקה עצמה.
 *
 * @param {object} output      פלט ה-LLM המפוענח
 * @param {object} factBlock   התוצר של buildFactBlock()
 * @param {object} [opts]
 * @param {Set<string>} [opts.extraAllowed] מספרים נוספים מותרים (למשל מהקלט הגולמי)
 * @returns {{ok: boolean, violations: object[], blocked: object[], checkedCount: number}}
 */
export function numericGuard(output, factBlock, opts = {}) {
  // שתי רמות היתר, וההפרדה ביניהן היא עיקר הבדיקה:
  //   sourced  — מה שבאמת מופיע ב-FACT BLOCK. היחיד שקביל בהקשר קריטי.
  //   lenient  — sourced + מספרי ספירה שגורים, לפרוזה בלבד.
  const sourced = new Set(factBlock?.allowedNumbers ?? []);
  for (const n of opts.extraAllowed ?? []) sourced.add(formatNumber(Number(n)));
  const lenient = new Set([...sourced, ...UNIVERSALLY_ALLOWED]);

  const violations = [];
  let checkedCount = 0;

  for (const { path, text } of collectProseStrings(output)) {
    const re = /\d[\d,]*(?:\.\d+)?/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const canonical = formatNumber(Number(m[0].replace(/,/g, '')));
      checkedCount += 1;

      // ההקשר נקבע לפני ההיתר — במכוון. בהקשר של מינון
      // או קצב, גם «2» חייב מקור.
      const context = contextAround(text, m.index, m[0].length);
      const severity = classifySeverity(context);
      const permitted = severity === 'block' ? sourced : lenient;
      if (permitted.has(canonical)) continue;

      violations.push({
        code: 'unsourced_number',
        number: canonical,
        raw: m[0],
        path,
        context: context.trim(),
        severity,
        message_he:
          `המספר ${m[0]} מופיע בפלט אך אינו מופיע ב-FACT BLOCK ` +
          `(לא עובדה מאומתת, לא ערך מחושב, ולא מדידת מטופל).`,
      });
    }
  }

  const blocked = violations.filter((v) => v.severity === 'block');
  return { ok: blocked.length === 0, violations, blocked, checkedCount };
}

/**
 * מנטרל מספרים לא-מקורים מטקסט, במקום למחוק את הטענה כולה.
 * משמש כשהחומרה היא warn ולא block — עדיף להציג את הטענה בלי המספר
 * מאשר להסתיר מידע קליני שימושי, ובלבד שהמספר לא יוצג כעובדה.
 */
export function redactUnsourcedNumbers(text, factBlock, opts = {}) {
  const sourced = new Set(factBlock?.allowedNumbers ?? []);
  for (const n of opts.extraAllowed ?? []) sourced.add(formatNumber(Number(n)));
  const lenient = new Set([...sourced, ...UNIVERSALLY_ALLOWED]);

  const src = String(text);
  return src.replace(/\d[\d,]*(?:\.\d+)?/g, (raw, offset) => {
    const canonical = formatNumber(Number(raw.replace(/,/g, '')));
    // אותה הפרדה כמו ב-numericGuard: בהקשר קריטי אין היתר גורף.
    // בלעדיה, «2 מ"ג/ק"ג» היה שורד מהניטור ונשאר בטקסט.
    const context = contextAround(src, offset, raw.length);
    const permitted = classifySeverity(context) === 'block' ? sourced : lenient;
    return permitted.has(canonical) ? raw : '[מספר הוסר — ללא מקור מאומת]';
  });
}

/** עזר לבדיקות: אילו מספרים ב-KB/קלט הוכרו כמותרים. */
export function debugAllowedNumbers(factBlock) {
  return [...(factBlock?.allowedNumbers ?? [])].sort(
    (a, b) => Number(a) - Number(b)
  );
}

export { extractNumbers };
