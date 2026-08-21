/**
 * MedScan — בדיקות Pediatric Pathways
 *
 * הרצה:  node src/lib/medscan/engines/pediatricPathways.test.mjs
 */

import { resolveStep } from './protocolTree.js';
import {
  PEDIATRIC_PATHWAYS,
  matchPediatricPathway,
  pathwayToKbItem,
  toProtocolView,
  listPediatricPathways,
  buildClinicalAuditPayload,
  DRAFT_STATUS,
} from './pediatricPathways.js';

let pass = 0, fail = 0;
const fails = [];
const t = (n, f) => {
  try { f(); pass += 1; console.log(`  ✓ ${n}`); }
  catch (e) { fail += 1; fails.push(`${n}: ${e.message}`); console.log(`  ✗ ${n}\n      ${e.message}`); }
};
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

const AGE_SCHOOL = 2191; // ~6 שנים

console.log('\nPediatric Pathways — מילון + התאמה דטרמיניסטית\n');

t('המילון כולל ADHD, סקר כיתה א׳, קומה נמוכה וחיסוני שגרה', () => {
  const keys = PEDIATRIC_PATHWAYS.map((p) => p.pathway_key);
  ok(keys.includes('community.adhd.workup'));
  ok(keys.includes('community.school.grade1_screening'));
  ok(keys.includes('community.growth.short_stature'));
  ok(keys.includes('community.immunization.routine'));
});

t('כל המסלולים בסטטוס טיוטה — אין verified מומצא', () => {
  for (const p of PEDIATRIC_PATHWAYS) {
    eq(p.verification_status, DRAFT_STATUS, p.pathway_key);
    ok(String(p.source_anchor).startsWith('needs_verification.'), p.source_anchor);
  }
});

t('אין מינון או סף מספרי בפעולות המסלול', () => {
  const banned = /מ"?ג\/ק"?ג|mg\/kg|µg|mcg|מ"ל\/ק"ג|percentile|SDS\s*[<>]/i;
  for (const p of PEDIATRIC_PATHWAYS) {
    for (const step of p.steps) {
      for (const a of step.actions_he ?? []) {
        ok(!banned.test(a), `מינון/סף בפעולה: ${a}`);
      }
    }
  }
});

t('ADHD מותאם לשאילתה ולגיל בית-ספר, ו-resolveStep נותן שלב ראשון', () => {
  const r = matchPediatricPathway({ query: 'חשד ל-ADHD וקשיי קשב', age_days: AGE_SCHOOL });
  eq(r.matched?.pathway_key, 'community.adhd.workup');
  eq(r.active_step?.step_id, 'adhd.intake');
  eq(r.error_he, null);
});

t('סקר כיתה א׳ מותאם לפי כותרת', () => {
  const r = matchPediatricPathway({ query: 'בדיקות סקר לכיתה א', age_days: AGE_SCHOOL });
  eq(r.matched?.pathway_key, 'community.school.grade1_screening');
});

t('בירור קומה נמוכה מותאם', () => {
  const r = matchPediatricPathway({ query: 'קומה נמוכה', age_days: 1461 });
  eq(r.matched?.pathway_key, 'community.growth.short_stature');
});

t('חיסוני שגרה מותאמים', () => {
  const r = matchPediatricPathway({ query: 'השלמת חיסונים', age_days: 180 });
  eq(r.matched?.pathway_key, 'community.immunization.routine');
});

t('סינון קטגוריה מונע התאמת ADHD כ-routine', () => {
  const r = matchPediatricPathway({
    query: 'ADHD',
    age_days: AGE_SCHOOL,
    category: 'routine',
  });
  eq(r.matched, null);
});

t('חלון גיל: ADHD לא מותאם לתינוק', () => {
  const r = matchPediatricPathway({ query: 'ADHD', age_days: 14 });
  eq(r.matched, null);
  ok(r.skipped.some((s) => s.pathway_key === 'community.adhd.workup' && s.why === 'age_window'));
});

t('מסלול תלוי-גיל בלי גיל מדווח ולא נבלע', () => {
  const r = matchPediatricPathway({ query: 'ADHD' });
  eq(r.matched, null);
  ok(r.skipped.some((s) => s.why === 'unknown_age'));
});

t('שלב פעיל מבוקש מנווט דרך protocolTree', () => {
  const r = matchPediatricPathway({
    query: 'ADHD',
    age_days: AGE_SCHOOL,
    currentStepId: 'adhd.plan',
  });
  eq(r.active_step?.step_id, 'adhd.plan');
});

t('שלב שאינו קיים — error_he מפורש, בלי שלב פעיל', () => {
  const r = matchPediatricPathway({
    query: 'ADHD',
    age_days: AGE_SCHOOL,
    currentStepId: 'adhd.invented',
  });
  eq(r.active_step, null);
  ok(r.error_he.includes('adhd.invented'));
});

t('toProtocolView + resolveStep: כל הענפים קיימים במילון', () => {
  for (const p of PEDIATRIC_PATHWAYS) {
    const view = toProtocolView(p);
    const { index, brokenBranches, error_he } = resolveStep(view, null);
    eq(error_he, null, p.pathway_key);
    ok(index.size === p.steps.length);
    eq(brokenBranches.length, 0, `ענף שבור ב-${p.pathway_key}`);
  }
});

t('pathwayToKbItem שומר verification_status ו-source_anchor', () => {
  const r = matchPediatricPathway({ query: 'ADHD', age_days: AGE_SCHOOL });
  const item = pathwayToKbItem(r);
  eq(item.verification_status, DRAFT_STATUS);
  eq(item.source_anchor, r.matched.source_anchor);
  eq(item.pathway_key, 'community.adhd.workup');
  eq(item.active_step_id, 'adhd.intake');
});

t('listPediatricPathways מסנן לפי גיל וקטגוריה', () => {
  const routine = listPediatricPathways({ age_days: AGE_SCHOOL, category: 'routine' });
  ok(routine.some((p) => p.pathway_key === 'community.school.grade1_screening'));
  ok(!routine.some((p) => p.pathway_key === 'community.adhd.workup'));
});

t('יומן בקרה כולל FactBlock, דגלים ומסלול', () => {
  const r = matchPediatricPathway({ query: 'חום', age_days: 400 });
  const payload = buildClinicalAuditPayload({
    encounter: { age_days: 400, findings_he: ['חום'] },
    factBlock: { text: '=== FACT BLOCK ===', facts: [], draftRejectedCount: 1, hasVerifiedClinicalContent: false },
    redFlags: [{ flag_key: 'rf.test', label_he: 'דגל' }],
    pathwayMatch: r,
    mode: 'clinical',
  });
  eq(payload.matched_pathway_key, 'community.acute.fever');
  eq(payload.red_flags.length, 1);
  eq(payload.draft_items_rejected, 1);
  ok(payload.patient_snapshot.age_days === 400);
});

console.log(`\n${'─'.repeat(52)}`);
console.log(`עברו: ${pass}  ·  נכשלו: ${fail}`);
if (fail) { console.log('\nכשלים:'); fails.forEach((f) => console.log(`  · ${f}`)); process.exit(1); }
console.log('Pediatric Pathways תקין.');
