/**
 * Persist DoctorPedAI encounters to Supabase (live) or localStorage (dev fallback).
 * Parent copies never include dosing / mg / professional DDx.
 */

import { dirFor, resolveLocale } from '../medscan/i18n/locale.js';
import { isSupabaseConfigured, supabaseRest } from './client.js';
import { mergeEncounterRows } from '../clinic/backup.js';

export const LOCAL_ENCOUNTERS_KEY = 'doctorped_encounters_v1';
const MG_RE = /mg|dose|dosing|nac|mg_per_kg/i;

function stripMgFacts(factBlock) {
  if (!factBlock || !Array.isArray(factBlock.facts)) return factBlock;
  return {
    ...factBlock,
    facts: factBlock.facts.filter((f) => {
      const unit = String(f?.unit ?? '');
      const key = String(f?.key ?? f?.entity_key ?? '');
      return !MG_RE.test(unit) && !MG_RE.test(key);
    }),
  };
}

export function clinicianEncounterRow(result, { locale = 'he', patient_id = null } = {}) {
  const loc = resolveLocale(locale);
  return {
    patient_id,
    locale: loc,
    dir: dirFor(loc),
    rls_role: 'clinician',
    encounter_type: result?.persona === 'parent' ? 'previsit' : 'clinician',
    triage_urgency: result?.triage?.urgency ?? null,
    engines_run: result?.engines_run ?? [],
    output_summary: {
      ok: result?.ok,
      emergency: result?.emergency,
      awaiting_anamnesis: result?.awaiting_anamnesis,
      triggered_modules: result?.triggered_modules ?? [],
      differential: result?.differential ?? [],
      dosing: result?.dosing ?? [],
      recommended_tests: result?.recommended_tests ?? [],
      referral_gate: result?.referral_gate ?? {},
      parent_plan_he: result?.parent_plan_he,
      factBlock: result?.factBlock,
    },
    verification_status: result?.verification_status || 'draft_needs_verification',
  };
}

export function sanitizeParentEncounterRow(clinicianRow) {
  const summary = { ...(clinicianRow?.output_summary ?? {}) };
  delete summary.dosing;
  delete summary.dose;
  delete summary.differential;
  delete summary.calculators;
  delete summary.recommended_tests;
  return {
    ...clinicianRow,
    rls_role: 'parent',
    encounter_type: 'previsit',
    output_summary: {
      ok: summary.ok,
      emergency: summary.emergency,
      awaiting_anamnesis: summary.awaiting_anamnesis,
      parent_plan_he: summary.parent_plan_he,
      triggered_modules: summary.triggered_modules,
      factBlock: stripMgFacts(summary.factBlock),
    },
    verification_status: clinicianRow?.verification_status || 'draft_needs_verification',
  };
}

function readLocal() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_ENCOUNTERS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(rows) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(LOCAL_ENCOUNTERS_KEY, JSON.stringify(rows.slice(0, 200)));
}

export function exportLocalEncounters() {
  return readLocal();
}

export function mergeImportedEncounters(incoming) {
  const merged = mergeEncounterRows(readLocal(), incoming);
  writeLocal(merged);
  return merged;
}

export async function persistDoctorPedEncounter({ result, locale = 'he', patient_id = null } = {}) {
  if (!result?.ok) return { ok: false, reason: 'no_result' };
  const clinician = clinicianEncounterRow(result, { locale, patient_id });
  const parent = sanitizeParentEncounterRow({
    ...clinician,
    output_summary: {
      ...clinician.output_summary,
      parent_plan_he: result.parent_plan_he,
    },
  });
  const rows = result.persona === 'parent' ? [parent] : [clinician, parent];

  if (!isSupabaseConfigured()) {
    const existing = readLocal();
    const stamped = rows.map((r, i) => ({
      ...r,
      id: `local-${Date.now()}-${i}`,
      created_at: new Date().toISOString(),
      backend: 'local_fallback',
    }));
    writeLocal([...stamped, ...existing]);
    return { ok: true, backend: 'local_fallback', count: stamped.length };
  }

  const inserted = await supabaseRest('encounters', { method: 'POST', body: rows });
  if (!inserted.ok) return inserted;
  return { ok: true, backend: 'supabase', data: inserted.data };
}

export async function listEncounters({ role = 'clinician' } = {}) {
  if (isSupabaseConfigured()) {
    const filter = role === 'parent' ? '&rls_role=eq.parent' : '';
    const res = await supabaseRest(`encounters?select=*&order=created_at.desc&limit=50${filter}`);
    if (res.ok) return { ok: true, backend: 'supabase', rows: res.data ?? [] };
  }
  const local = readLocal().filter((r) => (role === 'parent' ? r.rls_role === 'parent' : true));
  return { ok: true, backend: 'local_fallback', rows: local };
}
