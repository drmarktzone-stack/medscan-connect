/**
 * בדיקות צינור הפרשנות המעוגנת (רדיולוגיה כמקרה מייצג).
 *
 * בודקת את חילוץ הממצאים ואת האינווריאנטים של ההפרדה תפיסה/פרשנות
 * בלי לגעת ברשת: `loadKnowledgeBase` ו-`createInvokeLLM` נבדקים בנפרד,
 * וכאן אנחנו בודקים את הלוגיקה הטהורה + את הצינור עם הזרקה.
 *
 * הרצה:  node src/lib/medscan/engines/visionGrounded.test.mjs
 */

import { extractObservationsFor, extractIndeterminateZones } from './visionObservations.js';
const extractObservations = (s) => extractObservationsFor('radiology', s);
import { groundedInvoke } from '../gate/groundedInvoke.js';
import { runRulesEngine } from '../rules/rulesEngine.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { OUTPUT_STATUS } from '../antihallucination/envelope.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';

let pass = 0, fail = 0;
const fails = [];
const t = async (n, f) => {
  try { await f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

/** פלט טיפוסי של radiologyEngine. */
const ENGINE_RESULT = {
  abstain: false,
  confidence: 72,
  structured: {
    is_relevant: true,
    interpretable: true,
    image_metadata: {
      modality_detected: 'X-Ray',
      anatomical_region: 'Chest',
      technical_quality: 'Adequate',
    },
    systematic_findings: [
      { anatomical_zone: 'ריאה ימין', status: 'Abnormal', description: 'תסנין באונה תחתונה' },
      { anatomical_zone: 'ריאה שמאל', status: 'Normal', description: 'ללא ממצא' },
      { anatomical_zone: 'לב', status: 'Indeterminate', description: 'לא ניתן להעריך' },
    ],
    key_abnormalities: [
      { finding: 'תסנין', severity: 'Moderate', location: 'אונה תחתונה ימנית', characteristics: 'אטימות מרחבית' },
    ],
    differential_diagnoses: [
      { diagnosis: 'דלקת ריאות', likelihood: 'High' },
    ],
    primary_impression: 'תסנין באונה תחתונה ימנית',
    clinical_urgency: 'Urgent',
    critical_red_flags: [],
  },
};

console.log('\nשכבת פרשנות מעוגנת — רדיולוגיה\n');

await t('חילוץ ממצאים לוקח תפיסה בלבד, לא פרשנות', async () => {
  const obs = extractObservations(ENGINE_RESULT.structured);
  const texts = obs.map((o) => o.finding_he).join(' | ');

  ok(texts.includes('תסנין'), 'ממצא מרכזי לא חולץ');
  ok(texts.includes('תסנין באונה תחתונה'), 'ממצא מהסריקה השיטתית לא חולץ');

  // ההפרדה המרכזית: המסקנה של המודל לא נכנסת פנימה
  ok(!texts.includes('דלקת ריאות'), 'אבחנה מבדלת של המודל דלפה לתוך הממצאים — לולאת אישור-עצמי');
});

await t('אזור תקין ואזור לא-ניתן-להערכה אינם נספרים כממצא', async () => {
  const obs = extractObservations(ENGINE_RESULT.structured);
  const texts = obs.map((o) => o.finding_he).join(' | ');
  ok(!texts.includes('ללא ממצא'), 'אזור תקין נספר כממצא');
  ok(!texts.includes('לא ניתן להעריך'), 'אזור Indeterminate נספר כממצא');
});

await t('אזור שלא הוערך נאסף בנפרד — "לא הוערך" אינו "תקין"', async () => {
  const zones = extractIndeterminateZones(ENGINE_RESULT.structured);
  eq(zones.length, 1, 'אזור Indeterminate לא נאסף כפער');
  eq(zones[0], 'לב');
});

await t('דגל שהמודל דיווח נכנס כממצא, לא כדגל מערכת', async () => {
  const withFlag = {
    ...ENGINE_RESULT.structured,
    critical_red_flags: ['חשד לפנאומוטורקס בלחץ'],
  };
  const obs = extractObservations(withFlag);
  const flagObs = obs.find((o) => o.source === 'model_reported_flag');
  ok(flagObs, 'הדגל שהמודל דיווח לא נכנס כלל');
  eq(flagObs.severity, 'reported_red_flag');
});

await t('ממצא ויזואלי מפעיל דגל אדום מ-KB דטרמיניסטית', async () => {
  const obs = extractObservations(ENGINE_RESULT.structured);
  const findings = obs.map((o) => o.finding_he);

  const g = runRulesEngine({
    kb: {
      redFlags: [{
        flag_key: 'rf.infiltrate', label_he: 'תסנין ריאתי בילד עם חום',
        trigger: { findings: ['תסנין'], logic: 'all' },
        severity: 'red', action_he: 'הערכה קלינית דחופה',
        source_anchor: 'nelson.resp.pneumonia', verification_status: 'verified',
      }],
    },
    patient: { age_days: 1460 },
    findings,
    labs: [],
  });

  eq(g.redFlags.length, 1, 'ממצא ויזואלי לא הפעיל דגל KB');
  eq(g.redFlags[0].action_he, 'הערכה קלינית דחופה', 'הפעולה לא הגיעה מה-KB');
});

await t('ממצא נצפה נכנס כ-P# ולא כ-F#', async () => {
  const obs = extractObservations(ENGINE_RESULT.structured);
  const patientData = obs.map((o, i) => ({
    key: `obs_${i + 1}`, label_he: 'ממצא נצפה', value: o.finding_he,
  }));
  const fb = buildFactBlock({ kbItems: [], patientData, mode: 'clinical' });

  ok(fb.index.has('P1'), 'הממצא לא נכנס כ-P#');
  eq(fb.hasKbContent, false, 'קריאה ויזואלית נספרה בטעות כידע KB');
  eq(fb.hasVerifiedClinicalContent, false, 'קריאה ויזואלית נספרה כידע מאומת');
});

await t('ממצא בלי ידע מאומת → סירוב, לא פרשנות מומצאת', async () => {
  let calls = 0;
  const res = await groundedInvoke({
    engine: 'differential',
    enginePrompt: 'פרש',
    grounding: { kbItems: [] },
    patientData: [{ key: 'obs_1', label_he: 'ממצא נצפה', value: 'תסנין' }],
    invokeLLM: async () => { calls += 1; return {}; },
  });
  eq(res.status, OUTPUT_STATUS.INSUFFICIENT);
  eq(calls, 0, 'בוצעה קריאת LLM למרות שאין ידע מאומת');
});

await t('עם ידע מאומת → פרשנות מעוגנת עוברת', async () => {
  const KB = {
    rule_key: 'r.infiltrate', title_he: 'תסנין ריאתי',
    conclusion_he: 'כיוון לדלקת ריאות', suspicion: 'yellow',
    source_anchor: 'nelson.resp.pneumonia', verification_status: 'verified',
  };
  const modelOut = {
    red_flags: [], claims: [], contradictions: [],
    differential: [{
      direction_id: 'D1', rank: 1, must_not_miss: false,
      diagnosis_direction_he: 'דלקת ריאות',
      confidence: { level: 'yellow', confidence_reason_he: 'תסנין תואם', evidence_strength: 'moderate' },
      reasoning_chain: [
        { step: 1, stage: 'findings', statement_he: 'נצפה תסנין', fact_refs: ['P1'] },
        { step: 2, stage: 'links', statement_he: 'תסנין מקושר לדלקת ריאות', fact_refs: ['F1'] },
        { step: 3, stage: 'candidate_conclusion', statement_he: 'כיוון לדלקת ריאות', fact_refs: ['F1'] },
      ],
      supports_he: ['תסנין באונה תחתונה ימנית'],
      refutes_he: ['איכות תמונה ירודה מחלישה את הקריאה'],
      fact_refs: ['F1', 'P1'], source_anchors: ['nelson.resp.pneumonia'],
    }],
    unknowns_he: ['לא ניתן להעריך את צל הלב'],
    overall_suspicion: 'yellow', disclaimer_he: DISCLAIMER_HE,
  };

  const res = await groundedInvoke({
    engine: 'differential', enginePrompt: 'פרש',
    grounding: { kbItems: [KB], firedRules: [KB] },
    patientData: [{ key: 'obs_1', label_he: 'ממצא נצפה', value: 'תסנין באונה תחתונה ימנית' }],
    invokeLLM: async ({ purpose }) =>
      purpose === 'self_check' ? { verdicts: [], overall: 'pass' } : structuredClone(modelOut),
  });

  ok(res.status !== OUTPUT_STATUS.INSUFFICIENT, `סירוב לא צפוי: ${JSON.stringify(res.reasons_he)}`);
  eq(res.differential.length, 1);
  ok(res.audit.anchors_used.includes('nelson.resp.pneumonia'), 'העוגן לא נרשם ב-audit');
});

await t('מדידה מומצאת בפרשנות נחסמת', async () => {
  const KB = {
    rule_key: 'r.x', title_he: 'תסנין', conclusion_he: 'כיוון',
    suspicion: 'yellow', source_anchor: 'nelson.resp.pneumonia',
    verification_status: 'verified',
  };
  const bad = {
    red_flags: [], claims: [], contradictions: [],
    differential: [{
      direction_id: 'D1', rank: 1, must_not_miss: false,
      diagnosis_direction_he: 'דלקת ריאות — לשקול טיפול 90 מ"ג/ק"ג',
      confidence: { level: 'yellow', confidence_reason_he: 'תסנין תואם', evidence_strength: 'moderate' },
      reasoning_chain: [
        { step: 1, stage: 'findings', statement_he: 'נצפה תסנין', fact_refs: ['P1'] },
        { step: 2, stage: 'links', statement_he: 'מקושר', fact_refs: ['F1'] },
        { step: 3, stage: 'candidate_conclusion', statement_he: 'כיוון', fact_refs: ['F1'] },
      ],
      supports_he: ['תסנין'], refutes_he: ['איכות ירודה'],
      fact_refs: ['F1', 'P1'], source_anchors: ['nelson.resp.pneumonia'],
    }],
    unknowns_he: ['—'], overall_suspicion: 'yellow', disclaimer_he: DISCLAIMER_HE,
  };

  const res = await groundedInvoke({
    engine: 'differential', enginePrompt: 'פרש',
    grounding: { kbItems: [KB], firedRules: [KB] },
    patientData: [{ key: 'obs_1', label_he: 'ממצא נצפה', value: 'תסנין' }],
    invokeLLM: async ({ purpose }) =>
      purpose === 'self_check' ? { verdicts: [], overall: 'pass' } : structuredClone(bad),
  });

  eq(res.status, OUTPUT_STATUS.INSUFFICIENT);
  ok(res.audit.reason_codes.includes('unsourced_critical_numbers'));
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('שכבת הפרשנות המעוגנת תקינה.');
