/**
 * MedScan — Confidence Calibration
 * מנגנון 2 (Confidence Scoring)
 *
 * העיקרון המכריע: **המודל אינו מדרג את עצמו.**
 * מודל שמבקשים ממנו "תן ציון ביטחון" נותן ציון שמשקף שטף לשוני, לא חוזק ראיה.
 * לכן: הקוד מחשב **תקרת ביטחון** דטרמיניסטית מתוך הראיות בפועל, והציון
 * שהמודל הציע יכול רק לרדת אליה — לעולם לא לעלות מעליה.
 *
 * החריג היחיד לכיוון מעלה: Red Flag בטיחותי. בטיחות תמיד מסלימה.
 *
 * התקרה נגזרת מ:
 *   · סטטוס האימות של הידע (טיוטה ≠ מאומת)
 *   · שלמות הדפוס (כמה מרכיביו התקיימו בפועל)
 *   · מספר מקורות בלתי-תלויים שתומכים
 *   · האם הכיוון נשען על ערכים מדודים או על הסקה בלבד
 *   · קיום סתירות
 */

import { DRAFT_SUSPICION_CEILING } from './factBlock.js';

export const LEVEL_ORDER = ['insufficient', 'green', 'yellow', 'red'];

export const rank = (level) => {
  const i = LEVEL_ORDER.indexOf(level);
  return i === -1 ? 0 : i;
};

export const minLevel = (a, b) => (rank(a) <= rank(b) ? a : b);
export const maxLevel = (a, b) => (rank(a) >= rank(b) ? a : b);

/** מסבירים בעברית לכל סיבת-הורדה — הציון חייב להיות מוסבר. */
const REASONS_HE = {
  draft_knowledge:
    'הידע התומך עדיין בסטטוס טיוטה לא-מאומתת מול נלסון, ולכן הביטחון מוגבל',
  no_kb_support: 'לא נמצא פריט ידע מאומת שתומך בכיוון',
  partial_pattern: 'רק חלק מרכיבי הדפוס מתקיימים בנתונים',
  single_source: 'הכיוון נשען על מקור יחיד ללא תימוכין בלתי-תלוי',
  no_measured_data: 'הכיוון נשען על הסקה בלבד, ללא ערכים מדודים תומכים',
  complete_pattern:
    'דפוס מאומת התקיים במלואו על סמך מספר ערכים מדודים — ' +
    'חוזק הראיה מספיק גם בלי עוגן שני בלתי-תלוי',
  draft_reference_range:
    'הדפוס נשען על ערך שסומן כחריג לפי טווח ייחוס שטרם אומת — ' +
    'הסימון עצמו עשוי להיות שגוי',
  exceeds_source_claim:
    'המקור המאומת עצמו אינו טוען לרמת חשד גבוהה כל כך — ' +
    'הציון הוגבל למה שהידע מרשה',
  contradiction_present: 'קיימת סתירה שלא יושבה בין הממצאים או המקורות',
  self_check_overstated: 'המאמת-הנגדי קבע שהניסוח חורג ממה שהראיה מאפשרת',
  red_flag_escalation: 'קיים דגל אדום בטיחותי — החשד מוסלם ללא תלות בשאר הראיות',
};

/**
 * מחשב תקרת ביטחון לכיוון בודד.
 *
 * @param {object} params
 * @param {object} params.direction     הכיוון כפי שהמודל הפיק
 * @param {object} params.factBlock     תוצר buildFactBlock()
 * @param {object[]} params.matchedPatterns דפוסים שהותאמו, כולל matched_ratio
 * @param {object[]} params.contradictions סתירות שזוהו
 * @param {boolean} params.hasRedFlag
 * @returns {{ceiling: string, reasons: string[], evidence_score: number}}
 */
export function computeCeiling({
  direction,
  factBlock,
  matchedPatterns = [],
  contradictions = [],
  hasRedFlag = false,
}) {
  const reasons = [];
  let ceiling = 'red'; // מתחילים גבוה ומורידים לפי ראיות חסרות
  let score = 0;

  const refs = direction?.fact_refs ?? [];
  const referenced = refs.map((r) => factBlock?.index?.get(r)).filter(Boolean);

  const kbRefs = referenced.filter((f) => f.kind === 'kb');
  const patientRefs = referenced.filter((f) => f.kind === 'patient');

  // ── תמיכה בידע מאומת ──────────────────────────────────────────────────
  const verifiedKb = kbRefs.filter((f) => !f.is_draft);
  if (!kbRefs.length) {
    ceiling = minLevel(ceiling, 'insufficient');
    reasons.push(REASONS_HE.no_kb_support);
  } else if (!verifiedKb.length) {
    // כל התימוכין הם טיוטה → תקרה קשיחה
    ceiling = minLevel(ceiling, DRAFT_SUSPICION_CEILING);
    reasons.push(REASONS_HE.draft_knowledge);
    score += 1;
  } else {
    score += 3;
  }

  // ── מקורות בלתי-תלויים ────────────────────────────────────────────────
  // (חישוב המקורות הבלתי-תלויים הועבר מטה — הוא תלוי בשלמות הדפוס)

  // ── שלמות הדפוס ───────────────────────────────────────────────────────
  const usedPatterns = (direction?.based_on_patterns ?? [])
    .map((k) => matchedPatterns.find((p) => p.pattern_key === k))
    .filter(Boolean);

  const bestRatio = usedPatterns.length
    ? Math.max(...usedPatterns.map((p) => p.matched_ratio ?? 0))
    : 0;

  if (usedPatterns.length) {
    if (bestRatio < 1) {
      ceiling = minLevel(ceiling, 'yellow');
      reasons.push(REASONS_HE.partial_pattern);
    }
    score += Math.round(bestRatio * 3);

    // דפוס שנשען על טווח ייחוס לא-מאומת אינו יכול לייצר חשד אדום.
    // השרשרת כולה — ערך → סימון → דפוס → כיוון — חזקה כחולשת
    // החוליה החלשה בה, וכאן זה הטווח שלא אומת מול גיליון המעבדה.
    if (usedPatterns.some((p) => p.relies_on_draft_range)) {
      ceiling = minLevel(ceiling, 'yellow');
      reasons.push(REASONS_HE.draft_reference_range);
    }
  }

  // ── עוגן בנתונים מדודים ───────────────────────────────────────────────
  if (!patientRefs.length) {
    ceiling = minLevel(ceiling, 'yellow');
    reasons.push(REASONS_HE.no_measured_data);
  } else {
    score += 2;
  }

  // מקורות בלתי-תלויים.
  // ⚠ כלל שדורש עדינות: דרישה לשני עוגנים עבור כל חשד אדום
  // נשמעת זהירה, והיא מנטרלת את הכלי בשקט: בספר לימוד קיים בדרך
  // כלל **עוגן אחד לכל מצב**, ולכן כל כיוון היה נחסם לצהוב לנצח,
  // גם כשהראיה חזקה מאוד. כלי שלעולם אינו אומר "אדום" אינו בטוח —
  // הוא חסר-שימוש, ובהקשר הזה חסר-שימוש הוא גם לא-בטוח.
  //
  // האבחנה הנכונה: דפוס מאומת שהתקיים **במלואו** על סמך ערכים
  // מדודים אינו "מקור יחיד דלול". שלושת רכיבי השלישייה הנפרוטית
  // הם שלוש ראיות בלתי-תלויות, גם אם נלסון מתאר אותן בפרק אחד.
  const distinctAnchors = new Set(kbRefs.map((f) => f.source_anchor).filter(Boolean));
  const completeVerifiedPattern =
    bestRatio >= 1 && verifiedKb.length > 0 && patientRefs.length >= 1;

  // הכלל החזק ביותר כאן, והעקרוני ביותר:
  // **אי אפשר לחרוג ממה שהמקור עצמו טוען.**
  // אם כל פריטי הידע שעליהם נשען הכיוון מגדירים את החשד כצהוב,
  // המודל אינו רשאי להפוך אותו לאדום — זו הסלמה שאינה נשענת על
  // דבר, גם אם הדפוס התקיים במלואו. שלמות הדפוס אומרת "התנאים
  // התקיימו", לא "המשמעות חמורה יותר".
  const sourceClaims = kbRefs.map((f) => f.kb_suspicion).filter(Boolean);
  if (sourceClaims.length) {
    const highestSourceClaim = sourceClaims.reduce(
      (acc, s) => maxLevel(acc, s),
      'insufficient'
    );
    if (rank(highestSourceClaim) < rank(ceiling)) {
      ceiling = minLevel(ceiling, highestSourceClaim);
      reasons.push(REASONS_HE.exceeds_source_claim);
    }
  }

  if (distinctAnchors.size <= 1) {
    if (completeVerifiedPattern) {
      reasons.push(REASONS_HE.complete_pattern);
      score += 1;
    } else {
      ceiling = minLevel(ceiling, 'yellow');
      reasons.push(REASONS_HE.single_source);
    }
  } else {
    score += 2;
  }

  // ── סתירות ────────────────────────────────────────────────────────────
  const relevant = contradictions.filter(
    (c) =>
      !c.direction_id ||
      c.direction_id === direction?.direction_id
  );
  if (relevant.some((c) => c.severity === 'block' || c.severity === 'warn_high')) {
    ceiling = minLevel(ceiling, 'yellow');
    reasons.push(REASONS_HE.contradiction_present);
    score -= 2;
  }

  // ── הסלמת בטיחות (הכיוון היחיד למעלה) ─────────────────────────────────
  if (hasRedFlag) {
    ceiling = maxLevel(ceiling, 'red');
    reasons.push(REASONS_HE.red_flag_escalation);
  }

  return { ceiling, reasons, evidence_score: Math.max(0, score) };
}

/**
 * מחיל את הכיול על כל כיווני הפלט.
 * מחזיר עותק מעודכן + יומן שינויים שקוף (לא מורידים ציון בחשאי).
 */
export function calibrateOutput({
  output,
  factBlock,
  matchedPatterns = [],
  contradictions = [],
  redFlags = [],
  selfCheck = null,
}) {
  const hasRedFlag = (redFlags?.length ?? 0) > 0;
  const adjustments = [];
  const clone = structuredClone(output);

  const overstated = new Set(
    (selfCheck?.verdicts ?? [])
      .filter((v) => v.verdict === 'overstated')
      .map((v) => v.claim_id)
  );

  const calibrateList = (list, listName) => {
    if (!Array.isArray(list)) return;
    for (const dir of list) {
      const { ceiling, reasons, evidence_score } = computeCeiling({
        direction: dir,
        factBlock,
        matchedPatterns,
        contradictions,
        hasRedFlag: hasRedFlag && dirTouchesRedFlag(dir, redFlags),
      });

      const proposed = dir?.confidence?.level ?? 'yellow';
      let final = minLevel(proposed, ceiling);

      if (overstated.has(dir.direction_id)) {
        final = minLevel(final, 'yellow');
        reasons.push(REASONS_HE.self_check_overstated);
      }

      // הסלמת בטיחות גוברת גם על הצעת המודל כלפי מטה
      if (hasRedFlag && dirTouchesRedFlag(dir, redFlags)) final = 'red';

      if (final !== proposed) {
        adjustments.push({
          list: listName,
          direction_id: dir.direction_id,
          direction_he: dir.diagnosis_direction_he,
          proposed_by_model: proposed,
          final,
          reasons,
        });
      }

      dir.confidence = {
        ...(dir.confidence ?? {}),
        level: final,
        proposed_by_model: proposed,
        calibrated: final !== proposed,
        calibration_reasons_he: reasons,
        evidence_score,
        confidence_reason_he: buildReasonText(dir, final, proposed, reasons),
      };
    }
  };

  calibrateList(clone.directions, 'directions');
  calibrateList(clone.differential, 'differential');
  calibrateList(clone.dynamic_recommendations, 'dynamic_recommendations');

  // רמת החשד הכללית = הגבוהה מבין הכיוונים, ואף פעם לא נמוכה מדגל אדום
  const all = [
    ...(clone.directions ?? []),
    ...(clone.differential ?? []),
  ];
  let overall = all.reduce(
    (acc, d) => maxLevel(acc, d?.confidence?.level ?? 'insufficient'),
    'insufficient'
  );
  if (hasRedFlag) overall = 'red';

  if (clone.overall_suspicion !== overall) {
    adjustments.push({
      list: 'overall',
      proposed_by_model: clone.overall_suspicion,
      final: overall,
      reasons: hasRedFlag ? [REASONS_HE.red_flag_escalation] : ['נגזר מרמת הכיוון הגבוהה ביותר לאחר כיול'],
    });
    clone.overall_suspicion = overall;
  }

  return { output: clone, adjustments };
}

/** האם הכיוון קשור לדגל האדום שזוהה (ולא כיוון שולי אחר). */
function dirTouchesRedFlag(direction, redFlags) {
  if (!redFlags?.length) return false;
  const text = [
    direction?.diagnosis_direction_he,
    ...(direction?.supports_he ?? []),
  ].join(' ').toLowerCase();

  return redFlags.some((rf) => {
    const key = String(rf.related_direction_he ?? rf.label_he ?? '').toLowerCase();
    if (!key) return false;
    // התאמה גסה בכוונה: עדיף להסלים כיוון אחד מיותר מאשר לפספס דגל
    return text.includes(key.split(' ')[0]);
  });
}

function buildReasonText(dir, final, proposed, reasons) {
  const base = dir?.confidence?.confidence_reason_he ?? '';
  const levelHe = {
    red: 'חשד גבוה',
    yellow: 'דורש בירור',
    green: 'סיכון נמוך',
    insufficient: 'אין ראיה מספקת',
  }[final];

  const parts = [`${levelHe}.`];
  if (base) parts.push(base);
  if (final !== proposed) {
    parts.push(
      `הציון כויל אוטומטית מ-"${proposed}" ל-"${final}" בגלל: ${reasons.join('; ')}.`
    );
  } else if (reasons.length) {
    parts.push(`שיקולי כיול: ${reasons.join('; ')}.`);
  }
  return parts.join(' ');
}

export { REASONS_HE };
