/**
 * DoctorPedAI — בדיקות דטרמיניסטיות (טריאז', הפניות, מינון, דו-מצב, i18n)
 * הרצה: node src/lib/medscan/doctorped/doctorped.test.mjs
 */
import {
  runDoctorPedAI, computeDose, listToolboxModules, classifyUrgency, URGENCY,
  evaluateAsdAdhdReferral, evaluateCeliacReferral, evaluateShortStatureReferral,
  specialistAllowed, parentMedicationGuide,
} from './index.js';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + '\n      ' + e.message); fail++; } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'eq'}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };

console.log('\nDoctorPedAI — dual-mode platform\n');

t('ארגז כלים כולל את מנועי MedScan במצב עצמאי', () => {
  const ids = listToolboxModules().map((m) => m.id);
  for (const need of ['labs', 'skin', 'ecg', 'toxicology', 'neurodev', 'milestones', 'trauma']) {
    assert(ids.includes(need), 'missing ' + need);
  }
  const tox = listToolboxModules().find((m) => m.id === 'toxicology');
  eq(tox.route, '/tox');
});

t('טריאז׳: תינוק עם חום → מיון; צינון ללא דגל בגיל ≥90י → ביתי', () => {
  const em = classifyUrgency({ patient: { age_days: 40 }, findings: ['fever'] });
  eq(em.urgency, URGENCY.emergency);
  const home = classifyUrgency({ patient: { age_days: 400 }, findings: ['mild cough', 'cold'] });
  eq(home.urgency, URGENCY.home_care);
});

t('אנמנזה פעילה: ADHD בלי proceed לא מסיק', () => {
  const r = runDoctorPedAI({
    persona: 'clinician', integrationMode: 'unified',
    patient: { age_years: 7 }, findings: ['adhd'], presentation: 'adhd',
    locale: 'he', mode: 'development',
  });
  assert(r.awaiting_anamnesis, 'should wait for clarifying questions');
  assert((r.anamnesis.questions || []).length > 0);
  assert(r.anamnesis.questions.every((q) => q.need), 'questions must expose need for the form');
});

t('סוללת כפתור → חירום + מנוע טוקסיקולוגיה; אין NAC', () => {
  const r = runDoctorPedAI({
    persona: 'clinician', integrationMode: 'unified',
    patient: { age_years: 2 }, findings: ['button battery'], presentation: 'button battery',
    locale: 'he', mode: 'development',
  });
  assert(r.emergency);
  eq(r.triage.urgency, URGENCY.emergency);
  assert(r.triggered_modules.includes('toxicology'));
  assert(!/n-acetyl|nac /i.test(JSON.stringify(r)));
});

t('הפניית ASD/ADHD נחסמת בלי ראייה/שמיעה/שאלון', () => {
  const blocked = evaluateAsdAdhdReferral({ features: { vision_tested: true } });
  eq(blocked.ready, false);
  assert(blocked.missing.some((m) => m.item === 'hearing'));
  const ok = evaluateAsdAdhdReferral({
    features: { vision_tested: true, hearing_tested: true },
    questionnaires: { mchat_total: 4 },
  });
  eq(ok.ready, true);
  eq(specialistAllowed(ok).allowed, true);
});

t('צליאק: נדרש tTG+IgA על דיאטת גלוטן; ללא גלוטן נחסם', () => {
  const miss = evaluateCeliacReferral({ labs: [], features: {} });
  eq(miss.ready, false);
  const ready = evaluateCeliacReferral({
    labs: [{ analyte: 'tTG-IgA', value: 1 }, { analyte: 'total IgA', value: 1 }],
    features: { gluten_containing_diet: true },
  });
  eq(ready.ready, true);
  const gf = evaluateCeliacReferral({
    labs: [{ analyte: 'tTG-IgA', value: 1 }, { analyte: 'total IgA', value: 1 }],
    features: { gluten_containing_diet: true, gluten_free_diet: true },
  });
  eq(gf.ready, false);
});

t('קומה נמוכה: MPH מחושב; בלי LMS אין Z מומצא', () => {
  const r = evaluateShortStatureReferral({
    patient: { sex: 'male' }, father_cm: 180, mother_cm: 160, features: { growth_plotted: true },
  });
  eq(r.ready, true);
  assert(r.mid_parental_height.ok);
  eq(r.mid_parental_height.value, 176.5);
  assert(r.requested_next.some((x) => x.item === 'bone_age_xray'));
});

t('מינון: סירוב בלי DoseRecord מאומת; הורה לא רואה מ״ג', () => {
  const none = computeDose({ weight_kg: 12, persona: 'clinician' });
  eq(none.ok, false);
  const rec = {
    drug_key: 'demo', drug_name_he: 'דמו', verification_status: 'verified',
    mg_per_kg_per_dose: 10, max_mg_per_dose: 200, source: 'test-protocol',
  };
  const ok = computeDose({ weight_kg: 10, doseRecord: rec, persona: 'clinician' });
  eq(ok.ok, true);
  eq(ok.value, 100);
  const parent = computeDose({ weight_kg: 10, doseRecord: rec, persona: 'parent' });
  eq(parent.ok, false);
  const vis = parentMedicationGuide({ doseResult: ok, times: [] });
  eq(vis.ok, false);
});

t('מצב כלי עצמאי: toxicology לפי moduleId', () => {
  const r = runDoctorPedAI({
    persona: 'clinician', integrationMode: 'standalone', moduleId: 'toxicology',
    vitals: { gcs: 10, pupils: 'miosis', rr_flag: 'low' },
    locale: 'he', mode: 'development',
  });
  eq(r.integration_mode, 'standalone');
  eq(r.module_id, 'toxicology');
  assert(r.instrument.matched_patterns.includes('tox.opioid'));
});

t('הורה: חירום בעברית/אנגלית/ערבית; hides_mg; locale+dir', () => {
  for (const loc of ['he', 'en', 'ar']) {
    const r = runDoctorPedAI({
      persona: 'parent', integrationMode: 'unified',
      patient: { age_days: 40 }, findings: ['fever'], presentation: 'fever',
      locale: loc, mode: 'development',
    });
    eq(r.persona, 'parent');
    eq(r.locale, loc);
    eq(r.dir, loc === 'en' ? 'ltr' : 'rtl');
    eq(r.hides_mg, true);
    assert(r.emergency);
    assert(!JSON.stringify(r).includes('mg/dose'));
  }
});

t('שער הפניה בזרימה מאוחדת ל-ADHD בלי תנאים מוקדמים', () => {
  const r = runDoctorPedAI({
    persona: 'clinician', integrationMode: 'unified', proceed: true,
    patient: { age_years: 8 }, findings: ['adhd'], presentation: 'adhd',
    locale: 'en', mode: 'development',
  });
  eq(r.referrals.asd_adhd.ready, false);
  eq(r.referral_gate.asd_adhd.allowed, false);
  assert(/Do not issue a referral/.test(r.referral_gate.asd_adhd.message_he));
  assert(r.diagnostic_trees.some((tr) => tr.pathway === 'asd_adhd' && tr.tiers.length === 3));
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
if (fail) process.exit(1);
