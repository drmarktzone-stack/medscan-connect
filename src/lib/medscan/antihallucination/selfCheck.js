/**
 * MedScan — Multi-Check Layer (מאמת-נגדי)
 * מנגנון 7
 *
 * לפני שהפלט יוצא, הוא נבדק שוב — הפעם ע"י קריאה **יריבותית** נפרדת,
 * שתפקידה היחיד הוא למצוא חריגות. לא לשפר ניסוח, לא להוסיף תוכן.
 *
 * שלוש שאלות: האם התשובה חורגת מהידע המאומת? האם יש הגזמה? האם יש המצאה?
 *
 * הטיה מכוונת לכיוון החמרה: בספק — לפסול. עלות של הסרת טענה נכונה
 * נמוכה בהרבה מעלות של הצגת טענה מומצאת.
 *
 * מומלץ להריץ במודל **שונה** מזה של הקריאה הראשית (FAST_MODEL):
 * מאמת שהוא אותה קריאה של אותו מודל נוטה לאשר את עצמו.
 */

import { SELF_CHECK_SCHEMA } from '../schemas/output.schemas.js';

export const SELF_CHECK_SYSTEM_PROMPT = `אתה מאמת-נגדי בתוך MedScan, כלי תמיכה בהחלטות לרופאי ילדים.

תפקידך אחד בלבד: **לתקוף** את הפלט שלפניך ולמצוא בו חריגות מהמקור.
אינך משפר, אינך מנסח מחדש, ואינך מוסיף תוכן קליני משלך.

מולך:
1. FACT BLOCK — גבול הידע המותר. מה שאינו שם, לא קיים.
2. הפלט שהופק — רשימת טענות מתויגות עם מזהים.

לכל טענה קבע פסק-דין אחד:
· supported            — נתמכת במלואה ע"י ה-FACT BLOCK
· overstated           — יש בסיס, אך הניסוח חזק ממה שהמקור מאפשר (ודאות, חומרה, גורפות)
· unsupported          — אין לה בסיס ב-FACT BLOCK
· contradicted_by_source — המקור אומר את ההפך

בנוסף אתר:
· fabricated_specifics — כל מספר, מינון, סף, אחוז, שם או מוסד שמופיע בפלט ואינו ב-FACT BLOCK
· missing_contradictions_he — סתירות בין הממצאים/המקורות שהפלט החליק ולא הציג

כללי הכרעה:
· בספק — הכרע לחומרה (overstated לפני supported, unsupported לפני overstated).
· "לא הצלחתי לאמת" = unsupported. אין קרדיט על ספק.
· אל תיתן קרדיט לניסוח משכנע. שטף לשוני אינו ראיה.
· overall="fail" אם יש ולו טענה אחת unsupported או contradicted_by_source, או ולו specific מומצא אחד.
· overall="pass_with_edits" אם יש רק overstated.

החזר JSON בלבד לפי הסכמה.`;

/**
 * בונה את הפרומפט למאמת-הנגדי.
 * מוגש לו הפלט **בצורה מצומצמת** — רק טענות ומזהים — כדי שלא "יתאהב" בנרטיב.
 */
export function buildSelfCheckPrompt({ factBlockText, output }) {
  const claims = [
    ...(output?.claims ?? []).map((c) => ({
      id: c.claim_id,
      type: c.claim_type,
      text: c.text_he,
      refs: c.fact_refs ?? [],
    })),
    ...[...(output?.directions ?? []), ...(output?.differential ?? [])].map((d) => ({
      id: d.direction_id,
      type: 'DIRECTION',
      text: `${d.diagnosis_direction_he} [רמת חשד: ${d?.confidence?.level}] — ${d?.confidence?.confidence_reason_he ?? ''}`,
      refs: d.fact_refs ?? [],
    })),
    ...(output?.recommended_tests ?? []).map((t, i) => ({
      id: `T${i + 1}`,
      type: 'RECOMMENDATION',
      text: `${t.test_he} — ${t.reason_he ?? ''}`,
      refs: t.fact_refs ?? [],
    })),
    ...(output?.dynamic_recommendations ?? []).map((r, i) => ({
      id: `R${i + 1}`,
      type: 'RECOMMENDATION',
      text: `${r.trigger_he} → ${r.recommendation_he}`,
      refs: r.fact_refs ?? [],
    })),
  ];

  return [
    factBlockText,
    '',
    '=== הפלט לבדיקה ===',
    JSON.stringify({ claims, unknowns: output?.unknowns_he ?? [] }, null, 2),
    '=== END ===',
    '',
    'קבע פסק-דין לכל טענה לפי המזהה שלה, ואתר specifics מומצאים וסתירות שהוחלקו.',
  ].join('\n');
}

/**
 * מריץ את המאמת-הנגדי.
 *
 * @param {object} params
 * @param {function} params.invokeLLM  פונקציית קריאה: ({system, prompt, schema}) => Promise<object>
 * @param {string} params.factBlockText
 * @param {object} params.output
 * @returns {Promise<{result: object|null, error: string|null}>}
 */
export async function runSelfCheck({ invokeLLM, factBlockText, output }) {
  try {
    const result = await invokeLLM({
      system: SELF_CHECK_SYSTEM_PROMPT,
      prompt: buildSelfCheckPrompt({ factBlockText, output }),
      schema: SELF_CHECK_SCHEMA,
      purpose: 'self_check',
    });

    if (!result || !Array.isArray(result.verdicts)) {
      return { result: null, error: 'self_check_malformed' };
    }
    return { result, error: null };
  } catch (e) {
    return { result: null, error: `self_check_failed: ${e?.message ?? e}` };
  }
}

/**
 * מתרגם את פסק-הדין להחלטות קונקרטיות.
 *
 * החלטה שמרנית מכוונת:
 *   unsupported / contradicted_by_source → הסרה
 *   overstated                          → הורדת רמת חשד (מטופל ב-calibration)
 *   כשל המאמת עצמו                       → לא מתעלמים; מסמנים ומחלישים
 */
export function applySelfCheckVerdicts({ selfCheck, error }) {
  if (error || !selfCheck) {
    return {
      blockedClaimIds: [],
      blockedDirectionIds: [],
      overstatedIds: [],
      fabricated: [],
      missedContradictions: [],
      // כשל המאמת אינו "עבר" — הוא מוריד את המערכת למצב מוחלש
      forceDegrade: true,
      note_he:
        'שכבת הבדיקה הפנימית לא הושלמה. הפלט מוצג במצב מוחלש ובזהירות מוגברת.',
    };
  }

  const blocked = (selfCheck.verdicts ?? [])
    .filter((v) => v.verdict === 'unsupported' || v.verdict === 'contradicted_by_source');

  const overstatedIds = (selfCheck.verdicts ?? [])
    .filter((v) => v.verdict === 'overstated')
    .map((v) => v.claim_id);

  const blockedIds = blocked.map((v) => v.claim_id);

  return {
    blockedClaimIds: blockedIds,
    blockedDirectionIds: blockedIds, // מזהי כיוון וטענה חיים באותו מרחב
    blockedDetails: blocked.map((v) => ({ id: v.claim_id, verdict: v.verdict, why_he: v.why_he })),
    overstatedIds,
    fabricated: selfCheck.fabricated_specifics ?? [],
    missedContradictions: selfCheck.missing_contradictions_he ?? [],
    forceDegrade: selfCheck.overall !== 'pass',
    hardFail: selfCheck.overall === 'fail',
    note_he:
      selfCheck.overall === 'pass'
        ? 'הפלט עבר את הבדיקה הנגדית.'
        : 'הבדיקה הנגדית אתרה טענות שאינן נתמכות במלואן; הן הוסרו או הוחלשו.',
  };
}
