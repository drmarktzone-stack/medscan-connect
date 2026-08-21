/**
 * Persist sanitization — parent copies never carry mg/dosing/DDx.
 * node src/lib/supabase/encounters.test.mjs
 */
import { clinicianEncounterRow, sanitizeParentEncounterRow } from './encounters.js';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + '\n      ' + e.message); fail++; } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

console.log('\nDoctorPedAI — encounter persistence\n');

t('עותק הורה מסיר מינון ודיפרנציאל מקצועי', () => {
  const row = clinicianEncounterRow({
    ok: true, persona: 'clinician', triage: { urgency: 'hmo_visit' },
    dosing: [{ ok: true, value: 100, unit: 'mg' }],
    differential: [{ diagnosis_direction_he: 'secret' }],
    factBlock: { facts: [{ key: 'dose', unit: 'mg', value: 12 }, { key: 'age_days', unit: 'days', value: 400 }] },
    parent_plan_he: 'פנו לקופה',
    engines_run: [{ id: 'toxicology', ok: true }],
  }, { locale: 'he' });
  const parent = sanitizeParentEncounterRow(row);
  assert(parent.rls_role === 'parent');
  assert(parent.encounter_type === 'previsit');
  assert(!parent.output_summary.dosing);
  assert(!parent.output_summary.differential);
  const blob = JSON.stringify(parent);
  assert(!/secret/.test(blob), 'professional ddx leaked');
  assert(!/"unit":"mg"/.test(blob), 'mg fact leaked');
  assert(parent.output_summary.parent_plan_he === 'פנו לקופה');
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
if (fail) process.exit(1);
