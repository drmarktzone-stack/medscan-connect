/**
 * MedScan — בדיקות אכיפת "אסור לפספס"
 *
 * הנקודה שבה מיון לפי סבירות הופך למסוכן: המצב מסכן-החיים הוא לרוב
 * גם הנדיר, ולכן נוחת בתחתית הרשימה ולא נקרא.
 *
 * הרצה:  node src/lib/medscan/engines/mustNotMiss.test.mjs
 */

import { enforceMustNotMiss, sortForDisplay, collectRedKbItems } from './mustNotMiss.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const RED_ASSOC = {
  assoc_key: 'id.fever_petechiae',
  anchor_finding_he: 'חום',
  implies_he: 'מנינגוקוקצמיה',
  suspicion: 'red',
  source_anchor: 'nelson.id.meningococcemia',
};

const YELLOW_PATTERN = {
  pattern_key: 'id.viral',
  title_he: 'דפוס ויראלי',
  direction_he: 'זיהום ויראלי',
  suspicion: 'yellow',
  source_anchor: 'nelson.id.viral',
};

const dir = (o = {}) => ({
  direction_id: 'D1',
  diagnosis_direction_he: 'זיהום ויראלי',
  rank: 1,
  must_not_miss: false,
  ...o,
});

console.log('\nאכיפת "אסור לפספס"\n');

t('פריטי KB אדומים נאספים, צהובים לא', () => {
  const red = collectRedKbItems({
    associations: [RED_ASSOC],
    matchedPatterns: [YELLOW_PATTERN],
  });
  eq(red.length, 1);
  eq(red[0].entity_key, 'id.fever_petechiae');
});

t('כיוון שמכסה מצב אדום מסומן אוטומטית', () => {
  const { differential, enforced } = enforceMustNotMiss({
    differential: [
      dir(),
      dir({ direction_id: 'D2', diagnosis_direction_he: 'מנינגוקוקצמיה', rank: 5 }),
    ],
    grounding: { associations: [RED_ASSOC] },
  });

  const d2 = differential.find((d) => d.direction_id === 'D2');
  eq(d2.must_not_miss, true, 'מצב מסכן-חיים לא סומן');
  eq(d2.must_not_miss_enforced_by_code, true);
  eq(enforced.length, 1);
  ok(d2.must_not_miss_reason_he.includes('אינו תלוי בשיקול דעת'), 'ההסבר לא מציין שהסימון אוטומטי');
});

t('התאמה לפי source_anchor עובדת', () => {
  const { differential } = enforceMustNotMiss({
    differential: [dir({ diagnosis_direction_he: 'משהו אחר לגמרי', source_anchors: ['nelson.id.meningococcemia'] })],
    grounding: { associations: [RED_ASSOC] },
  });
  eq(differential[0].must_not_miss, true, 'התאמה לפי עוגן נכשלה');
});

t('התאמה לפי based_on_patterns עובדת', () => {
  const redPattern = { ...YELLOW_PATTERN, pattern_key: 'p.red', suspicion: 'red', direction_he: 'מצב חמור' };
  const { differential } = enforceMustNotMiss({
    differential: [dir({ diagnosis_direction_he: 'לא קשור', based_on_patterns: ['p.red'] })],
    grounding: { matchedPatterns: [redPattern] },
  });
  eq(differential[0].must_not_miss, true);
});

t('סימון קיים של המודל נשמר ולא נמחק', () => {
  const { differential, enforced } = enforceMustNotMiss({
    differential: [dir({ must_not_miss: true })],
    grounding: {},
  });
  eq(differential[0].must_not_miss, true, 'הסימון של המודל נמחק');
  eq(enforced.length, 0, 'נרשמה אכיפה מיותרת');
});

t('הקוד רק מוסיף — לעולם לא מסיר', () => {
  // מצב צהוב בלבד ב-KB, אך המודל סימן must_not_miss
  const { differential } = enforceMustNotMiss({
    differential: [dir({ must_not_miss: true })],
    grounding: { matchedPatterns: [YELLOW_PATTERN] },
  });
  eq(differential[0].must_not_miss, true, 'הקוד הסיר סימון של המודל — בטיחות חייבת להיות חד-כיוונית');
});

t('מצב אדום שאף כיוון לא כיסה מדווח כהשמטה', () => {
  const { uncoveredRed } = enforceMustNotMiss({
    differential: [dir()],
    grounding: { associations: [RED_ASSOC] },
  });
  eq(uncoveredRed.length, 1, 'השמטה של מצב מסכן-חיים לא זוהתה');
  eq(uncoveredRed[0].implies_he, 'מנינגוקוקצמיה');
});

t('ללא פריטים אדומים — אין שינוי', () => {
  const input = [dir()];
  const { differential, enforced, uncoveredRed } = enforceMustNotMiss({
    differential: input,
    grounding: { matchedPatterns: [YELLOW_PATTERN] },
  });
  eq(enforced.length, 0);
  eq(uncoveredRed.length, 0);
  eq(differential[0].must_not_miss, false);
});

/* ═══ המיון — הנקודה הקריטית ═══ */

t('"אסור לפספס" עולה לראש גם עם rank נמוך', () => {
  const sorted = sortForDisplay([
    dir({ direction_id: 'A', rank: 1, must_not_miss: false }),
    dir({ direction_id: 'B', rank: 2, must_not_miss: false }),
    dir({ direction_id: 'C', rank: 9, must_not_miss: true }),
  ]);
  eq(sorted[0].direction_id, 'C', 'מצב מסכן-חיים נשאר בתחתית — זה בדיוק הכשל שהמנגנון מונע');
  eq(sorted[1].direction_id, 'A');
});

t('בתוך כל קבוצה — מיון לפי rank', () => {
  const sorted = sortForDisplay([
    dir({ direction_id: 'A', rank: 3, must_not_miss: true }),
    dir({ direction_id: 'B', rank: 1, must_not_miss: true }),
    dir({ direction_id: 'C', rank: 2, must_not_miss: false }),
  ]);
  eq(sorted[0].direction_id, 'B');
  eq(sorted[1].direction_id, 'A');
  eq(sorted[2].direction_id, 'C');
});

t('rank חסר אינו שובר את המיון', () => {
  const sorted = sortForDisplay([dir({ direction_id: 'A', rank: undefined }), dir({ direction_id: 'B', rank: 1 })]);
  eq(sorted[0].direction_id, 'B');
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('אכיפת "אסור לפספס" תקינה.');
