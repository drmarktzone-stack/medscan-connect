/**
 * DoctorPedAI — מנוע פענוח EEG בילדים ותינוקות
 *
 * דטרמיניסטי, ללא LLM. Pre-processing של פסי תדר לפי גיל, התאמת תבניות
 * קריטריוניות (ספייקים, spike-wave, hypsarrhythmia, 3Hz absence, slowing
 * מוקדי, burst-suppression), דגלי חירום, ו-FactBlock מעוגן ל-Nelson / ILAE / AES.
 *
 * אינו אבחנה. כישלון קלט → `{ ok:false }`. תבניות מאות גולמי הן סריקה בטיוטה.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

export const EEG_BANDS = Object.freeze({
  delta: { hz: [0.5, 4], label_he: 'Delta' },
  theta: { hz: [4, 8], label_he: 'Theta' },
  alpha: { hz: [8, 13], label_he: 'Alpha' },
  beta: { hz: [13, 30], label_he: 'Beta' },
});

const fail = (reason, extra = {}) => ({
  ok: false,
  reason,
  verification_status: 'unavailable',
  disclaimer_he: DISCLAIMER_HE,
  ...extra,
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const round3 = (x) => Math.round(Number(x) * 1000) / 1000;

function asFloatSamples(samples) {
  if (!samples) return null;
  if (samples instanceof Float32Array) return samples;
  if (ArrayBuffer.isView(samples)) return Float32Array.from(samples);
  if (Array.isArray(samples)) return Float32Array.from(samples, (x) => Number(x));
  return null;
}

function goertzelPower(samples, sampleRate, freq) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < samples.length; i++) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  const power = s1 * s1 + s2 * s2 - coeff * s1 * s2;
  return Number.isFinite(power) ? Math.abs(power) : 0;
}

function bandPower(samples, sampleRate, lo, hi) {
  const n = Math.max(3, Math.round((hi - lo) / 0.75) + 1);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const f = lo + ((hi - lo) * i) / (n - 1 || 1);
    if (f <= 0 || f >= sampleRate / 2) continue;
    acc += goertzelPower(samples, sampleRate, f);
  }
  return acc;
}

function windowEnergies(samples, sampleRate, winSec = 0.5) {
  const win = Math.max(8, Math.round(sampleRate * winSec));
  const out = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let e = 0;
    for (let j = 0; j < win; j++) e += samples[i + j] * samples[i + j];
    out.push(e / win);
  }
  return out;
}

export function eegAgeBand(ageDays) {
  if (!isNum(ageDays) || ageDays < 0) return null;
  if (ageDays < 28) return { key: 'neonate', label_he: 'ילוד (<28 יום)', expected_dominant: 'delta', alpha_expected: false };
  if (ageDays < 365) return { key: 'infant', label_he: 'תינוק (1–12 חודשים)', expected_dominant: 'theta', alpha_expected: false };
  if (ageDays < 1095) return { key: 'toddler', label_he: 'פעוט (1–3 שנים)', expected_dominant: 'theta', alpha_expected: false };
  if (ageDays < 2920) return { key: 'child', label_he: 'ילד (3–8 שנים)', expected_dominant: 'alpha', alpha_expected: true };
  return { key: 'older', label_he: 'ילד גדול / מתבגר', expected_dominant: 'alpha', alpha_expected: true };
}

/**
 * קטלוג תבניות. כל פריט טיוטה עד אימות מול Nelson / ILAE / AES.
 * אין מינונים. המלצות המשך הן בירור, לא טיפול תרופתי.
 */
export const EEG_PATTERN_CATALOG = Object.freeze([
  Object.freeze({
    pattern_key: 'eeg.hypsarrhythmia',
    title_he: 'תבנית Hypsarrhythmia (חשד לתסמונת West)',
    suspicion: 'red',
    emergency: true,
    source_anchor: 'needs_verification.nelson.neurology.infantile_spasms',
    extra_anchors: [
      'needs_verification.ilae.syndrome.west',
      'needs_verification.aes.guideline.infantile_spasms',
    ],
    differential: [
      {
        direction_id: 'EEG-H1',
        diagnosis_direction_he: 'תסמונת West / infantile spasms — כיוון, לא אבחנה',
        vs_he: 'אין לקבוע West מגל בלבד; נדרשים ספאזמות קליניות + גיל תואם + תבנית',
      },
      {
        direction_id: 'EEG-H2',
        diagnosis_direction_he: 'אנצפלופתיה אפילפטית אחרת / נגע מבני',
        vs_he: 'MRI מוחי לייעוץ מבני מול אידיופתי',
      },
    ],
    workup: [
      { test_he: 'ייעוץ נוירולוגי ילדים דחוף / מיון ילדים', source_anchor: 'needs_verification.aes.guideline.infantile_spasms' },
      { test_he: 'MRI מוחי (לאחר ייצוב, לפי פרוטוקול מקומי מאומת)', source_anchor: 'needs_verification.nelson.neurology.infantile_spasms' },
    ],
    route_he: 'התרעה דחופה: חדר מיון ילדים / טיפול נמרץ ילדים — אין לדחות בקהילה.',
  }),
  Object.freeze({
    pattern_key: 'eeg.absence_3hz',
    title_he: 'תבנית Spike-and-Wave ~3Hz (חשד ל-Absence)',
    suspicion: 'yellow',
    emergency: false,
    source_anchor: 'needs_verification.nelson.neurology.absence_seizures',
    extra_anchors: [
      'needs_verification.ilae.seizure.absence',
      'needs_verification.aes.guideline.absence',
    ],
    differential: [
      {
        direction_id: 'EEG-A1',
        diagnosis_direction_he: 'Childhood absence epilepsy — כיוון',
        vs_he: 'נדרש מתאם קליני (ניתוקי הכרה קצרים); אינו אבחנה מגל בלבד',
      },
      {
        direction_id: 'EEG-A2',
        diagnosis_direction_he: 'Absence atypical / אפילפסיה מוכללת אחרת',
        vs_he: 'תדר שונה מ-3Hz, מורפולוגיה לא-טיפוסית, או ממצאים מוקדיים',
      },
    ],
    workup: [
      { test_he: 'ייעוץ נוירולוגי ילדים (לא דחוף-מיון אלא אם סטטוס)', source_anchor: 'needs_verification.ilae.seizure.absence' },
    ],
  }),
  Object.freeze({
    pattern_key: 'eeg.spikes',
    title_he: 'ספייקים אפילפטיפורמיים',
    suspicion: 'yellow',
    emergency: false,
    source_anchor: 'needs_verification.nelson.neurology.epileptiform_discharges',
    extra_anchors: [
      'needs_verification.ilae.eeg.interictal_discharges',
      'needs_verification.aes.guideline.pediatric_eeg',
    ],
    differential: [
      {
        direction_id: 'EEG-S1',
        diagnosis_direction_he: 'אפילפסיה מוקדית שפירה של הילדות (למשל Rolandic) — כיוון',
        vs_he: 'גיל, מיקום Centrotemporal, פנוטיפ קליני טיפוסי',
      },
      {
        direction_id: 'EEG-S2',
        diagnosis_direction_he: 'נגע מבני / סימפטומטי',
        vs_he: 'ממצא מוקדי לא-טיפוסי, חסר נוירולוגי, או התחלה חריגה לגיל — שקול MRI',
      },
    ],
    workup: [
      { test_he: 'ייעוץ נוירולוגי ילדים', source_anchor: 'needs_verification.aes.guideline.pediatric_eeg' },
      { test_he: 'שקול MRI מוחי אם התבנית אינה טיפוסית לשפירה', source_anchor: 'needs_verification.nelson.neurology.epileptiform_discharges' },
    ],
  }),
  Object.freeze({
    pattern_key: 'eeg.focal_slowing',
    title_he: 'האטה מוקדית',
    suspicion: 'yellow',
    emergency: false,
    source_anchor: 'needs_verification.nelson.neurology.focal_slowing',
    extra_anchors: ['needs_verification.ilae.eeg.focal_slowing'],
    differential: [
      {
        direction_id: 'EEG-F1',
        diagnosis_direction_he: 'נגע מבני מקומי — כיוון לבירור דימות',
        vs_he: 'האטה עקבית באותו אזור',
      },
      {
        direction_id: 'EEG-F2',
        diagnosis_direction_he: 'האטה פוסט-איקטלית / מיגרנה / וריאנט תקין',
        vs_he: 'חולפת, או ללא חסר נוירולוגי',
      },
    ],
    workup: [
      { test_he: 'שקול MRI מוחי אם ההאטה עקבית', source_anchor: 'needs_verification.nelson.neurology.focal_slowing' },
      { test_he: 'ייעוץ נוירולוגי ילדים', source_anchor: 'needs_verification.ilae.eeg.focal_slowing' },
    ],
  }),
  Object.freeze({
    pattern_key: 'eeg.burst_suppression',
    title_he: 'תבנית Burst-suppression',
    suspicion: 'red',
    emergency: true,
    source_anchor: 'needs_verification.nelson.neurology.burst_suppression',
    extra_anchors: [
      'needs_verification.ilae.eeg.burst_suppression',
      'needs_verification.aes.guideline.critical_care_eeg',
    ],
    differential: [
      {
        direction_id: 'EEG-B1',
        diagnosis_direction_he: 'אנצפלופתיה חמורה / אנצפליטיס — כיוון חירום',
        vs_he: 'רקע קליני של ירידת הכרה, חום, או פגיעה היפוקסית',
      },
      {
        direction_id: 'EEG-B2',
        diagnosis_direction_he: 'השפעת תרופות / הרדמה (אם רלוונטי)',
        vs_he: 'חשיפה לתרופות מדכאות — לא להניח בלי תיעוד',
      },
    ],
    workup: [
      { test_he: 'הפניה מיידית לטיפול נמרץ ילדים / מיון', source_anchor: 'needs_verification.aes.guideline.critical_care_eeg' },
      { test_he: 'ייעוץ נוירולוגי דחוף; בירור אנצפליטיס לפי פרוטוקול מקומי', source_anchor: 'needs_verification.nelson.neurology.encephalitis' },
    ],
    route_he: 'התרעה דחופה: חדר מיון ילדים / טיפול נמרץ ילדים.',
  }),
  Object.freeze({
    pattern_key: 'eeg.status_epilepticus',
    title_he: 'חשד ל-Status Epilepticus (הגדרה תפעולית)',
    suspicion: 'red',
    emergency: true,
    source_anchor: 'needs_verification.ilae.se.status_epilepticus',
    extra_anchors: [
      'needs_verification.aes.guideline.status_epilepticus',
      'needs_verification.nelson.neurology.status_epilepticus',
    ],
    differential: [
      {
        direction_id: 'EEG-SE1',
        diagnosis_direction_he: 'Status epilepticus — מצב חירום, לא אבחנת תסמונת',
        vs_he: 'משך פרכוס / חזרות בלי חזרה להכרה לפי תיעוד קליני+EEG',
      },
    ],
    workup: [
      { test_he: 'הפניה מיידית לחדר מיון / טיפול נמרץ ילדים — טיפול לפי פרוטוקול מקומי מאומת', source_anchor: 'needs_verification.aes.guideline.status_epilepticus' },
    ],
    route_he: 'התרעה דחופה: חדר מיון ילדים / טיפול נמרץ ילדים. אין לנהל בקהילה.',
  }),
  Object.freeze({
    pattern_key: 'eeg.encephalopathy',
    title_he: 'רקע מואט/לא-מאורגן — חשד לאנצפלופתיה',
    suspicion: 'red',
    emergency: true,
    source_anchor: 'needs_verification.nelson.neurology.encephalopathy',
    extra_anchors: [
      'needs_verification.ilae.eeg.encephalopathy',
      'needs_verification.aes.guideline.encephalitis',
    ],
    differential: [
      {
        direction_id: 'EEG-E1',
        diagnosis_direction_he: 'אנצפלופתיה / אנצפליטיס — כיוון חירום',
        vs_he: 'ירידת הכרה, חום, או שינוי התנהגות חד',
      },
    ],
    workup: [
      { test_he: 'הפניה דחופה למיון ילדים / טיפול נמרץ', source_anchor: 'needs_verification.aes.guideline.encephalitis' },
      { test_he: 'ייעוץ נוירולוגי דחוף', source_anchor: 'needs_verification.nelson.neurology.encephalopathy' },
    ],
    route_he: 'התרעה דחופה: חדר מיון ילדים / טיפול נמרץ ילדים.',
  }),
]);

function catalogByKey(key) {
  return EEG_PATTERN_CATALOG.find((p) => p.pattern_key === key) ?? null;
}

export function preprocessEeg(signal = {}, { ageDays = null, state = null } = {}) {
  const sampleRate = Number(signal.sampleRate);
  const samples = asFloatSamples(signal.samples);
  if (!Number.isFinite(sampleRate) || sampleRate < 32) return fail('invalid_sample_rate');
  if (!samples || samples.length < Math.round(sampleRate * 1)) return fail('eeg_too_short');

  const nyquist = sampleRate / 2;
  const total = bandPower(samples, sampleRate, 0.5, Math.min(30, nyquist - 0.5));
  if (!(total > 0)) return fail('no_spectral_energy');

  const bands = {};
  for (const [key, spec] of Object.entries(EEG_BANDS)) {
    const hi = Math.min(spec.hz[1], nyquist - 0.1);
    const lo = spec.hz[0];
    if (hi <= lo) {
      bands[key] = { relative_energy: null, label_he: spec.label_he, skipped: 'nyquist' };
      continue;
    }
    const rel = bandPower(samples, sampleRate, lo, hi) / total;
    bands[key] = { hz: [lo, hi], relative_energy: round3(rel), label_he: spec.label_he };
  }

  const ranked = Object.entries(bands)
    .filter(([, v]) => isNum(v.relative_energy))
    .sort((a, b) => b[1].relative_energy - a[1].relative_energy);
  const dominant = ranked[0]?.[0] ?? null;
  const age = eegAgeBand(ageDays);
  let ageNote = null;
  let unexpected_slowing = false;
  if (age && dominant) {
    if (dominant === age.expected_dominant || (age.expected_dominant === 'delta' && dominant === 'theta')) {
      ageNote = `דומיננטיות ${dominant} תואמת-גיל ל${age.label_he} (סריקה, לא אבחנה).`;
    } else if (age.alpha_expected && dominant === 'delta') {
      unexpected_slowing = true;
      ageNote = `דומיננטיות Delta בגיל שבו מצופה Alpha אחורי — האטה אפשרית (טיוטה).`;
    } else {
      ageNote = `דומיננטיות ${dominant}; מצופה ${age.expected_dominant} ל${age.label_he} (סריקה בלבד).`;
    }
  }

  const hz3 = bandPower(samples, sampleRate, 2.5, 3.5) / total;
  const energies = windowEnergies(samples, sampleRate, 0.4);
  const meanE = energies.length ? energies.reduce((s, x) => s + x, 0) / energies.length : 0;
  const maxE = energies.length ? Math.max(...energies) : 0;
  const minE = energies.length ? Math.min(...energies) : 0;
  const bursty = meanE > 0 && maxE > 4 * meanE && minE < 0.15 * meanE && energies.length >= 6;

  return {
    ok: true,
    sampleRate,
    duration_s: round3(samples.length / sampleRate),
    state: state || null,
    bands,
    dominant_band: dominant,
    age_band: age,
    age_note_he: ageNote,
    unexpected_slowing_for_age: unexpected_slowing,
    periodicity_3hz_relative: round3(hz3),
    possible_3hz_lock: hz3 >= 0.22,
    possible_burst_suppression_texture: bursty,
    verification_status: DRAFT,
    note_he: 'פסי תדר יחסיים לפי גיל — אינם פענוח EEG ואינם אבחנה.',
  };
}

function truthy(v) {
  return v === true || v === 'present' || v === 'yes' || v === 1;
}

function spikeWaveHz(annotations) {
  const sw = annotations?.spike_wave ?? annotations?.spike_and_wave;
  if (!sw) return null;
  if (isNum(sw.frequency_hz)) return sw.frequency_hz;
  if (isNum(sw)) return sw;
  return null;
}

/**
 * התאמת תבניות: קריטריונים על אנוטציות שנמסרו + רמזי אות (טיוטה).
 * אין אבחנה מאנוטציה בודדת בלי גיל/קליניקה כשנדרש.
 */
export function matchEegPatterns({ annotations = {}, bands = null, ageDays = null, findings = [] } = {}) {
  const matched = [];
  const notes = [];
  const age = eegAgeBand(ageDays);
  const text = findings.map((f) => String(f).toLowerCase()).join(' ');

  const add = (key, evidence_he) => {
    const cat = catalogByKey(key);
    if (!cat) return;
    matched.push({
      ...cat,
      evidence_he,
      verification_status: DRAFT,
      extra_anchors: [...(cat.extra_anchors ?? [])],
    });
  };

  if (truthy(annotations.hypsarrhythmia) || /hypsarrhythmia|היפסאריתמיה|west/.test(text)) {
    add('eeg.hypsarrhythmia', 'אנוטציה/ממצא של Hypsarrhythmia');
  }

  const swHz = spikeWaveHz(annotations);
  if (truthy(annotations.absence) || (isNum(swHz) && swHz >= 2.5 && swHz <= 3.5) || bands?.possible_3hz_lock) {
    add('eeg.absence_3hz', isNum(swHz) ? `spike-wave מדווח ב-${swHz}Hz` : 'מחזוריות ~3Hz או אנוטציית absence');
  }

  if (truthy(annotations.spikes) || (Array.isArray(annotations.spikes) && annotations.spikes.length) || /spike|ספייק/.test(text)) {
    add('eeg.spikes', 'ספייקים דווחו באנוטציה או בממצאים');
  }

  if (truthy(annotations.focal_slowing) || annotations.focal_slowing?.present) {
    add('eeg.focal_slowing', `האטה מוקדית${annotations.focal_slowing?.region ? ` (${annotations.focal_slowing.region})` : ''}`);
  } else if (bands?.unexpected_slowing_for_age) {
    notes.push('האטה כללית אפשרית לגיל — לא סומנה כמוקדית בלי מיקום.');
  }

  if (truthy(annotations.burst_suppression) || bands?.possible_burst_suppression_texture) {
    add('eeg.burst_suppression', annotations.burst_suppression
      ? 'אנוטציית burst-suppression'
      : 'מרקם burst/flat באות — טיוטה, דורש קריאת EEG');
  }

  const dur = Number(annotations.seizure_duration_min ?? annotations.duration_min);
  const seClinical = truthy(annotations.status_epilepticus) || truthy(annotations.ongoing_seizure);
  // ILAE operational (convulsive): ≥5 min — cited, draft until verified locally.
  if (seClinical || (isNum(dur) && dur >= 5)) {
    add('eeg.status_epilepticus', isNum(dur)
      ? `משך פרכוס מדווח ${dur} דקות (הגדרה תפעולית ILAE — לאימות)`
      : 'אנוטציה קלינית של status / פרכוס מתמשך');
  }

  const enceph = truthy(annotations.encephalopathy) || truthy(annotations.encephalitis)
    || /encephalopath|encephalitis|אנצפלופת|אנצפליט/.test(text)
    || annotations.background === 'disorganized' || annotations.background === 'suppressed';
  if (enceph) {
    add('eeg.encephalopathy', 'רקע לא-מאורגן/מודחק או ממצא קליני של אנצפלופתיה');
  }

  if (age?.key === 'neonate' && bands?.dominant_band === 'delta') {
    notes.push('Delta דומיננטי בילוד עשוי להיות תואם-גיל — לא לפרש כהאטה פתולוגית אוטומטית.');
  }

  const seen = new Set();
  const uniq = [];
  for (const m of matched) {
    if (seen.has(m.pattern_key)) continue;
    seen.add(m.pattern_key);
    uniq.push(m);
  }
  return { matched: uniq, notes };
}

function patternToKbItem(p) {
  const extra = (p.extra_anchors ?? []).map((a) => attachLiteratureCitation({ source_anchor: a }).literature_citation?.display_he).filter(Boolean);
  return {
    pattern_key: p.pattern_key,
    title_he: p.title_he,
    direction_he: p.differential?.[0]?.diagnosis_direction_he ?? p.title_he,
    suspicion: p.suspicion,
    clinical_reasoning_he: p.evidence_he,
    recommended_workup_he: (p.workup ?? []).map((w) => w.test_he),
    source_anchor: p.source_anchor,
    extra_anchors: p.extra_anchors ?? [],
    verification_status: DRAFT,
    summary_he: extra.length ? `עיגון נוסף: ${extra.join('; ')}` : null,
  };
}

function buildRedFlags(matched) {
  return matched.filter((p) => p.emergency).map((p) => ({
    flag_key: p.pattern_key,
    label_he: p.title_he,
    severity: 'critical',
    suspicion: 'red',
    action_he: p.route_he || 'הפניה דחופה למיון ילדים / טיפול נמרץ ילדים',
    source_anchor: p.source_anchor,
    extra_anchors: p.extra_anchors ?? [],
    verification_status: DRAFT,
    unverified_model_flag: false,
  }));
}

function flattenDifferential(matched) {
  const out = [];
  for (const p of matched) {
    for (const d of p.differential ?? []) {
      out.push({
        ...d,
        source_anchors: [p.source_anchor, ...(p.extra_anchors ?? [])],
        fact_refs: [],
        supports_he: [p.evidence_he || p.title_he],
        refutes_he: [d.vs_he],
        based_on_patterns: [p.pattern_key],
        verification_status: DRAFT,
      });
    }
  }
  return out;
}

function flattenWorkup(matched) {
  const out = [];
  const seen = new Set();
  for (const p of matched) {
    for (const w of p.workup ?? []) {
      const key = w.test_he;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        test_he: w.test_he,
        source_anchor: w.source_anchor || p.source_anchor,
        verification_status: DRAFT,
      });
    }
  }
  return out;
}

function bandsToFacts(bands) {
  if (!bands?.ok) return [];
  const facts = [];
  for (const [key, b] of Object.entries(bands.bands || {})) {
    if (!isNum(b.relative_energy)) continue;
    facts.push({
      key: `eeg_band_${key}`,
      label_he: `פס ${b.label_he}`,
      value: b.relative_energy,
      unit: 'relative_energy',
    });
  }
  if (bands.dominant_band) {
    facts.push({ key: 'eeg_dominant_band', label_he: 'פס דומיננטי', value: bands.dominant_band });
  }
  if (bands.age_band) {
    facts.push({ key: 'eeg_age_band', label_he: 'פס גיל EEG', value: bands.age_band.label_he });
  }
  return facts;
}

function annotationsToFacts(annotations = {}) {
  const facts = [];
  for (const [k, v] of Object.entries(annotations)) {
    if (v == null || v === false) continue;
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    facts.push({ key: `eeg_ann_${k}`, label_he: `אנוטציית EEG: ${k}`, value: val });
  }
  return facts;
}

/**
 * @param {object} params
 * @param {object} [params.patient]
 * @param {object} [params.signal] { samples, sampleRate }
 * @param {object} [params.annotations]
 * @param {string[]} [params.findings]
 * @param {string} [params.state] wake|sleep
 * @param {string} [params.mode] clinical|development
 */
export function runEegInterpreter({
  patient = {},
  signal = null,
  annotations = {},
  findings = [],
  state = null,
  mode = 'development',
  locale = 'he',
} = {}) {
  const ageDays = toAgeDays(patient);
  const hasSignal = signal && (signal.samples || signal.channels);
  const hasAnn = annotations && Object.keys(annotations).length > 0;
  const hasFindings = (findings ?? []).some(Boolean);
  if (!hasSignal && !hasAnn && !hasFindings) {
    return finalizeLocale(fail('no_eeg_input', { message_he: 'לא סופק אות EEG, אנוטציות או ממצאים. אין מה לפענח.' }), locale);
  }

  let bands = null;
  if (hasSignal) {
    const chan = signal.channels?.[0] ?? signal;
    bands = preprocessEeg(chan, { ageDays, state });
    if (hasSignal && !hasAnn && !hasFindings && !bands.ok) return finalizeLocale(bands, locale);
  }

  const { matched, notes } = matchEegPatterns({ annotations, bands: bands?.ok ? bands : null, ageDays, findings });
  const kbItems = matched.map(patternToKbItem);
  const red_flags = buildRedFlags(matched);
  const differential = flattenDifferential(matched);
  const recommended_tests = flattenWorkup(matched);
  const patientData = [
    ...bandsToFacts(bands),
    ...annotationsToFacts(annotations),
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
  ];

  const factBlock = buildFactBlock({ kbItems, patientData, mode });
  const emergency = red_flags.length > 0;

  return finalizeLocale({
    ok: true,
    engine: 'eeg_interpreter',
    verification_status: DRAFT,
    age_days: ageDays,
    age_band: eegAgeBand(ageDays),
    bands: bands?.ok ? bands : bands,
    matched_patterns: matched.map((p) => p.pattern_key),
    kbItems,
    red_flags,
    safety_alerts: red_flags,
    emergency,
    differential,
    recommended_tests,
    notes_he: [
      ...(notes ?? []),
      ...(bands?.age_note_he ? [bands.age_note_he] : []),
      ...(bands?.note_he ? [bands.note_he] : []),
      'כלי תמיכה בהחלטות — אינו פענוח EEG רשמי ואינו אבחנה.',
    ],
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    unknowns_he: matched.length ? [] : ['לא הותאמה תבנית פתולוגית מהקלט שסופק — אין משמעות של "תקין".'],
  }, locale);
}
