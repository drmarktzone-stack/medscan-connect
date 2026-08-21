/**
 * MedScan — Contradiction Detection
 * מנגנון 4
 *
 * העיקרון: סתירה היא **מידע קליני**, לא תקלה. הכלי אסור לו להחליק סתירה
 * כדי להישמע קוהרנטי. מודלי שפה נוטים ליישר סתירות לנרטיב חלק — וזו בדיוק
 * הנקודה שבה נולדת הזיה משכנעת.
 *
 * ארבעה סוגים נבדקים כאן דטרמיניסטית:
 *   1. finding_vs_finding  — הפלט מתאר ממצא בניגוד למדידה בפועל
 *   2. finding_vs_source   — הכיוון סותר את מה שה-KB אומר
 *   3. source_vs_source    — שני פריטי ידע חלוקים על אותו עוגן
 *   4. direction_vs_direction — שני כיוונים שאינם יכולים להתקיים יחד
 *
 * ובנוסף — סתירת-בטיחות: Red Flag קיים אך רמת החשד הכללית אינה אדומה.
 */

import { collectProseStrings } from './numericGuard.js';

/**
 * מילות-כיוון בעברית ובאנגלית, ממופות לכיוון קנוני.
 *
 * ⚠ שים לב לגבולות: `\b` ב-JavaScript מוגדר על תווי ASCII בלבד
 * ([A-Za-z0-9_]). אותיות עבריות אינן word-characters, ולכן `\bנמוך\b`
 * **לעולם אינו נורה** על טקסט עברי. זהו מקור שקט לכשל בטיחותי —
 * הבדיקה נראית קיימת אך אינה פועלת.
 * לכן אנו משתמשים בגבול מודע-יוניקוד: (?<!\p{L}) … (?!\p{L}) עם דגל u.
 */
const B_OPEN = '(?<!\\p{L})';
const B_CLOSE = '(?!\\p{L})';
const hebWord = (alternatives) => new RegExp(`${B_OPEN}(?:${alternatives})${B_CLOSE}`, 'u');

const DIRECTION_WORDS = [
  { re: hebWord('גבוה|גבוהה|מוגבר|מוגברת|מוגברים|עלייה|מוגבה|מוגבהת|elevated|high|increased'), dir: 'high' },
  { re: hebWord('נמוך|נמוכה|מופחת|מופחתת|ירידה|low|decreased|reduced'), dir: 'low' },
  { re: hebWord('תקין|תקינה|תקינים|normal|unremarkable'), dir: 'normal' },
];

const OPPOSITE = { high: 'low', low: 'high' };

/** חלון החיפוש סביב שם המדד, בתווים. */
const ANALYTE_WINDOW = 40;

/**
 * מגביל את חלון החיפוש לפסוקית הנוכחית.
 *
 * ⚠ בלי זה, המשפט "אלבומין נמוך, כולסטרול גבוה" מייצר סתירת
 * שווא: החלון סביב "אלבומין" בולע גם את "גבוה" ששייך לכולסטרול.
 * משפט שמונה כמה מדדים ברצף הוא הנורמה בכתיבה קלינית, לא החריג.
 */
const CLAUSE_BOUNDARY = /[,.;:!?،؛|\n•·–—]/;

function clauseAround(text, idx, len) {
  let start = Math.max(0, idx - ANALYTE_WINDOW);
  let end = Math.min(text.length, idx + len + ANALYTE_WINDOW);

  // אחורה עד גבול פסוקית
  for (let i = idx - 1; i >= start; i -= 1) {
    if (CLAUSE_BOUNDARY.test(text[i])) { start = i + 1; break; }
  }
  // קדימה עד גבול פסוקית
  for (let i = idx + len; i < end; i += 1) {
    if (CLAUSE_BOUNDARY.test(text[i])) { end = i; break; }
  }

  return { window: text.slice(start, end), offset: start };
}

/**
 * בוחר את מילת-הכיוון **הקרובה ביותר** לשם המדד, ולא את הראשונה
 * לפי סדר הרשימה. בלי זה, "גבוה" תמיד ינצח על "נמוך" רק מפני
 * שהוא ראשון במערך.
 */
function nearestDirection(window, analyteIdxInWindow, analyteLen) {
  let best = null;
  let bestDist = Infinity;

  for (const d of DIRECTION_WORDS) {
    const re = new RegExp(d.re.source, 'gu');
    let m;
    while ((m = re.exec(window)) !== null) {
      const dist = m.index >= analyteIdxInWindow + analyteLen
        ? m.index - (analyteIdxInWindow + analyteLen)
        : analyteIdxInWindow - (m.index + m[0].length);
      if (dist < bestDist) { bestDist = dist; best = d; }
      if (re.lastIndex === m.index) re.lastIndex += 1;
    }
  }
  return best;
}

function normalizeLabel(s) {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * 1. סתירה בין הפלט לבין מדידות המטופל.
 * אם P-fact אומר CRP=high והפלט כותב "CRP נמוך" — זו סתירה חמורה,
 * כי כל ההיגיון שנבנה מעליה שגוי.
 */
export function detectFindingContradictions(output, factBlock) {
  const out = [];
  const patientFacts = (factBlock?.facts ?? []).filter((f) => f.kind === 'patient' && f.flag);

  if (!patientFacts.length) return out;

  const prose = collectProseStrings(output);

  for (const pf of patientFacts) {
    const flag = pf.flag === 'high' || pf.flag === 'low' ? pf.flag : null;
    if (!flag) continue;

    // שמות אפשריים למדד: המפתח וגם התווית העברית
    const aliases = [pf.entity_key, pf.text.split(':')[0]]
      .filter(Boolean)
      .map((a) => String(a).trim())
      .filter((a) => a.length >= 2);
    if (!aliases.length) continue;

    for (const { path, text } of prose) {
      for (const alias of aliases) {
        const idx = normalizeLabel(text).indexOf(normalizeLabel(alias));
        if (idx === -1) continue;

        const { window, offset } = clauseAround(text, idx, alias.length);
        const stated = nearestDirection(window, idx - offset, alias.length);
        if (!stated) continue;

        const isOpposite = stated.dir === OPPOSITE[flag];
        const isNormalButFlagged = stated.dir === 'normal';
        if (!isOpposite && !isNormalButFlagged) continue;

        out.push({
          contradiction_id: `XF${out.length + 1}`,
          kind: 'finding_vs_finding',
          severity: isOpposite ? 'block' : 'warn_high',
          path,
          description_he:
            `הפלט מתאר את ${alias} ככיוון "${stated.dir}", אך המדידה בפועל (${pf.id}) ` +
            `מסומנת כ-"${flag}". ההיגיון שנבנה על תיאור זה אינו אמין.`,
          involved_refs: [pf.id],
          detected_by: 'code',
        });
      }
    }
  }
  return dedupe(out);
}

/**
 * 2. כיוון שנשען על דפוס שלא הותאם בפועל.
 * זו הזיית-grounding קלאסית: המודל "נזכר" בדפוס שלא סופק לו.
 */
export function detectUngroundedPatterns(output, matchedPatterns = []) {
  const allowed = new Set(matchedPatterns.map((p) => p.pattern_key).filter(Boolean));
  const out = [];

  const buckets = [
    ...(output?.directions ?? []),
    ...(output?.differential ?? []),
  ];

  for (const d of buckets) {
    for (const pk of d?.based_on_patterns ?? []) {
      if (allowed.has(pk)) continue;
      out.push({
        contradiction_id: `XP${out.length + 1}`,
        kind: 'finding_vs_source',
        severity: 'block',
        description_he:
          `הכיוון "${d.diagnosis_direction_he}" מצהיר שהוא נשען על הדפוס "${pk}", ` +
          `אך דפוס זה לא הותאם לנתוני המטופל ע"י המנוע הדטרמיניסטי.`,
        involved_refs: d.fact_refs ?? [],
        direction_id: d.direction_id ?? null,
        detected_by: 'code',
      });
    }
  }

  for (const p of output?.patterns_detected ?? []) {
    if (allowed.has(p.pattern_key)) continue;
    out.push({
      contradiction_id: `XP${out.length + 1}`,
      kind: 'finding_vs_source',
      severity: 'block',
      description_he:
        `הפלט מדווח על זיהוי הדפוס "${p.pattern_key}", אך המנוע הדטרמיניסטי לא התאים אותו.`,
      involved_refs: [],
      detected_by: 'code',
    });
  }

  return out;
}

/**
 * 3. סתירה בין מקורות: שני פריטי KB שמצביעים על אותו עוגן עם חשד מנוגד.
 * לא מיישבים — מציגים.
 */
export function detectSourceConflicts(factBlock) {
  const out = [];
  const byAnchor = new Map();

  for (const f of factBlock?.facts ?? []) {
    if (f.kind !== 'kb' || !f.source_anchor || !f.kb_suspicion) continue;
    if (!byAnchor.has(f.source_anchor)) byAnchor.set(f.source_anchor, []);
    byAnchor.get(f.source_anchor).push(f);
  }

  for (const [anchor, group] of byAnchor) {
    const levels = new Set(group.map((f) => f.kb_suspicion));
    if (levels.has('red') && levels.has('green')) {
      out.push({
        contradiction_id: `XS${out.length + 1}`,
        kind: 'source_vs_source',
        severity: 'warn_high',
        description_he:
          `שני פריטי ידע תחת אותו עוגן (${anchor}) מובילים לרמות חשד מנוגדות ` +
          `(אדום מול ירוק). יש להציג את שניהם ולא להכריע אוטומטית.`,
        involved_refs: group.map((f) => f.id),
        detected_by: 'code',
      });
    }
  }
  return out;
}

/**
 * 4. כיוונים שסותרים זה את זה לפי הצהרת ה-refutes של עצמם.
 * אם כיוון A מציין כראיה-שוללת ממצא שכיוון B מציין כראיה-תומכת,
 * ושניהם קיבלו חשד גבוה — יש כאן חוסר-עקביות שצריך להיאמר.
 */
export function detectDirectionConflicts(output) {
  const out = [];
  const dirs = [...(output?.directions ?? []), ...(output?.differential ?? [])];
  const HIGH = new Set(['red', 'yellow']);

  for (let i = 0; i < dirs.length; i += 1) {
    for (let j = i + 1; j < dirs.length; j += 1) {
      const a = dirs[i];
      const b = dirs[j];
      const aLevel = a?.confidence?.level;
      const bLevel = b?.confidence?.level;
      if (!HIGH.has(aLevel) || !HIGH.has(bLevel)) continue;
      if (aLevel !== 'red' && bLevel !== 'red') continue;

      const aRefutes = new Set((a.refutes_he ?? []).map(normalizeLabel));
      const bSupports = (b.supports_he ?? []).map(normalizeLabel);
      const overlap = bSupports.filter((s) => aRefutes.has(s));

      if (overlap.length) {
        out.push({
          contradiction_id: `XD${out.length + 1}`,
          kind: 'direction_vs_direction',
          severity: 'warn_high',
          description_he:
            `"${a.diagnosis_direction_he}" מציין כראיה שוללת בדיוק את מה ש-` +
            `"${b.diagnosis_direction_he}" מציין כראיה תומכת (${overlap.join('; ')}), ` +
            `ושני הכיוונים קיבלו חשד גבוה. יש להכריע או להצהיר על אי-הכרעה.`,
          involved_refs: [...(a.fact_refs ?? []), ...(b.fact_refs ?? [])],
          detected_by: 'code',
        });
      }
    }
  }
  return out;
}

/**
 * סתירת-בטיחות: קיים Red Flag אך רמת החשד הכללית אינה אדומה.
 * זו החמורה מכולן — היא ההפך מבטיחות-גיל-תחילה.
 */
export function detectSafetyInconsistency(output, redFlags = []) {
  const out = [];
  const hasFlag = (redFlags?.length ?? 0) > 0 || (output?.red_flags?.length ?? 0) > 0;
  if (!hasFlag) return out;

  if (output?.overall_suspicion !== 'red') {
    out.push({
      contradiction_id: 'XSAFE1',
      kind: 'finding_vs_source',
      severity: 'block',
      description_he:
        `זוהה דגל אדום (Red Flag) אך רמת החשד הכללית שהופקה היא ` +
        `"${output?.overall_suspicion}". דגל אדום מחייב חשד כללי אדום.`,
      involved_refs: [],
      detected_by: 'code',
      auto_fix: { field: 'overall_suspicion', value: 'red' },
    });
  }

  if (!(output?.red_flags?.length)) {
    out.push({
      contradiction_id: 'XSAFE2',
      kind: 'finding_vs_source',
      severity: 'block',
      description_he:
        'המנוע הדטרמיניסטי זיהה דגלים אדומים, אך הפלט לא הציג אותם. ' +
        'דגלים אדומים חייבים להופיע ראשונים ובמלואם.',
      involved_refs: [],
      detected_by: 'code',
      auto_fix: { field: 'red_flags', value: redFlags },
    });
  }

  return out;
}

/**
 * הרצה מלאה.
 * @returns {{contradictions: object[], blocking: object[], ok: boolean}}
 */
export function detectContradictions({ output, factBlock, matchedPatterns = [], redFlags = [] }) {
  const contradictions = [
    ...detectSafetyInconsistency(output, redFlags),
    ...detectFindingContradictions(output, factBlock),
    ...detectUngroundedPatterns(output, matchedPatterns),
    ...detectSourceConflicts(factBlock),
    ...detectDirectionConflicts(output),
  ];

  const blocking = contradictions.filter((c) => c.severity === 'block');
  return { contradictions, blocking, ok: blocking.length === 0 };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((c) => {
    const k = `${c.kind}|${c.description_he}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
