/**
 * MedScan — בדיקות Lab Interpreter
 *
 * כולל את התרחיש שהניע את הפיצ'ר:
 * לפידים גבוהים + אלבומין נמוך + פרוטאינוריה → תסמונת נפרוטית.
 *
 * הרצה:  node src/lib/medscan/engines/labInterpreter.test.mjs
 */

import { normalizeLabs, toPatientFacts, toAgeDays } from '../deterministic/labNormalize.js';
import { loadReferenceRanges, __resetRegistry } from '../deterministic/refRanges.js';
import { runRulesEngine } from '../rules/rulesEngine.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { groundedInvoke } from '../gate/groundedInvoke.js';
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

/** הדפוס מהבריף — מאומת, כאילו יובא ואומת מנלסון. */
const NEPHROTIC_PATTERN = {
  pattern_key: 'renal.nephrotic_triad',
  title_he: 'שלישיית תסמונת נפרוטית',
  components: [
    { analyte: 'albumin', direction: 'low' },
    { analyte: 'cholesterol', direction: 'high' },
    { analyte: 'protein_urine', direction: 'high' },
  ],
  min_components: 3,
  direction_he: 'כיוון לתסמונת נפרוטית',
  suspicion: 'red',
  clinical_reasoning_he: 'אובדן חלבון בשתן → היפואלבומינמיה → עלייה מפצה בייצור ליפופרוטאינים',
  confirm_with_he: ['יחס protein/creatinine בשתן', 'הערכת בצקות'],
  source_anchor: 'nelson.renal.nephrotic_syndrome',
  verification_status: 'verified',
};

/** תוצאות מעבדה של התרחיש, עם טווחים ידניים מגיליון המעבדה. */
const NEPHROTIC_LABS = [
  { analyte: 'albumin', value: 1.8, unit: 'g/dL', ref_low: 3.5, ref_high: 5.2 },
  { analyte: 'cholesterol', value: 380, unit: 'mg/dL', ref_high: 200 },
  { analyte: 'protein_urine', value: 4.2, unit: 'g/24h', ref_high: 0.15 },
];

console.log('\nLab Interpreter — זיהוי דפוסים רב-פרמטריים\n');

/* ═══ נרמול ═══ */

await t('גיל מומר נכון מכל יחידה', async () => {
  eq(toAgeDays({ age_days: 14 }), 14);
  eq(toAgeDays({ age_years: 4 }), 1461);
  eq(toAgeDays({ age_months: 6 }), 183);
  eq(toAgeDays({}), null);
});

await t('טווח ידני מגיליון המעבדה מסמן נכון', async () => {
  __resetRegistry();
  const { normalized, missingRanges } = normalizeLabs({
    labs: NEPHROTIC_LABS,
    patient: { age_days: 1461 },
  });
  eq(normalized.find((n) => n.analyte === 'albumin').flag, 'low');
  eq(normalized.find((n) => n.analyte === 'cholesterol').flag, 'high');
  eq(normalized.find((n) => n.analyte === 'protein_urine').flag, 'high');
  eq(missingRanges.length, 0, 'טווח ידני לא נלקח בחשבון');
});

await t('גיל חסר חוסם את הניתוח כולו', async () => {
  __resetRegistry();
  const { warnings } = normalizeLabs({ labs: NEPHROTIC_LABS, patient: {} });
  ok(warnings.some((w) => w.code === 'missing_age' && w.severity === 'block'));
});

/* ═══ זיהוי הדפוס ═══ */

await t('התרחיש הנפרוטי: שלושת המדדים יחד מפעילים את הדפוס', async () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({ labs: NEPHROTIC_LABS, patient: { age_days: 1461 } });
  const g = runRulesEngine({
    kb: { labPatterns: [NEPHROTIC_PATTERN] },
    patient: { age_days: 1461 },
    labs: normalized,
  });
  eq(g.matchedPatterns.length, 1, 'הדפוס לא הופעל');
  eq(g.matchedPatterns[0].matched_ratio, 1, 'לא כל הרכיבים זוהו');
  eq(g.matchedPatterns[0].suspicion, 'red');
});

await t('שני מדדים בלבד — הדפוס לא מופעל (min_components=3)', async () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({
    labs: NEPHROTIC_LABS.slice(0, 2),
    patient: { age_days: 1461 },
  });
  const g = runRulesEngine({
    kb: { labPatterns: [NEPHROTIC_PATTERN] },
    patient: { age_days: 1461 },
    labs: normalized,
  });
  eq(g.matchedPatterns.length, 0, 'דפוס הופעל בלי מספיק רכיבים');
  eq(g.partialPatterns.length, 1, 'הדפוס החלקי לא נשמר כמידע');
});

await t('מדד ללא טווח אינו תורם לדפוס', async () => {
  __resetRegistry();
  const labsNoRange = NEPHROTIC_LABS.map((l, i) =>
    i === 0 ? { analyte: l.analyte, value: l.value, unit: l.unit } : l
  );
  const { normalized, missingRanges } = normalizeLabs({
    labs: labsNoRange, patient: { age_days: 1461 },
  });
  eq(normalized[0].flag, 'unknown_range');
  ok(missingRanges.includes('albumin'));

  const g = runRulesEngine({
    kb: { labPatterns: [NEPHROTIC_PATTERN] },
    patient: { age_days: 1461 },
    labs: normalized,
  });
  eq(g.matchedPatterns.length, 0, 'דפוס הופעל על סמך מדד שלא נורמל');
});

/* ═══ הצינור המלא ═══ */

const makeOutput = (over = {}) => ({
  red_flags: [], claims: [], contradictions: [],
  patterns_detected: [{
    pattern_key: 'renal.nephrotic_triad',
    contributing_labs: ['albumin', 'cholesterol', 'protein_urine'],
    source_anchor: 'nelson.renal.nephrotic_syndrome',
  }],
  directions: [{
    direction_id: 'D1',
    diagnosis_direction_he: 'תסמונת נפרוטית — הצירוף קלאסי',
    confidence: { level: 'red', confidence_reason_he: 'שלושת רכיבי הדפוס מתקיימים במלואם', evidence_strength: 'strong' },
    reasoning_chain: [
      { step: 1, stage: 'findings', statement_he: 'אלבומין נמוך, כולסטרול גבוה, חלבון בשתן גבוה', fact_refs: ['P1', 'P2', 'P3'] },
      { step: 2, stage: 'links', statement_he: 'הצירוף תואם את שלישיית הדפוס', fact_refs: ['F1'] },
      { step: 3, stage: 'candidate_conclusion', statement_he: 'כיוון לתסמונת נפרוטית', fact_refs: ['F1'] },
    ],
    supports_he: ['אלבומין נמוך', 'כולסטרול גבוה', 'חלבון בשתן גבוה'],
    refutes_he: ['יחס protein/creatinine תקין בבדיקה חוזרת'],
    discriminating_test_he: ['יחס protein/creatinine בשתן'],
    fact_refs: ['F1', 'P1'],
    source_anchors: ['nelson.renal.nephrotic_syndrome'],
    based_on_patterns: ['renal.nephrotic_triad'],
  }],
  unknowns_he: ['לא סופקה הערכת בצקות'],
  overall_suspicion: 'red',
  disclaimer_he: DISCLAIMER_HE,
  ...over,
});

const llm = (out, sc = { verdicts: [], overall: 'pass' }) =>
  async ({ purpose }) => {
    if (purpose === 'self_check') return sc;
    if (purpose === 'search_terms') return { primary_terms_en: ['nephrotic syndrome'] };
    return structuredClone(out);
  };

await t('התרחיש המלא: דפוס מאומת → כיוון אדום עובר', async () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({ labs: NEPHROTIC_LABS, patient: { age_days: 1461 } });
  const g = runRulesEngine({
    kb: { labPatterns: [NEPHROTIC_PATTERN] },
    patient: { age_days: 1461 },
    labs: normalized,
  });

  const res = await groundedInvoke({
    engine: 'lab_interpreter',
    enginePrompt: 'נתח',
    grounding: g,
    patientData: toPatientFacts(normalized),
    invokeLLM: llm(makeOutput()),
    consistencySamples: 1,   // עוקפים דגימה כדי לבדוק את הנתיב הבסיסי
  });

  ok(res.status !== OUTPUT_STATUS.INSUFFICIENT, `סירוב לא צפוי: ${JSON.stringify(res.reasons_he)}`);
  eq(res.directions.length, 1);
  eq(res.overall_suspicion, 'red');
  ok(res.audit.anchors_used.includes('nelson.renal.nephrotic_syndrome'));
});

await t('ידע לא-מאומת → סירוב, גם כשהדפוס מושלם', async () => {
  __resetRegistry();
  const draft = { ...NEPHROTIC_PATTERN, verification_status: 'draft_needs_verification' };
  const { normalized } = normalizeLabs({ labs: NEPHROTIC_LABS, patient: { age_days: 1461 } });
  const g = runRulesEngine({
    kb: { labPatterns: [draft] },
    patient: { age_days: 1461 },
    labs: normalized,
    mode: 'clinical',
  });

  let calls = 0;
  const res = await groundedInvoke({
    engine: 'lab_interpreter', enginePrompt: 'נתח',
    grounding: g, patientData: toPatientFacts(normalized),
    invokeLLM: async () => { calls += 1; return makeOutput(); },
  });

  eq(res.status, OUTPUT_STATUS.INSUFFICIENT);
  eq(calls, 0, 'בוצעה קריאת LLM על ידע לא-מאומת');
});

await t('מדד שלא נורמל — ההשמטה נאכפת ומוצהרת', async () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({ labs: NEPHROTIC_LABS, patient: { age_days: 1461 } });
  const g = runRulesEngine({
    kb: { labPatterns: [NEPHROTIC_PATTERN] },
    patient: { age_days: 1461 },
    labs: normalized,
  });
  g.missingRanges = ['procalcitonin'];

  const res = await groundedInvoke({
    engine: 'lab_interpreter', enginePrompt: 'נתח',
    grounding: g, patientData: toPatientFacts(normalized),
    invokeLLM: llm(makeOutput()), consistencySamples: 1,
  });

  ok(
    (res.unknowns_he ?? []).some((u) => u.includes('procalcitonin')),
    'הפער לא הוצהר אוטומטית'
  );
});

await t('P# נבנים מהערכים המנורמלים עם הדגל', async () => {
  __resetRegistry();
  const { normalized } = normalizeLabs({ labs: NEPHROTIC_LABS, patient: { age_days: 1461 } });
  const fb = buildFactBlock({
    kbItems: [NEPHROTIC_PATTERN],
    patientData: toPatientFacts(normalized),
  });
  ok(fb.text.includes('[low]'), 'הדגל לא נכנס ל-FACT BLOCK');
  ok(fb.allowedNumbers.has('1.8'), 'ערך מדוד לא נכנס לרשימת המספרים המותרים');
  ok(fb.allowedNumbers.has('380'));
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('Lab Interpreter תקין.');
