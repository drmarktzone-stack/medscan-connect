/**
 * MedScan — Protocol Execution Engine (P0)
 *
 * ## העיקרון המכריע
 * הפרוטוקול הוא **נתון מובנה** בישות `Protocol` — רצף שלבים, תנאי
 * הסתעפות, והפניות למחשבונים. הניווט בעץ נעשה **בקוד**.
 *
 * ה-LLM מסביר את השלב הנוכחי בעברית ומנמק. הוא אינו:
 *   · בורא שלב שאינו בפרוטוקול
 *   · משנה את סדר השלבים
 *   · מחשב מינון או קצב
 *
 * ## ההבדל מהמנועים האחרים
 * במנועי המעבדה וההקשר, סטייה של המודל מייצרת כיוון שגוי — רע, אך
 * הרופא/ה עדיין מפעיל/ה שיקול דעת. בפרוטוקול סטייה מייצרת **צעד**,
 * וצעד נראה כמו הוראה. לכן כאן יש ולידציה נוספת שאין במקומות אחרים:
 * כל step_id ו-next_step_id בפלט נבדק מול הפרוטוקול בפועל, ושלב
 * שהמודל "המציא" חוסם את הפלט.
 */

import { groundedInvoke } from '../gate/groundedInvoke.js';
import { resolveMode } from '../runtimeMode.js';
import { runCalculators } from '../deterministic/calculators.js';
import { toAgeDays } from '../deterministic/labNormalize.js';
import { runRulesEngine } from '../rules/rulesEngine.js';
import {
  createInvokeLLM,
  loadKnowledgeBase,
  loadVerifiedDrugTerms,
  loadProtocol,
  writeAudit,
} from '../llmAdapter.js';
import { resolveStep, validateProtocolOutput, buildCalcRequests } from './protocolTree.js';

// מיוצאים מחדש לנוחות הקוראים — המימוש יושב ב-protocolTree.js
// כדי שיהיה בר-בדיקה בלי התלות ה-alias של Vite.
export { resolveStep, validateProtocolOutput };

const ENGINE_PROMPT = `אתה מסביר **שלב בפרוטוקול קליני קיים**. אינך בונה פרוטוקול.

השלב הנוכחי, הפעולות שבו וההסתעפויות ממנו — כולם סופקו לך כנתון.
תפקידך: להסביר בעברית ברורה מה השלב אומר, למה, ומה להיזהר בו.

כללים ייחודיים למנוע הזה — הקפדה מוחלטת:

1. **אל תוסיף פעולה שאינה ברשימה שסופקה.** אם נראה לך שחסר צעד —
   אמור זאת ב-unknowns_he. אל תשלים אותו לתוך actions_he.
   פעולה שתוסיף תיראה לרופא/ה כחלק מהפרוטוקול.

2. **אל תשנה step_id ואל תמציא next_step_id.** השתמש אך ורק במזהים
   שסופקו. מזהה שתמציא יחסום את הפלט כולו.

3. **אל תחשב מינון, קצב או נפח.** ערכים אלה מגיעים כ-D#. אם מחשבון
   סירב לחשב — אמור שהערך אינו זמין וציין למה. אל תשלים מהזיכרון.
   זו הנקודה המסוכנת ביותר בכל המערכת.

4. **הסתעפות היא בחירה של הרופא/ה.** הצג את התנאים כפי שהם. אל
   תכריע עבורו/ה איזה ענף נכון, גם אם נראה לך ברור.

5. **הפרוטוקול המקומי גובר.** אם קיים local_protocol_ref — הזכר
   שבסתירה בינו לבין נלסון, הפרוטוקול המחלקתי גובר.

6. **דגלים אדומים בשלב הזה** — הצג במלואם ובראש.`;

/**
 * @param {object} params
 * @param {string} params.protocolKey
 * @param {object} params.patient
 * @param {string} [params.currentStepId]  null = השלב הראשון
 * @param {object} [params.state]          ערכים/ממצאים שנאספו
 * @param {object[]} [params.doseRecords]  רשומות מינון מאומתות לשלב
 */
export async function runProtocolStep({
  protocolKey,
  patient = {},
  currentStepId = null,
  state = {},
  doseRecords = [],
  mode = resolveMode(),
}) {
  const ageDays = toAgeDays(patient);
  const pt = { ...patient, age_days: ageDays };

  const protocol = await loadProtocol(protocolKey);

  if (!protocol) {
    return {
      status: 'protocol_error',
      message_he: `לא נמצא פרוטוקול בשם "${protocolKey}".`,
    };
  }

  // פרוטוקול לא-מאומת אינו רץ. בשום מצב.
  if (protocol.verification_status !== 'verified') {
    return {
      status: 'protocol_error',
      protocol,
      message_he:
        `הפרוטוקול "${protocol.title_he}" בסטטוס "${protocol.verification_status}" ואינו מאומת. ` +
        'פרוטוקול קליני לא-מאומת אינו רץ — יש לאמת אותו מול הפרוטוקול המחלקתי לפני שימוש.',
    };
  }

  const { step, index, brokenBranches, error_he } = resolveStep(protocol, currentStepId);
  if (!step) {
    return { status: 'protocol_error', protocol, message_he: error_he };
  }

  // ── מחשבונים לשלב הזה ────────────────────────────────────────────────
  const { deterministic, refusals } = runCalculators(
    buildCalcRequests({ step, patient: pt, doseRecords })
  );

  // ── דגלים אדומים רלוונטיים למצב הנוכחי ───────────────────────────────
  const kb = await loadKnowledgeBase();
  const stateFindings = Object.values(state).filter((v) => typeof v === 'string');
  const grounding = runRulesEngine({
    kb: { redFlags: kb.redFlags, rules: kb.rules, associations: kb.associations, labPatterns: [] },
    patient: pt,
    labs: [],
    findings: stateFindings,
    mode,
  });

  // הפרוטוקול עצמו נכנס כפריט ידע מאומת — הוא המקור לשלב הזה
  grounding.kbItems = [
    ...grounding.kbItems,
    {
      protocol_key: protocol.protocol_key,
      title_he: `${protocol.title_he} — שלב: ${step.title_he}`,
      conclusion_he: (step.actions_he ?? []).join('; '),
      suspicion: 'yellow',
      source_anchor: protocol.source_anchor,
      verification_status: 'verified',
    },
  ];

  const patientData = [
    ...(Number.isFinite(ageDays) ? [{ key: 'age', label_he: 'גיל (ימים)', value: ageDays }] : []),
    ...(Number.isFinite(Number(pt.weight_kg))
      ? [{ key: 'weight', label_he: 'משקל', value: Number(pt.weight_kg), unit: 'kg' }] : []),
    ...Object.entries(state).map(([k, v]) => ({ key: k, label_he: k, value: v })),
  ];

  const invokeLLM = createInvokeLLM();
  const allowedTerms = await loadVerifiedDrugTerms();

  const envelope = await groundedInvoke({
    engine: 'protocol_runner',
    enginePrompt: ENGINE_PROMPT,
    grounding,
    deterministic,
    patientData,
    invokeLLM,
    mode,
    knownTopicKeys: kb.knownTopicKeys,
    allowedTerms,
    extraContext: {
      protocol_key: protocol.protocol_key,
      protocol_title_he: protocol.title_he,
      local_protocol_ref: protocol.local_protocol_ref ?? null,
      current_step: {
        step_id: step.step_id,
        title_he: step.title_he,
        actions_he: step.actions_he ?? [],
        red_flags_he: step.red_flags_he ?? [],
      },
      branch_options: (step.branches ?? []).map((b) => ({
        condition_he: b.condition_he,
        next_step_id: b.next_step_id,
      })),
      valid_step_ids: [...index.keys()],
      ...(refusals.length
        ? { calculators_refused: refusals.map((r) => r.message_he) }
        : {}),
    },
  });

  // ── ולידציה ייחודית: שלב/ענף/פעולה מומצאים ───────────────────────────
  const protocolCheck = validateProtocolOutput({
    output: envelope,
    protocol,
    stepIndex: index,
    allowedActions: step.actions_he ?? [],
  });

  let finalEnvelope = envelope;
  if (protocolCheck.blocking.length) {
    finalEnvelope = {
      ...envelope,
      status: 'insufficient',
      message_he: 'אין לי מידע מספיק מהימן בנושא זה.',
      reasons_he: protocolCheck.blocking.map((v) => v.message_he),
      what_would_help_he: [
        'הרצה חוזרת — שלב מומצא לרוב אינו חוזר על עצמו.',
        'אם התופעה חוזרת — ייתכן שניסוח השלב בפרוטוקול אינו ברור מספיק.',
      ],
      audit: {
        ...(envelope.audit ?? {}),
        reason_codes: [
          ...(envelope.audit?.reason_codes ?? []),
          ...protocolCheck.blocking.map((v) => v.code),
        ],
      },
    };
  }

  await writeAudit({ engine: 'protocol_runner', envelope: finalEnvelope });

  return {
    ...finalEnvelope,
    protocol: {
      protocol_key: protocol.protocol_key,
      title_he: protocol.title_he,
      local_protocol_ref: protocol.local_protocol_ref ?? null,
      total_steps: (protocol.steps ?? []).length,
    },
    step_from_protocol: step,
    branch_options_from_protocol: (step.branches ?? []).map((b) => ({
      condition_he: b.condition_he,
      next_step_id: b.next_step_id,
      exists: index.has(b.next_step_id),
    })),
    broken_branches: brokenBranches ?? [],
    calculator_refusals: refusals,
    protocol_violations: protocolCheck.violations,
  };
}
