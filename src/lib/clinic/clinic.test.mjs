/**
 * Local clinic session + backup round-trip.
 * node src/lib/clinic/clinic.test.mjs
 */
import { resolveLocalClinicMode, enableLocalClinic, LOCAL_CLINIC_KEY } from './localMode.js';
import { loadClinicProfile, saveClinicProfile, CLINIC_PROFILE_KEY } from './profile.js';
import { buildClinicBackup, parseClinicBackup, mergeEncounterRows } from './backup.js';

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log('  ✓ ' + n); pass++; } catch (e) { console.log('  ✗ ' + n + '\n      ' + e.message); fail++; } };
const assert = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };

function memoryStore(seed = {}) {
  const data = { ...seed };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    _data: data,
  };
}

console.log('\nDoctorPedAI — clinic local mode\n');

t('בלי מזהה אפליקציה חיצוני — המרפאה נפתחת במחשב זה', () => {
  assert(resolveLocalClinicMode({ env: {}, appId: null, token: null }) === true);
});

t('פיתוח בלי אסימון — מצב מקומי', () => {
  assert(resolveLocalClinicMode({ env: { DEV: true }, appId: 'x', token: null }) === true);
});

t('אפליקציה מארחת עם אסימון — לא מדלגת על התחברות', () => {
  assert(resolveLocalClinicMode({
    env: { DEV: false },
    appId: 'hosted',
    token: 'tok',
    storage: memoryStore(),
  }) === false);
});

t('בחירה מפורשת במחשב זה נשמרת', () => {
  const storage = memoryStore();
  enableLocalClinic(storage);
  assert(storage.getItem(LOCAL_CLINIC_KEY) === '1');
  assert(resolveLocalClinicMode({ env: {}, appId: 'hosted', token: null, storage }) === true);
});

t('VITE_FORCE_AUTH חוסם דילוג גם בלי אסימון', () => {
  assert(resolveLocalClinicMode({
    env: { VITE_FORCE_AUTH: 'true', DEV: true, VITE_LOCAL_CLINIC: 'true' },
    appId: 'x',
    token: null,
  }) === false);
});

t('פרופיל מרפאה נחתך ונשמר', () => {
  const storage = memoryStore();
  saveClinicProfile({ clinicName: '  מרפאת ילדים  ', physicianName: 'ד"ר סמר' }, storage);
  const loaded = loadClinicProfile(storage);
  assert(loaded.clinicName === 'מרפאת ילדים');
  assert(loaded.physicianName === 'ד"ר סמר');
  assert(storage.getItem(CLINIC_PROFILE_KEY).includes('מרפאת ילדים'));
});

t('גיבוי וקריאה לא משנים מפגשים', () => {
  const backup = buildClinicBackup({
    profile: { clinicName: 'A', physicianName: 'B' },
    encounters: [{ id: 'local-1', rls_role: 'clinician' }],
  }, () => '2026-08-21T00:00:00.000Z');
  const parsed = parseClinicBackup(JSON.stringify(backup));
  assert(parsed.version === 1);
  assert(parsed.encounters[0].id === 'local-1');
  assert(parsed.profile.clinicName === 'A');
});

t('גיבוי פגום נדחה', () => {
  let threw = false;
  try { parseClinicBackup({ app: 'other', version: 1, encounters: [] }); } catch { threw = true; }
  assert(threw);
});

t('ייבוא ממזג בלי כפילות מזהה', () => {
  const merged = mergeEncounterRows(
    [{ id: 'a', n: 1 }],
    [{ id: 'a', n: 9 }, { id: 'b', n: 2 }],
  );
  assert(merged.length === 2);
  assert(merged.find((r) => r.id === 'a').n === 1);
  assert(merged.find((r) => r.id === 'b').n === 2);
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
if (fail) process.exit(1);
