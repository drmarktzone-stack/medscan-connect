/**
 * DoctorPedAI — חילוץ מאפייני גל ECG לילדים
 *
 * QTc, שינויי ST/T, תבניות SVT אפשריות, והפרעות הולכה — כסמני סריקה.
 * כל מספר קליני מחושב בקוד (ecgMicroMeasure / flagEcgNormals).
 * אין אבחנת SVT מסף מומצא: מסומן רק טכיקרדיה יחסית לגיל + QRS צר + סדיר.
 */

import { detectRPeaks, rateFromPeaks } from '../../ecgDigitize.js';
import { flagEcgNormals } from '../../ecgNormals.js';
import {
  computeIntervals,
  heartRate,
  qtc as computeQtc,
  runMicroMeasure,
} from '../engines/ecgMicroMeasure.js';

const DRAFT = 'draft_needs_verification';
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function fail(reason, extra = {}) {
  return { ok: false, reason, verification_status: 'unavailable', ...extra };
}

function asFloatSamples(samples) {
  if (!samples) return null;
  if (samples instanceof Float32Array) return samples;
  if (ArrayBuffer.isView(samples)) return Float32Array.from(samples);
  if (Array.isArray(samples)) return Float32Array.from(samples, (x) => Number(x));
  return null;
}

/**
 * הערכת ST/T יחסית אחרי שיא R — סמן גס, טיוטה, לא מדידת מ״מ.
 * דורש אות 1-D מכויל-זמן (sampleRate), לא תמונה.
 */
export function extractSttHints(samples, sampleRate, peaks) {
  if (!samples?.length || !sampleRate || !peaks?.length) {
    return { ok: false, reason: 'insufficient_stt_input', verification_status: DRAFT };
  }
  const stOffsets = [
    Math.round(sampleRate * 0.06),
    Math.round(sampleRate * 0.08),
  ];
  const tOffset = Math.round(sampleRate * 0.16);
  const jDeltas = [];
  const tDeltas = [];
  for (const r of peaks) {
    const baseStart = Math.max(0, r - Math.round(sampleRate * 0.04));
    let base = 0;
    let n = 0;
    for (let i = baseStart; i < r; i++) {
      base += samples[i];
      n += 1;
    }
    if (!n) continue;
    base /= n;
    for (const off of stOffsets) {
      const i = r + off;
      if (i < samples.length) jDeltas.push(samples[i] - base);
    }
    const ti = r + tOffset;
    if (ti < samples.length) tDeltas.push(samples[ti] - base);
  }
  if (jDeltas.length < 3) {
    return { ok: false, reason: 'too_few_beats', verification_status: DRAFT };
  }
  const mean = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length;
  const j = mean(jDeltas);
  const t = tDeltas.length ? mean(tDeltas) : null;
  const amp = Math.max(...samples.map((x) => Math.abs(x)), 1e-6);
  const jRel = j / amp;
  const tRel = t == null ? null : t / amp;
  return {
    ok: true,
    st_relative: Math.round(jRel * 1000) / 1000,
    t_relative: tRel == null ? null : Math.round(tRel * 1000) / 1000,
    possible_st_change: Math.abs(jRel) >= 0.08,
    possible_t_inversion: tRel != null && tRel < -0.06,
    verification_status: DRAFT,
    note_he: 'רמזי ST/T יחסיים מגל — טיוטה. אינם מדידת מ״מ ואינם אבחנת איסכמיה.',
  };
}

function qrsWidthHint(samples, sampleRate, peaks) {
  if (!peaks || peaks.length < 2) return null;
  const half = Math.round(sampleRate * 0.06);
  const widths = [];
  for (const r of peaks) {
    let left = r;
    let right = r;
    const thr = Math.abs(samples[r]) * 0.2;
    while (left > r - half && left > 0 && Math.abs(samples[left]) > thr) left -= 1;
    while (right < r + half && right < samples.length - 1 && Math.abs(samples[right]) > thr) right += 1;
    widths.push(((right - left) / sampleRate) * 1000);
  }
  if (!widths.length) return null;
  widths.sort((a, b) => a - b);
  return Math.round(widths[Math.floor(widths.length / 2)]);
}

/**
 * תבנית SVT אפשרית: טכיקרדיה יחסית לגיל (מ-flagEcgNormals) + QRS לא-רחב + סדיר.
 * אין סף BPM מומצא מעבר לנורמת הגיל הקיימת.
 */
export function possibleSvtPattern({ hrBpm, qrsMs, regular = true, ageYears }) {
  const structured = {
    intervals: { qrs_ms: qrsMs ?? null },
    rhythm_and_rate: { heart_rate_bpm_calculated: hrBpm },
  };
  const flags = flagEcgNormals(structured, { ageYears });
  const tachy = (flags?.flags || []).some((f) => f.param === 'HR' && /טכיקרדיה/.test(f.note_he || ''));
  const wide = (flags?.flags || []).some((f) => f.param === 'QRS');
  const flagged = Boolean(tachy && regular && !wide && isNum(hrBpm));
  return {
    flagged,
    regular: Boolean(regular),
    tachycardia_for_age: Boolean(tachy),
    qrs_not_wide_for_age: !wide,
    verification_status: DRAFT,
    note_he:
      'תבנית SVT אפשרית כסמן סריקה בלבד (טכיקרדיה לגיל + QRS לא-רחב + סדיר). ' +
      'אינה אבחנה ואינה משתמשת בסף BPM נפרד מעבר לנורמת הגיל.',
  };
}

export function conductionFlags({ prMs, qrsMs, ageYears, sex }) {
  const structured = {
    intervals: { pr_ms: prMs ?? null, qrs_ms: qrsMs ?? null },
    rhythm_and_rate: {},
  };
  const flags = flagEcgNormals(structured, { ageYears, sex });
  const pr = (flags?.flags || []).some((f) => f.param === 'PR');
  const qrs = (flags?.flags || []).some((f) => f.param === 'QRS');
  return {
    possible_av_delay: pr,
    possible_intraventricular_delay: qrs,
    age_band: flags?.band?.label_he ?? null,
    flags: flags?.flags ?? [],
    verification_status: flags ? DRAFT : 'unavailable',
    note_he: 'הפרעות הולכה מסומנות מול נורמת גיל קיימת — סריקה, לא אבחנת חסם.',
  };
}

/**
 * @param {object} input
 * @param {ArrayLike<number>} [input.samples]
 * @param {number} [input.sampleRate]
 * @param {object} [input.fiducials]
 * @param {object} [input.calibration]
 * @param {number} [input.ageYears]
 * @param {string} [input.sex]
 * @param {boolean} [input.regular]
 */
export function extractEcgWaveformFeatures(input = {}) {
  const ageYears = input.ageYears;
  const sex = input.sex;
  const notes = [];

  let measured = null;
  if (input.fiducials && input.calibration) {
    measured = runMicroMeasure({
      calibration: input.calibration,
      fiducials: input.fiducials,
      leadNet: input.leadNet || {},
    });
  }

  const samples = asFloatSamples(input.samples);
  const sampleRate = Number(input.sampleRate);
  let peaks = [];
  let hrFromWave = null;
  if (samples && Number.isFinite(sampleRate) && sampleRate >= 50 && samples.length >= 20) {
    peaks = detectRPeaks(samples, sampleRate);
    hrFromWave = rateFromPeaks(peaks, sampleRate);
  } else if (samples && !Number.isFinite(sampleRate)) {
    return fail('invalid_sample_rate');
  }

  let qt_ms = measured?.intervals?.qt_ms ?? (isNum(input.qt_ms) ? input.qt_ms : null);
  let rr_ms = measured?.rate?.rr_ms ?? (isNum(input.rr_ms) ? input.rr_ms : null);
  let pr_ms = measured?.intervals?.pr_ms ?? (isNum(input.pr_ms) ? input.pr_ms : null);
  let qrs_ms = measured?.intervals?.qrs_ms ?? (isNum(input.qrs_ms) ? input.qrs_ms : null);
  let hr_bpm = measured?.rate?.hr_bpm ?? hrFromWave ?? (isNum(input.hr_bpm) ? input.hr_bpm : null);

  if (!isNum(rr_ms) && isNum(hr_bpm) && hr_bpm > 0) rr_ms = Math.round(60000 / hr_bpm);
  if (!isNum(qrs_ms) && samples && sampleRate && peaks.length) {
    qrs_ms = qrsWidthHint(samples, sampleRate, peaks);
  }

  if (!measured && input.fiducials && isNum(input.ms_per_px)) {
    const iv = computeIntervals(input.fiducials, input.ms_per_px);
    const rate = heartRate(input.fiducials.rr_px, input.ms_per_px);
    qt_ms = iv.qt_ms;
    pr_ms = iv.pr_ms;
    qrs_ms = iv.qrs_ms;
    rr_ms = rate.rr_ms;
    hr_bpm = rate.hr_bpm;
  }

  const qtcVals = computeQtc({ qt_ms, rr_ms });
  if (measured && measured.measurable === false) {
    notes.push(...(measured.notes || []));
  }

  if (!isNum(hr_bpm) && !isNum(qt_ms) && !samples && !measured) {
    return fail('insufficient_waveform_input');
  }

  const stt = samples && sampleRate && peaks.length
    ? extractSttHints(samples, sampleRate, peaks)
    : { ok: false, reason: 'no_waveform_for_stt', verification_status: DRAFT };

  const qtcStructured = {
    intervals: {
      pr_ms,
      qrs_ms,
      qt_ms,
      qtc_bazett_ms: qtcVals.bazett,
    },
    rhythm_and_rate: { heart_rate_bpm_calculated: hr_bpm },
  };
  const ageFlags = flagEcgNormals(qtcStructured, { ageYears, sex });

  const rrIntervals = [];
  if (peaks.length >= 3 && sampleRate) {
    for (let i = 1; i < peaks.length; i++) {
      rrIntervals.push((peaks[i] - peaks[i - 1]) / sampleRate);
    }
  }
  let regular = input.regular;
  if (regular == null && rrIntervals.length >= 2) {
    const mean = rrIntervals.reduce((s, x) => s + x, 0) / rrIntervals.length;
    const maxDev = Math.max(...rrIntervals.map((x) => Math.abs(x - mean)));
    regular = mean > 0 ? maxDev / mean < 0.12 : true;
  }
  if (regular == null) regular = true;

  const svt = possibleSvtPattern({ hrBpm: hr_bpm, qrsMs: qrs_ms, regular, ageYears });
  const conduction = conductionFlags({ prMs: pr_ms, qrsMs: qrs_ms, ageYears, sex });

  const qtcFlag = (ageFlags?.flags || []).some((f) => f.param === 'QTc');

  return {
    ok: true,
    measurable: Boolean(isNum(hr_bpm) || isNum(qt_ms)),
    intervals: { pr_ms, qrs_ms, qt_ms, rr_ms },
    rate: { hr_bpm, peak_count: peaks.length },
    qtc: {
      bazett: qtcVals.bazett,
      fridericia: qtcVals.fridericia,
      prolonged_for_age: qtcFlag,
      verification_status: isNum(qtcVals.bazett) ? 'measured' : 'unavailable',
    },
    st_t: stt,
    svt_pattern: svt,
    conduction,
    age_flags: ageFlags?.flags ?? [],
    age_band: ageFlags?.band?.label_he ?? null,
    notes: [...notes, ...(ageFlags?.warnings || [])],
    verification_status: DRAFT,
    note_he: 'מאפייני גל דטרמיניסטיים לסריקה בילדים. אינם אבחנה סופית.',
  };
}

export function ecgFeaturesToPatientFacts(features) {
  if (!features?.ok) return [];
  const iv = features.intervals || {};
  const facts = [];
  if (isNum(features.rate?.hr_bpm)) {
    facts.push({ key: 'ecg_hr_wave', label_he: 'דופק מגל', value: features.rate.hr_bpm, unit: 'bpm' });
  }
  if (isNum(iv.qt_ms)) facts.push({ key: 'ecg_qt_ms', label_he: 'QT', value: iv.qt_ms, unit: 'ms' });
  if (isNum(features.qtc?.bazett)) {
    facts.push({
      key: 'ecg_qtc_bazett',
      label_he: 'QTc (Bazett)',
      value: features.qtc.bazett,
      unit: 'ms',
      flag: features.qtc.prolonged_for_age ? 'high' : 'normal',
    });
  }
  if (isNum(iv.pr_ms)) facts.push({ key: 'ecg_pr_ms', label_he: 'PR', value: iv.pr_ms, unit: 'ms' });
  if (isNum(iv.qrs_ms)) facts.push({ key: 'ecg_qrs_ms', label_he: 'QRS', value: iv.qrs_ms, unit: 'ms' });
  facts.push({
    key: 'ecg_svt_pattern_flag',
    label_he: 'תבנית SVT אפשרית (סריקה)',
    value: features.svt_pattern?.flagged ? 'flagged' : 'not_flagged',
  });
  return facts;
}
