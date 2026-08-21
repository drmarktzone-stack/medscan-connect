/**
 * MedScan — בדיקות Protocol Runner
 *
 * הכשל החמור ביותר במנוע הזה הוא **צעד מומצא** — כי צעד נראה כמו
 * הוראה, ולא כמו הצעה. רוב הבדיקות כאן מוקדשות לזה.
 *
 * הרצה:  node src/lib/medscan/engines/protocolRunner.test.mjs
 */

import { resolveStep, validateProtocolOutput, buildCalcRequests } from './protocolTree.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const PROTOCOL = {
  protocol_key: 'test.fws',
  title_he: 'חום ללא מקור — פרוטוקול בדיקה',
  verification_status: 'verified',
  source_anchor: 'nelson.id.fws',
  local_protocol_ref: 'פרוטוקול מחלקתי X',
  steps: [
    {
      step_id: 'S1',
      title_he: 'הערכה ראשונית',
      actions_he: ['מדידת סימנים חיוניים', 'הערכת מראה כללי'],
      deterministic_refs: ['fluids.maintenance'],
      branches: [
        { condition_he: 'מראה חולה', next_step_id: 'S2' },
        { condition_he: 'מראה תקין', next_step_id: 'S3' },
      ],
      red_flags_he: ['מילוי נימי מוארך'],
    },
    { step_id: 'S2', title_he: 'מסלול דחוף', actions_he: ['תרביות'], branches: [] },
    { step_id: 'S3', title_he: 'מעקב', actions_he: ['הערכה חוזרת'], branches: [] },
  ],
};

const stepIndex = () => resolveStep(PROTOCOL, null).index;

console.log('\nProtocol Runner — הפרוטוקול הוא נתון\n');

/* ═══ ניווט דטרמיניסטי ═══ */

t('ללא step_id — מתחילים בשלב הראשון', () => {
  const { step, error_he } = resolveStep(PROTOCOL, null);
  eq(error_he, null);
  eq(step.step_id, 'S1');
});

t('step_id קיים — נפתר נכון', () => {
  eq(resolveStep(PROTOCOL, 'S3').step.step_id, 'S3');
});

t('step_id שאינו קיים — שגיאה מפורשת, לא נפילה שקטה', () => {
  const { step, error_he } = resolveStep(PROTOCOL, 'S99');
  eq(step, null);
  ok(error_he.includes('S99'), 'השגיאה אינה מציינת את המזהה');
});

t('פרוטוקול ללא שלבים — שגיאה', () => {
  const { step, error_he } = resolveStep({ protocol_key: 'x', steps: [] }, null);
  eq(step, null);
  ok(error_he.includes('אינו מכיל שלבים'));
});

t('הסתעפות לשלב שאינו קיים מזוהה כפגם בפרוטוקול', () => {
  const broken = {
    ...PROTOCOL,
    steps: [{ ...PROTOCOL.steps[0], branches: [{ condition_he: 'x', next_step_id: 'S99' }] }],
  };
  const { brokenBranches } = resolveStep(broken, 'S1');
  eq(brokenBranches.length, 1, 'ענף שבור לא זוהה');
  eq(brokenBranches[0].next_step_id, 'S99');
});

/* ═══ הכשל החמור: צעד מומצא ═══ */

const baseOutput = (over = {}) => ({
  protocol_key: 'test.fws',
  current_step: {
    step_id: 'S1',
    title_he: 'הערכה ראשונית',
    explanation_he: 'שלב פתיחה',
    actions_he: ['מדידת סימנים חיוניים', 'הערכת מראה כללי'],
  },
  branch_options: [
    { condition_he: 'מראה חולה', next_step_id: 'S2' },
    { condition_he: 'מראה תקין', next_step_id: 'S3' },
  ],
  ...over,
});

const validate = (out) =>
  validateProtocolOutput({
    output: out,
    protocol: PROTOCOL,
    stepIndex: stepIndex(),
    allowedActions: PROTOCOL.steps[0].actions_he,
  });

t('פלט תקין עובר', () => {
  eq(validate(baseOutput()).blocking.length, 0);
});

t('שלב מומצא נחסם', () => {
  const r = validate(baseOutput({ current_step: { ...baseOutput().current_step, step_id: 'S_INVENTED' } }));
  ok(r.blocking.some((v) => v.code === 'fabricated_step'), 'שלב מומצא עבר');
});

t('הסתעפות מומצאת נחסמת', () => {
  const r = validate(baseOutput({
    branch_options: [{ condition_he: 'x', next_step_id: 'S_NOPE' }],
  }));
  ok(r.blocking.some((v) => v.code === 'fabricated_branch'), 'ענף מומצא עבר');
});

t('פעולה שהמודל הוסיף נחסמת', () => {
  const r = validate(baseOutput({
    current_step: {
      ...baseOutput().current_step,
      actions_he: ['מדידת סימנים חיוניים', 'מתן אנטיביוטיקה אמפירית'],
    },
  }));
  ok(r.blocking.some((v) => v.code === 'added_protocol_action'), 'פעולה שנוספה עברה');
});

t('ניסוח מחדש של פעולה קיימת מותר', () => {
  const r = validate(baseOutput({
    current_step: { ...baseOutput().current_step, actions_he: ['מדידת סימנים חיוניים'] },
  }));
  eq(r.blocking.length, 0, 'תת-קבוצה של פעולות נחסמה בטעות');
});

t('החלפת מזהה הפרוטוקול נחסמת', () => {
  const r = validate(baseOutput({ protocol_key: 'other.protocol' }));
  ok(r.blocking.some((v) => v.code === 'protocol_key_mismatch'));
});

t('פלט ריק אינו מייצר חסימות שווא', () => {
  eq(validate({}).blocking.length, 0, 'פלט ריק ייצר חסימה מיותרת');
});

/* ═══ מחשבונים של השלב ═══ */

t('deterministic_refs ממופה לבקשת מחשבון', () => {
  const reqs = buildCalcRequests({
    step: PROTOCOL.steps[0],
    patient: { weight_kg: 17, age_days: 1461 },
  });
  eq(reqs.length, 1);
  eq(reqs[0].type, 'maintenance_fluids');
  eq(reqs[0].params.weight_kg, 17);
});

t('הפניה למינון ללא רשומה מאומתת — doseRecord null, והמחשבון יסרב', () => {
  const reqs = buildCalcRequests({
    step: { deterministic_refs: ['dosing.amox'] },
    patient: { weight_kg: 17, age_days: 1461 },
    doseRecords: [],
  });
  eq(reqs.length, 1);
  eq(reqs[0].type, 'dose');
  eq(reqs[0].params.doseRecord, null, 'סופקה רשומת מינון שאינה קיימת');
});

t('שלב ללא deterministic_refs — אין בקשות', () => {
  eq(buildCalcRequests({ step: PROTOCOL.steps[1], patient: {} }).length, 0);
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('Protocol Runner תקין.');
