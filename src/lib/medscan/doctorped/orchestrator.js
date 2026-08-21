/**
 * DoctorPedAI — אורקסטרטור: מצב כלי עצמאי + מצב מכשיר מאוחד.
 * דטרמיניסטי. מינון רק מ-DoseRecord מאומת. אינו אבחנה.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { weightBasedDose } from '../deterministic/calculators.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { sortForDisplay } from '../engines/mustNotMiss.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { t, finalizeLocale } from '../i18n/localize.js';
import { runToxicologyEngine, runTraumaEngine, runGrowthImmunizationEngine } from '../engines/expertModules.js';
import { runInfantNutritionAndDevelopment } from '../engines/infantNutritionAndDevelopment.js';
import { runNeurodevelopmentalEngine } from '../engines/neurodevelopmentalEngine.js';
import { runChronicSymptomsEngine } from '../engines/chronicSymptomsEngine.js';
import { runSyndromeMatcher } from '../engines/syndromeMatcher.js';
import { runMetabolicInterpreter } from '../engines/metabolicInterpreter.js';
import { runGeneticsInterpreter } from '../engines/geneticsInterpreter.js';
import { runCsfInterpreter } from '../engines/csfInterpreter.js';
import { runPediatricUltrasound } from '../engines/pediatricUltrasound.js';
import { runEegInterpreter } from '../engines/eegInterpreter.js';
import { matchPediatricPathway } from '../engines/pediatricPathways.js';
import { getModule, listToolboxModules, selectInstruments } from './registry.js';
import { classifyUrgency, URGENCY } from './triage.js';
import { buildAnamnesisQuestions } from './anamnesis.js';
import {
  evaluateAsdAdhdReferral,
  evaluateCeliacReferral,
  evaluateShortStatureReferral,
  specialistAllowed,
  diagnosticTree,
} from './referralChecklists.js';
import { resolvePersona, shapeForPersona } from './personas.js';

const TRIAGE_ANCHORS = Object.freeze({
  'triage.anaphylaxis': 'needs_verification.nelson.allergy.anaphylaxis',
  'triage.battery': 'needs_verification.nelson.emergency.button_battery',
  'triage.magnets': 'needs_verification.nelson.emergency.magnet_ingestion',
  'triage.low_gcs': 'needs_verification.nelson.emergency.head_trauma',
  'triage.head_trauma': 'needs_verification.aap.pecarn.head_ct',
  'triage.infant_sick': 'needs_verification.nelson.emergency.toxic_appearance',
  'triage.petechiae_fever': 'needs_verification.nelson.id.meningococcemia',
  'triage.seizure': 'needs_verification.nelson.neurology.seizure',
  'triage.respiratory': 'needs_verification.nelson.emergency.respiratory_distress',
  'triage.neonate_fever': 'needs_verification.nelson.emergency.neonatal_fever',
  'triage.fpies': 'needs_verification.nelson.allergy.fpies',
});

export const DRAFT = 'draft_needs_verification';

function fail(reason, extra, locale = 'he') {
  return finalizeLocale({
    ok: false, reason, verification_status: 'unavailable', disclaimer_he: DISCLAIMER_HE, ...extra,
  }, locale);
}

function runInstrument(id, payload) {
  const p = { ...payload, locale: payload.locale, mode: payload.mode };
  switch (id) {
    case 'toxicology': return runToxicologyEngine(p);
    case 'trauma': return runTraumaEngine(p);
    case 'growth': return runGrowthImmunizationEngine(p);
    case 'milestones': return runInfantNutritionAndDevelopment(p);
    case 'neurodev': return runNeurodevelopmentalEngine(p);
    case 'pain': return runChronicSymptomsEngine(p);
    case 'triads': return runSyndromeMatcher(p);
    case 'metabolic': return runMetabolicInterpreter(p);
    case 'genetics': return runGeneticsInterpreter(p);
    case 'csf': return runCsfInterpreter(p);
    case 'ultrasound': return runPediatricUltrasound(p);
    case 'eeg': return runEegInterpreter(p);
    default: return { ok: false, reason: 'instrument_async_or_ui', module_id: id, route: getModule(id)?.route };
  }
}

function mergeEngine(engines, id, result) {
  if (!result || result.ok === false && !result.red_flags?.length) {
    engines.push({ id, ok: false, reason: result?.reason ?? 'skipped' });
    return { kbItems: [], red_flags: [], differential: [], tests: [] };
  }
  engines.push({
    id,
    ok: result.ok !== false,
    emergency: Boolean(result.emergency),
    matched_patterns: result.matched_patterns ?? [],
  });
  return {
    kbItems: result.kbItems ?? [],
    red_flags: result.red_flags ?? result.safety_alerts ?? [],
    differential: result.differential ?? [],
    tests: result.recommended_tests ?? [],
    factBlock: result.factBlock,
  };
}

function inferReferrals({ findings, presentation, features }) {
  const blob = `${(findings ?? []).join(' ')} ${presentation} ${Object.keys(features ?? {}).join(' ')}`.toLowerCase();
  const ids = [];
  if (/adhd|asd|autism|קשב|אוטיזם|התפתחות/.test(blob)) ids.push('asd_adhd');
  if (/celiac|צליאק|gluten/.test(blob)) ids.push('celiac');
  if (/short stature|קומה נמוכה|ghd/.test(blob)) ids.push('short_stature');
  return ids;
}

export function computeDose({ weight_kg, age_days, doseRecord, persona = 'clinician' } = {}) {
  if (resolvePersona(persona) === 'parent') {
    return { ok: false, reason: 'hidden_from_parent', message_he: 'מינון אינו מוצג בממשק הורה.' };
  }
  return weightBasedDose({ weight_kg, age_days, doseRecord });
}

export function buildEncounterRecord({
  persona,
  locale,
  dir,
  patient_id = null,
  triage = null,
  engines_run = [],
  questionnaire = {},
  output = {},
} = {}) {
  return {
    locale,
    dir,
    rls_role: resolvePersona(persona),
    patient_id,
    encounter_type: resolvePersona(persona) === 'parent' ? 'previsit' : 'clinician',
    triage_urgency: triage?.urgency ?? null,
    engines_run,
    questionnaire_json: questionnaire,
    output_summary: {
      ok: output.ok,
      emergency: output.emergency,
      awaiting_anamnesis: output.awaiting_anamnesis,
    },
    verification_status: DRAFT,
  };
}

/**
 * @param {object} params
 * @param {'clinician'|'parent'} [params.persona]
 * @param {'standalone'|'unified'} [params.integrationMode]
 * @param {string} [params.moduleId]  חובה במצב standalone
 */
export function runDoctorPedAI({
  persona = 'clinician',
  integrationMode = 'unified',
  moduleId = null,
  patient = {},
  findings = [],
  presentation = '',
  features = {},
  vitals = {},
  labs = [],
  answers = {},
  questionnaires = {},
  proceed = false,
  doseRecords = [],
  father_cm = null,
  mother_cm = null,
  lmsTable = null,
  can_do = [],
  weight_kg = null,
  feeds_per_day = 6,
  ga_weeks = null,
  gcs = null,
  burn_regions = null,
  locale = 'he',
  mode = 'development',
} = {}) {
  const loc = locale;
  const role = resolvePersona(persona);
  const ageDays = toAgeDays(patient);
  const payload = {
    patient, findings, presentation, features, vitals, labs,
    locale: loc, mode,
    weight_kg: weight_kg ?? patient.weight_kg,
    feeds_per_day, ga_weeks, can_do, lmsTable, father_cm, mother_cm, gcs, burn_regions,
    mchat_total: questionnaires.mchat_total ?? features.mchat_total,
    vanderbilt: questionnaires.vanderbilt ?? features.vanderbilt,
    settings: features.settings ?? [],
  };

  if (integrationMode === 'standalone') {
    if (!moduleId || !getModule(moduleId)) {
      return fail('standalone_module_required', { message_he: 'מצב כלי עצמאי דורש moduleId מקטלוג MedScan.' }, loc);
    }
    const raw = runInstrument(moduleId, payload);
    const toolbox = listToolboxModules().map((m) => ({ id: m.id, route: m.route, i18n_key: m.i18n_key, title_he: t(loc, m.i18n_key) }));
    return shapeForPersona(finalizeLocale({
      ok: raw.ok !== false,
      engine: 'doctorpedai',
      integration_mode: 'standalone',
      module_id: moduleId,
      toolbox,
      instrument: raw,
      verification_status: DRAFT,
      disclaimer_he: DISCLAIMER_HE,
    }, loc), { persona: role, locale: loc });
  }

  const triage = classifyUrgency({ findings, presentation, features, vitals, patient });
  if (!triage.ok) {
    return fail(triage.reason, { message_he: 'לא סופקה תלונה לטריאז׳ או להערכת רופא.' }, loc);
  }

  const anamnesis = buildAnamnesisQuestions({ findings, presentation, patient, features, answers, locale: loc });
  const emergency = triage.urgency === URGENCY.emergency;
  if (!anamnesis.complete && !proceed && !emergency) {
    return shapeForPersona(finalizeLocale({
      ok: true,
      engine: 'doctorpedai',
      integration_mode: 'unified',
      awaiting_anamnesis: true,
      triage,
      anamnesis,
      emergency: false,
      verification_status: DRAFT,
      disclaimer_he: DISCLAIMER_HE,
      notes_he: ['אנמנזה פעילה: אין מסקנה לפני שאלות הבהרה, אלא בדגל אדום.'],
    }, loc), { persona: role, locale: loc });
  }

  const triggered = selectInstruments({ findings, presentation, labs, features, moduleHint: moduleId });
  if (emergency && !triggered.includes('toxicology') && /battery|magnet|ingest|paracetamol/.test(`${findings.join(' ')} ${presentation}`)) {
    triggered.push('toxicology');
  }

  const engines_run = [];
  let kbItems = [];
  let red_flags = [];
  for (const f of triage.flags ?? []) {
    const source_anchor = TRIAGE_ANCHORS[f.flag_key] || 'needs_verification.nelson.emergency.head_trauma';
    kbItems.push({
      pattern_key: f.flag_key,
      i18n_key: f.i18n_key,
      title_he: t(loc, f.i18n_key),
      source_anchor,
      suspicion: 'red',
      verification_status: DRAFT,
    });
    red_flags.push({
      flag_key: f.flag_key,
      i18n_key: f.i18n_key,
      i18n_action_key: 'emergency.ed',
      label_he: t(loc, f.i18n_key),
      action_he: t(loc, 'emergency.ed'),
      severity: 'critical',
      source_anchor,
      verification_status: DRAFT,
    });
  }
  let differential = [];
  let tests = [];
  const factBlocks = [];

  for (const id of triggered) {
    const raw = runInstrument(id, payload);
    const part = mergeEngine(engines_run, id, raw);
    kbItems = kbItems.concat(part.kbItems);
    red_flags = red_flags.concat(part.red_flags);
    differential = differential.concat(part.differential);
    tests = tests.concat(part.tests);
  }

  const referrals = {};
  for (const pw of inferReferrals({ findings, presentation, features })) {
    if (pw === 'asd_adhd') referrals.asd_adhd = evaluateAsdAdhdReferral({ features, questionnaires });
    if (pw === 'celiac') referrals.celiac = evaluateCeliacReferral({ labs, features });
    if (pw === 'short_stature') {
      referrals.short_stature = evaluateShortStatureReferral({
        patient, father_cm, mother_cm, lmsTable, features,
      });
    }
  }

  const referral_gate = Object.fromEntries(
    Object.entries(referrals).map(([k, v]) => [k, specialistAllowed(v, loc)]),
  );

  const trees = Object.keys(referrals).map((k) => diagnosticTree(k, loc)).filter(Boolean);

  const pathway = matchPediatricPathway({
    query: presentation || findings.join(' '),
    age_days: ageDays,
    locale: loc,
  });

  const dosing = [];
  if (role === 'clinician' && (doseRecords ?? []).length) {
    for (const rec of doseRecords) {
      dosing.push(computeDose({
        weight_kg: weight_kg ?? patient.weight_kg,
        age_days: ageDays,
        doseRecord: rec,
        persona: role,
      }));
    }
  }

  const ranked = sortForDisplay(differential.map((d, i) => ({
    ...d,
    rank: d.rank ?? i + 1,
    must_not_miss: Boolean(d.must_not_miss) || Boolean(d.suspicion === 'red'),
    probability_note_he: t(loc, 'ddx.ordinal_not_calibrated'),
  })));

  const factBlock = buildFactBlock({
    kbItems,
    deterministic: dosing.filter((d) => d.ok),
    patientData: [
      ...(Number.isFinite(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
      { key: 'urgency', label_he: 'טריאז׳', value: triage.urgency },
    ],
    mode,
  });

  const encounter = buildEncounterRecord({
    persona: role, locale: loc, dir: loc === 'en' ? 'ltr' : 'rtl',
    triage, engines_run, questionnaire: questionnaires,
    output: { ok: true, emergency: emergency || red_flags.some((f) => f.severity === 'critical'), awaiting_anamnesis: false },
  });

  return shapeForPersona(finalizeLocale({
    ok: true,
    engine: 'doctorpedai',
    integration_mode: 'unified',
    verification_status: DRAFT,
    awaiting_anamnesis: false,
    triage,
    anamnesis,
    triggered_modules: triggered,
    engines_run,
    toolbox: listToolboxModules().map((m) => ({ id: m.id, route: m.route, i18n_key: m.i18n_key, title_he: t(loc, m.i18n_key) })),
    kbItems,
    red_flags,
    emergency: emergency || red_flags.some((f) => f.severity === 'critical'),
    differential: ranked,
    recommended_tests: tests,
    referrals,
    referral_gate,
    diagnostic_trees: trees,
    community_pathway: pathway?.matched ? { pathway_key: pathway.matched.pathway_key, title_he: pathway.matched.title_he } : null,
    dosing: role === 'clinician' ? dosing : [],
    factBlock,
    encounter,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'DoctorPedAI הוא תמיכה בהחלטות בקהילה. אינו אבחנה ואינו מחליף רופא/ה.',
      'מינון mg/kg רק מרשומת DoseRecord מאומתת. הסתברות אינה מכוילת — must-not-miss בראש.',
    ],
  }, loc), { persona: role, locale: loc });
}

export { listToolboxModules, selectInstruments, getModule } from './registry.js';
export { classifyUrgency, URGENCY } from './triage.js';
export { buildAnamnesisQuestions } from './anamnesis.js';
export {
  evaluateAsdAdhdReferral, evaluateCeliacReferral, evaluateShortStatureReferral,
  evaluateReferral, specialistAllowed, diagnosticTree,
} from './referralChecklists.js';
