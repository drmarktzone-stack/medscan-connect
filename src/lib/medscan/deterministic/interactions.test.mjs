/**
 * MedScan — בדיקות התאמת אינטראקציות
 *
 * ההבחנה שנבדקת כאן היא הקריטית ביותר במנוע ההקשר:
 * "לא נמצאו אינטראקציות" ≠ "לא בוצעה בדיקת אינטראקציות".
 *
 * הרצה:  node src/lib/medscan/deterministic/interactions.test.mjs
 */

import {
  matchInteractions, interactionsToKbItems, INTERACTION_STATUS,
} from './interactions.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const REC = {
  interaction_key: 'ix.test.a_b',
  drug_a: 'DrugAlpha',
  drug_b: 'DrugBeta',
  severity: 'major',
  effect_he: 'עלייה ברמת DrugBeta',
  mechanism_he: 'עיכוב מטבוליזם',
  management_he: 'ניטור רמות והתאמת מינון',
  source: 'מסד בדיקה',
  verification_status: 'verified',
};

const COND_REC = {
  interaction_key: 'ix.test.drug_condition',
  drug_a: 'DrugGamma',
  condition: 'אי-ספיקת כליות',
  severity: 'contraindicated',
  effect_he: 'הצטברות רעילה',
  management_he: 'הימנעות',
  source: 'מסד בדיקה',
  verification_status: 'verified',
};

console.log('\nהתאמת אינטראקציות — דטרמיניסטית\n');

t('אין מסד כלל → "לא בוצעה בדיקה", ולא "לא נמצאו"', () => {
  const r = matchInteractions({ interactionKb: [], medications: ['DrugAlpha'] });
  eq(r.status, INTERACTION_STATUS.NO_SOURCE);
  ok(r.note_he.includes('לא בוצעה בדיקת אינטראקציות'), 'הניסוח אינו מבחין');
  ok(r.note_he.includes('אינו אומר שאין אינטראקציה'), 'חסרה ההסתייגות הקריטית');
});

t('מסד קיים אך כולו טיוטה → עדיין "לא בוצעה בדיקה"', () => {
  const draft = { ...REC, verification_status: 'draft_needs_verification' };
  const r = matchInteractions({ interactionKb: [draft], medications: ['DrugAlpha', 'DrugBeta'] });
  eq(r.status, INTERACTION_STATUS.NO_SOURCE, 'טיוטה נספרה כמסד תקף');
  eq(r.matched.length, 0);
});

t('מסד מאומת ואין התאמה → זהו ממצא, עם הסתייגות', () => {
  const r = matchInteractions({ interactionKb: [REC], medications: ['DrugOther'] });
  eq(r.status, INTERACTION_STATUS.CHECKED);
  eq(r.matched.length, 0);
  ok(r.note_he.includes('לא נמצאה התאמה'));
  ok(r.note_he.includes('אינו שולל'), 'חסרה הסתייגות על גבולות המסד');
});

t('אינטראקציה תרופה-תרופה מזוהה', () => {
  const r = matchInteractions({ interactionKb: [REC], medications: ['DrugAlpha', 'DrugBeta'] });
  eq(r.matched.length, 1);
  eq(r.matched[0].kind, 'drug_drug');
  eq(r.matched[0].suspicion, 'red', 'major אמור למפות לאדום');
  eq(r.matched[0].severity_he, 'משמעותית');
});

t('תרופה אחת בלבד — לא מספיק לאינטראקציה תרופה-תרופה', () => {
  const r = matchInteractions({ interactionKb: [REC], medications: ['DrugAlpha'] });
  eq(r.matched.length, 0, 'הותאמה אינטראקציה עם צד אחד בלבד');
});

t('אותה תרופה לא מתאימה לשני הצדדים', () => {
  const selfRec = { ...REC, drug_b: 'DrugAlpha' };
  const r = matchInteractions({ interactionKb: [selfRec], medications: ['DrugAlpha'] });
  eq(r.matched.length, 0, 'תרופה הותאמה לעצמה');
});

t('אינטראקציה תרופה-מצב מזוהה', () => {
  const r = matchInteractions({
    interactionKb: [COND_REC],
    medications: ['DrugGamma'],
    conditions: ['אי-ספיקת כליות'],
  });
  eq(r.matched.length, 1);
  eq(r.matched[0].kind, 'drug_condition');
  eq(r.matched[0].suspicion, 'red');
});

t('התאמה גמישה של שם תרופה (הכלה)', () => {
  const r = matchInteractions({
    interactionKb: [REC],
    medications: ['DrugAlpha 250mg', 'DrugBeta'],
  });
  eq(r.matched.length, 1, 'שם עם מינון לא הותאם');
});

t('מיון לפי חומרה — החמור ראשון', () => {
  const minor = { ...REC, interaction_key: 'ix.minor', severity: 'minor', drug_b: 'DrugDelta' };
  const r = matchInteractions({
    interactionKb: [minor, REC],
    medications: ['DrugAlpha', 'DrugBeta', 'DrugDelta'],
  });
  eq(r.matched.length, 2);
  eq(r.matched[0].severity, 'major', 'החמור לא הופיע ראשון');
});

t('רשומות לא-מאומתות נספרות ומדווחות', () => {
  const draft = { ...REC, interaction_key: 'ix.draft', verification_status: 'draft_needs_verification' };
  const r = matchInteractions({
    interactionKb: [REC, draft],
    medications: ['DrugAlpha', 'DrugBeta'],
  });
  eq(r.status, INTERACTION_STATUS.PARTIAL);
  eq(r.unverifiedCount, 1);
  ok(r.note_he.includes('טרם אומתו'), 'לא דווח על רשומות שלא נכללו');
});

t('רשומה שסומנה flagged אינה נכנסת לעולם', () => {
  const flagged = { ...REC, verification_status: 'flagged' };
  const r = matchInteractions({ interactionKb: [flagged], medications: ['DrugAlpha', 'DrugBeta'] });
  eq(r.status, INTERACTION_STATUS.NO_SOURCE);
});

t('ללא תרופות — מוצהר שלא נבדקו אינטראקציות תרופה-תרופה', () => {
  const r = matchInteractions({ interactionKb: [REC], medications: [] });
  eq(r.status, INTERACTION_STATUS.CHECKED);
  ok(r.note_he.includes('לא הוזנו תרופות'));
});

t('המרה לפריטי KB שומרת על העוגן והחומרה', () => {
  const r = matchInteractions({ interactionKb: [REC], medications: ['DrugAlpha', 'DrugBeta'] });
  const items = interactionsToKbItems(r.matched);
  eq(items.length, 1);
  eq(items[0].suspicion, 'red');
  eq(items[0].verification_status, 'verified');
  eq(items[0].source_anchor, 'מסד בדיקה');
  ok(items[0].title_he.includes('DrugAlpha'));
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('התאמת האינטראקציות תקינה.');
