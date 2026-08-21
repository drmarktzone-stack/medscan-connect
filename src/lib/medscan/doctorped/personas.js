/**
 * DoctorPedAI — עיצוב פלט לפי פרסונה (רופא מול הורה) ושפה.
 * הורה אינו מקבל מינוני מ"ג ואינו מקבל אבחנה. רופא מקבל מונחים מקצועיים.
 */

import { t, finalizeLocale } from '../i18n/localize.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';

export function resolvePersona(persona) {
  return persona === 'parent' ? 'parent' : 'clinician';
}

export function parentMedicationGuide({ doseResult, times = [] } = {}, locale = 'he') {
  if (!doseResult?.ok) {
    return {
      ok: false,
      i18n_key: 'parent.meds.ask_clinician',
      message_he: t(locale, 'parent.meds.ask_clinician'),
    };
  }
  if (!Array.isArray(times) || times.length === 0) {
    return {
      ok: false,
      i18n_key: 'parent.meds.no_times',
      message_he: t(locale, 'parent.meds.no_times'),
    };
  }
  return {
    ok: true,
    times: times.map(String),
    note_he: t(locale, 'parent.meds.visual_only'),
    hides_mg: true,
  };
}

export function shapeForPersona(result, { persona = 'clinician', locale = 'he' } = {}) {
  const role = resolvePersona(persona);
  const base = finalizeLocale({
    ...result,
    persona: role,
    rls_role: role,
    disclaimer_he: result?.disclaimer_he || DISCLAIMER_HE,
  }, locale);

  if (role === 'clinician') {
    return {
      ...base,
      voice: 'professional',
      parent_plain_he: t(locale, 'persona.parent_bridge'),
    };
  }

  const rest = { ...base };
  delete rest.dosing;
  delete rest.dose;
  delete rest.calculators;
  const facts = (rest.factBlock?.facts ?? []).filter((f) => {
    const unit = String(f.unit ?? '');
    const key = String(f.key ?? f.entity_key ?? '');
    return !/mg/i.test(unit) && !/dos(e|ing)/i.test(key);
  });
  return finalizeLocale({
    ...rest,
    persona: 'parent',
    rls_role: 'parent',
    voice: 'accessible',
    factBlock: rest.factBlock ? { ...rest.factBlock, facts } : rest.factBlock,
    parent_plan_he: t(locale, base.triage?.i18n_key || 'triage.hmo_visit'),
    parent_note_he: t(locale, 'persona.parent_safe'),
    medication_guide: parentMedicationGuide({ doseResult: null }, locale),
    hides_mg: true,
  }, locale);
}
