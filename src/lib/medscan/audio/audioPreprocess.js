/**
 * DoctorPedAI — Pre-processing לאותות קול (סינון תדרי דרכי אוויר)
 *
 * מזהה **אנרגיה יחסית** בפסים הקשורים ל-Stridor, Wheezing, Crackles
 * ושיעול חנקני/קרופי. אינו מאבחן. כישלון → `{ ok:false }`.
 *
 * קלט: PCM `{ samples: Float32Array|number[], sampleRate: number }`
 */

import { t, finalizeLocale } from '../i18n/localize.js';

const DRAFT = 'draft_needs_verification';

/** פסי סריקה בלבד — לא ספי אבחנה. */
export const AUDIO_BANDS = Object.freeze({
  stridor: { hz: [150, 1000], i18n_key: 'audio.stridor', label_he: 'Stridor (פס גבוה יחסי)' },
  wheeze: { hz: [100, 800], i18n_key: 'audio.wheeze', label_he: 'Wheeze (פס מוזיקלי יחסי)' },
  crackles: { hz: [200, 2000], i18n_key: 'audio.crackles', label_he: 'Crackles (פס טרנזיינט גבוה)' },
  choking_croup_cough: { hz: [80, 400], i18n_key: 'audio.choking_croup_cough', label_he: 'שיעול חנקני/קרופי (פס נמוך-בינוני)' },
});

function fail(reason, extra = {}, locale = 'he') {
  return finalizeLocale({ ok: false, reason, verification_status: 'unavailable', ...extra }, locale);
}

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
  const n = Math.max(3, Math.round((hi - lo) / 80) + 1);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const f = lo + ((hi - lo) * i) / (n - 1 || 1);
    if (f <= 0 || f >= sampleRate / 2) continue;
    acc += goertzelPower(samples, sampleRate, f);
  }
  return acc;
}

/** שונות אנרגיה בזמן קצר — סמן לשיעול/טרנזיינט, לא לאבחנה. */
function burstIndex(samples, sampleRate) {
  const win = Math.max(32, Math.round(sampleRate * 0.02));
  if (samples.length < win * 4) return null;
  const energies = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let e = 0;
    for (let j = 0; j < win; j++) e += samples[i + j] * samples[i + j];
    energies.push(e / win);
  }
  const mean = energies.reduce((s, x) => s + x, 0) / energies.length;
  if (mean <= 0) return 0;
  let varSum = 0;
  for (const e of energies) varSum += (e - mean) * (e - mean);
  const variance = varSum / energies.length;
  return Math.sqrt(variance) / mean;
}

/**
 * @param {{ samples: ArrayLike<number>, sampleRate: number, locale?: string }} signal
 */
export function preprocessAudio(signal = {}) {
  const locale = signal.locale ?? 'he';
  const sampleRate = Number(signal.sampleRate);
  const samples = asFloatSamples(signal.samples);
  if (!Number.isFinite(sampleRate) || sampleRate < 2000) {
    return fail('invalid_sample_rate', {}, locale);
  }
  if (!samples || samples.length < Math.round(sampleRate * 0.15)) {
    return fail('audio_too_short', {}, locale);
  }

  const nyquist = sampleRate / 2;
  const total = bandPower(samples, sampleRate, 40, Math.min(nyquist - 1, 2500));
  if (!(total > 0)) return fail('no_spectral_energy', {}, locale);

  const bands = {};
  for (const [key, spec] of Object.entries(AUDIO_BANDS)) {
    const lo = spec.hz[0];
    const hi = Math.min(spec.hz[1], nyquist - 1);
    if (hi <= lo) {
      bands[key] = {
        relative_energy: null, elevated: false, skipped: 'nyquist',
        i18n_key: spec.i18n_key, label_he: t(locale, spec.i18n_key),
      };
      continue;
    }
    const p = bandPower(samples, sampleRate, lo, hi);
    const rel = p / total;
    bands[key] = {
      hz: [lo, hi],
      relative_energy: Math.round(rel * 1000) / 1000,
      elevated: rel >= 0.22,
      i18n_key: spec.i18n_key,
      label_he: t(locale, spec.i18n_key),
      verification_status: DRAFT,
    };
  }

  const burst = burstIndex(samples, sampleRate);
  if (burst != null && bands.choking_croup_cough) {
    bands.choking_croup_cough.burst_index = Math.round(burst * 1000) / 1000;
    if (burst >= 1.1) bands.choking_croup_cough.elevated = true;
  }

  const elevated = Object.entries(bands)
    .filter(([, v]) => v.elevated)
    .map(([k]) => k);

  return finalizeLocale({
    ok: true,
    sampleRate,
    duration_s: Math.round((samples.length / sampleRate) * 1000) / 1000,
    bands,
    elevated_bands: elevated,
    verification_status: DRAFT,
    i18n_key: 'audio.note',
    note_he: t(locale, 'audio.note'),
  }, locale);
}

export function audioFeaturesToPatientFacts(features) {
  if (!features?.ok) return [];
  const facts = [];
  for (const [key, band] of Object.entries(features.bands || {})) {
    if (band.relative_energy == null) continue;
    facts.push({
      key: `audio_${key}_energy`,
      label_he: band.label_he,
      value: band.relative_energy,
      unit: 'relative_energy',
      flag: band.elevated ? 'high' : 'normal',
    });
  }
  return facts;
}

export const runAudioPipeline = preprocessAudio;
