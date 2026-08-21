/**
 * MedScan — Patient Context Engine (P0)
 *
 * מרקע הילד → בדיקות מומלצות, מעקב, התראות והמלצות דינמיות.
 *
 * ## מה מייחד את המנוע הזה
 * כאן אין "ממצא" להסתמך עליו — יש **רקע**. וזה הופך את הסיכון להשמטה
 * לגדול במיוחד: ילד עם אספלניה וחום הוא מקרה חירום, אבל אם אף כלל
 * לא הופעל, הפלט ייראה רגוע לחלוטין.
 *
 * לכן שני דברים מוצהרים כאן תמיד, גם כשאין מה לדווח:
 *   1. **אינטראקציות** — האם בכלל בוצעה בדיקה (ולא רק מה נמצא)
 *   2. **כיסוי הרקע** — אילו מצבי רקע לא הפעילו שום כלל
 *
 * מצב רקע שלא הפעיל כלל אינו "מצב תקין" — הוא מצב שאין עליו ידע במערכת.
 */

import { groundedInvoke } from '../gate/groundedInvoke.js';
import { resolveMode } from '../runtimeMode.js';
import { runRulesEngine } from '../rules/rulesEngine.js';
import { runCalculators } from '../deterministic/calculators.js';
import { toAgeDays } from '../deterministic/labNormalize.js';
import { matchInteractions, interactionsToKbItems, INTERACTION_STATUS } from '../deterministic/interactions.js';
import { retrieveEvidence } from '../evidence/evidenceGrounding.js';
import {
  createInvokeLLM,
  loadKnowledgeBase,
  loadVerifiedDrugTerms,
  loadInteractionKb,
  writeAudit,
} from '../llmAdapter.js';

const ENGINE_PROMPT = `אתה מנתח **רקע קליני של ילד** ומפיק המלצות מעקב ובירור.

הרקע מגיע כפריטי P#, הידע המאומת כ-F#, ערכים מחושבים כ-D#, וספרות כ-L#.

כללים ייחודיים למנוע הזה:

1. **אינטראקציות תרופתיות — אך ורק ממה שסופק.** אם קיבלת רשימת
   אינטראקציות, השתמש בה. אם לא — **אל תמציא, ואל תרמוז שאין**.
   נאמר לך במפורש אם בוצעה בדיקה או לא. חזור על כך בפלט.
   "לא נמצאו אינטראקציות" ו-"לא בוצעה בדיקה" הם שני דברים שונים לגמרי.

2. **מצב רקע שלא הפעיל כלל.** אם סופקו מצבי רקע שלא נמצא עליהם ידע
   מאומת — הצהר עליהם ב-unknowns_he. אל תשלים המלצה גנרית.
   מצב שאין עליו ידע במערכת אינו מצב שאין בו סיכון.

3. **כל בדיקה והמלצה חייבת עוגן.** פריט ללא fact_refs לא יוצג.
   אין "בדיקות שגרתיות" בלי מקור.

4. **origin חובה בכל התראה** — interaction / context_rule / deterministic /
   red_flag. הרופא/ה צריך/ה לדעת מאיפה כל התראה הגיעה.

5. **מספרים רק מ-D#.** מינון, מרווח מעקב במספרים, אחוזון — אם אין D#,
   אמור שהערך אינו זמין. אל תשלים.

6. **המלצה דינמית מצהירה על הטריגר שלה.** "אם X — אז שקול Y", כאשר X
   הוא ממצא או ערך שסופק, לא תרחיש שהמצאת.`;

/**
 * @param {object} params
 * @param {object} params.patient {age_*, sex, weight_kg, height_cm, chronic_conditions[], medications[], allergies[], immunization_status}
 * @param {object[]} [params.currentValues] [{key, label_he, value, unit}]
 * @param {string[]} [params.recentEvents]
 */
export async function runPatientContext({
  patient = {},
  currentValues = [],
  recentEvents = [],
  mode = resolveMode(),
  withLiterature = true,
}) {
  const ageDays = toAgeDays(patient);
  const pt = { ...patient, age_days: ageDays };

  const conditions = patient.chronic_conditions ?? [];
  const medications = patient.medications ?? [];

  if (!conditions.length && !medications.length && !recentEvents.length) {
    return {
      status: 'input_error',
      message_he:
        'לא הוזן רקע קליני. המנוע פועל על מצבי רקע, תרופות ואירועים — ' +
        'ללא אחד מהם אין מה לנתח.',
    };
  }

  const invokeLLM = createInvokeLLM();

  const [kb, interactionKb, allowedTerms] = await Promise.all([
    loadKnowledgeBase(),
    loadInteractionKb(),
    loadVerifiedDrugTerms(),
  ]);

  // ── אינטראקציות — דטרמיניסטי, ומצהיר על עצמו ─────────────────────────
  const interactions = matchInteractions({
    interactionKb, medications, conditions, mode,
  });

  // ── כללי הקשר + דגלים תלויי-רקע ──────────────────────────────────────
  const findings = [...conditions, ...medications, ...recentEvents];
  const grounding = runRulesEngine({
    kb: {
      redFlags: kb.redFlags,
      labPatterns: kb.labPatterns,
      rules: kb.rules,
      associations: kb.associations,
    },
    patient: pt,
    labs: [],
    findings,
    mode,
  });

  // האינטראקציות שהותאמו נכנסות ל-grounding כפריטי ידע מאומתים
  const interactionItems = interactionsToKbItems(interactions.matched);
  grounding.kbItems = [...grounding.kbItems, ...interactionItems];
  grounding.associations = [...(grounding.associations ?? []), ...interactionItems];

  // ── כיסוי הרקע: מה לא הפעיל שום כלל ──────────────────────────────────
  const coveredText = JSON.stringify(grounding.kbItems ?? []);
  const uncoveredBackground = [...conditions, ...medications].filter(
    (c) => !coveredText.includes(c)
  );

  // ── מחשבונים ─────────────────────────────────────────────────────────
  const calcRequests = [];
  if (Number.isFinite(Number(pt.weight_kg))) {
    calcRequests.push({ type: 'maintenance_fluids', params: { weight_kg: pt.weight_kg } });
  }
  if (Number.isFinite(Number(pt.weight_kg)) && Number.isFinite(Number(pt.height_cm))) {
    calcRequests.push({ type: 'bsa', params: { height_cm: pt.height_cm, weight_kg: pt.weight_kg } });
  }
  const { deterministic, refusals } = runCalculators(calcRequests);

  // ── נתוני המטופל כ-P# ────────────────────────────────────────────────
  const patientData = [
    ...conditions.map((c, i) => ({ key: `cond_${i + 1}`, label_he: 'מצב רקע', value: c })),
    ...medications.map((m, i) => ({ key: `med_${i + 1}`, label_he: 'תרופה', value: m })),
    ...recentEvents.map((e, i) => ({ key: `event_${i + 1}`, label_he: 'אירוע אחרון', value: e })),
    ...currentValues.map((v, i) => ({
      key: v.key ?? `val_${i + 1}`,
      label_he: v.label_he ?? v.key,
      value: v.value,
      unit: v.unit ?? null,
    })),
  ];
  if (patient.allergies?.length) {
    patientData.push({ key: 'allergies', label_he: 'אלרגיות', value: patient.allergies.join(', ') });
  }
  if (patient.immunization_status) {
    patientData.push({ key: 'immunization', label_he: 'מצב חיסונים', value: patient.immunization_status });
  }

  // ── ספרות ────────────────────────────────────────────────────────────
  const evidence = withLiterature && conditions.length
    ? await retrieveEvidence({ findings: conditions, patient: pt, invokeLLM })
    : { literature: [], meta: { attempted: false, note_he: 'לא בוצעה שליפת ספרות.' } };

  // ── השער ─────────────────────────────────────────────────────────────
  const envelope = await groundedInvoke({
    engine: 'patient_context',
    enginePrompt: ENGINE_PROMPT,
    grounding,
    deterministic,
    patientData,
    literature: evidence.literature,
    invokeLLM,
    mode,
    knownTopicKeys: kb.knownTopicKeys,
    allowedTerms,
    extraContext: {
      interaction_check_he: interactions.note_he,
      interaction_check_performed: interactions.status !== INTERACTION_STATUS.NO_SOURCE,
      ...(uncoveredBackground.length
        ? { background_without_matched_knowledge: uncoveredBackground }
        : {}),
      ...(refusals.length
        ? { calculators_refused: refusals.map((r) => r.message_he) }
        : {}),
    },
  });

  // הצהרות שנאכפות בקוד — לא נשענות על כך שהמודל יזכור אותן
  const enforced = { ...envelope };
  enforced.unknowns_he = [...(envelope.unknowns_he ?? [])];

  if (interactions.status === INTERACTION_STATUS.NO_SOURCE) {
    enforced.unknowns_he.unshift(interactions.note_he);
  }
  for (const bg of uncoveredBackground) {
    const msg = `מצב הרקע "${bg}" לא הפעיל שום כלל מאומת במערכת — אין עליו ידע, וזה אינו אומר שאין בו סיכון.`;
    if (!enforced.unknowns_he.some((u) => u.includes(bg))) enforced.unknowns_he.push(msg);
  }

  await writeAudit({ engine: 'patient_context', envelope: enforced });

  return {
    ...enforced,
    interactions,
    uncovered_background: uncoveredBackground,
    calculator_refusals: refusals,
    evidence_meta: evidence.meta,
  };
}
