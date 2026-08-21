/**
 * DoctorPedAI — מנוע פענוח נוזל שדרה בילדים ותינוקות (Pediatric CSF)
 *
 * דטרמיניסטי, ללא LLM. פענוח LP לפי ספירת WBC+דיפרנציאל, חלבון,
 * יחס גלוקוז CSF/דם, וצביעת גראם. טווחי ייחוס **רק** מ-SEED_RANGES
 * (טיוטה לאימות — לא גיליון המעבדה המקומית).
 *
 * אבחנה מבדלת: Bacterial / Viral-Aseptic / Fungal (אנוטציה) / Traumatic tap.
 * דלקת חיידקית → התרעת חירום לאנטיביוטיקה אמפירית לפי פרוטוקול מקומי.
 * אין שמות תרופות ואין מינונים.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { SEED_RANGES } from '../deterministic/referenceRangeSeed.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

const fail = (reason, extra = {}) => ({
  ok: false,
  reason,
  verification_status: 'unavailable',
  disclaimer_he: DISCLAIMER_HE,
  ...extra,
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

const NELSON_BACTERIAL = 'needs_verification.nelson.infectious_disease.bacterial_meningitis';
const NELSON_ASEPTIC = 'needs_verification.nelson.infectious_disease.aseptic_meningitis';
const NELSON_FUNGAL = 'needs_verification.nelson.infectious_disease.fungal_meningitis';
const NELSON_LP = 'needs_verification.nelson.neurology.lumbar_puncture';
const NELSON_CSF_REF = 'needs_verification.nelson.neurology.csf_reference_ranges';

export function seedRangeFor(analyte, ageDays) {
  const row = SEED_RANGES.find((r) => r.analyte === analyte);
  if (!row) return { ok: false, reason: 'unknown_analyte' };
  if (!isNum(ageDays)) return { ok: false, reason: 'age_required', row };
  const band = row.bands.find(
    (b) => ageDays >= b.age_min_days && ageDays <= b.age_max_days,
  );
  if (!band) return { ok: false, reason: 'no_band', row };
  return {
    ok: true,
    row,
    band,
    low: band.low,
    high: band.high,
    unit: row.unit,
    verification_status: DRAFT,
  };
}

function flagAgainstBand(value, band) {
  if (!isNum(value) || !band?.ok) return null;
  if (isNum(band.high) && value > band.high) return 'high';
  if (isNum(band.low) && value < band.low) return 'low';
  return 'in_range';
}

function pickNum(...vals) {
  for (const v of vals) {
    if (isNum(v)) return v;
    const n = Number(v);
    if (v != null && v !== '' && isNum(n)) return n;
  }
  return null;
}

/**
 * נוסחת תיקון דיקור טראומטי (חשבון, לא סף אבחוני):
 * WBC_corr = WBC_csf − (WBC_blood × RBC_csf / RBC_blood)
 */
export function correctedCsfWbc({ wbc_csf, rbc_csf, wbc_blood, rbc_blood }) {
  if (![wbc_csf, rbc_csf, wbc_blood, rbc_blood].every(isNum)) {
    return { ok: false, reason: 'missing_blood_counts' };
  }
  if (rbc_blood <= 0) return { ok: false, reason: 'rbc_blood_zero' };
  const raw = wbc_csf - (wbc_blood * rbc_csf) / rbc_blood;
  const value = Math.max(0, Math.round(raw * 10) / 10);
  return {
    ok: true,
    key: 'csf_wbc_corrected',
    label_he: 'WBC ב-CSF מתוקן לדיקור טראומטי',
    value,
    unit: '/µL',
    formula_source: 'WBC_csf - (WBC_blood * RBC_csf / RBC_blood)',
  };
}

function gramPositive(gram) {
  if (gram == null || gram === false) return false;
  if (gram === true) return true;
  const s = String(gram).toLowerCase();
  if (!s.trim()) return false;
  if (/no[_\s-]?organism|negative|none|אין|שלילית|ללא/.test(s) && !/positive|חיובי|cocci|rod|bacill/.test(s)) {
    return false;
  }
  return /positive|organism|cocci|rod|bacill|diplococ|חיובי|חיידק|אורגניזם/.test(s);
}

function pmnPredominant(csf) {
  const n = pickNum(csf.neutrophils_pct, csf.pmn_pct, csf.neutrophil_percent);
  const l = pickNum(csf.lymphocytes_pct, csf.lymph_pct);
  const diff = String(csf.differential ?? csf.diff ?? '').toLowerCase();
  if (/pmn|neutrophil|נויטרופ/.test(diff)) return true;
  if (/lymph|לימפו/.test(diff)) return false;
  if (isNum(n) && n >= 50) return true;
  if (isNum(l) && l >= 50) return false;
  return null;
}

function fungalAnnotated(csf = {}, findings = []) {
  const blob = [
    csf.fungal_elements, csf.india_ink, csf.cryptococcal_ag, csf.yeast,
    ...(findings ?? []),
  ].map((x) => String(x ?? '').toLowerCase()).join(' | ');
  if (csf.fungal_elements === true || csf.india_ink === true || csf.cryptococcal_ag === true) return true;
  return /fungal|india.?ink|cryptococ|yeast|פטרי|קריפטוקוק/.test(blob);
}

export function classifyCsfPattern({
  ageDays,
  wbc,
  rbc,
  protein,
  glucose,
  glucoseRatio,
  gram_stain,
  pmn,
  fungal,
  corrected,
}) {
  const wbcBand = seedRangeFor('csf_wbc', ageDays);
  const proteinBand = seedRangeFor('csf_protein', ageDays);
  const ratioBand = seedRangeFor('csf_glucose_ratio', isNum(ageDays) ? ageDays : 365);
  const rbcBand = seedRangeFor('csf_rbc', isNum(ageDays) ? ageDays : 0);
  const gluBand = seedRangeFor('csf_glucose', ageDays);

  const wbcFlag = flagAgainstBand(wbc, wbcBand);
  const proteinFlag = flagAgainstBand(protein, proteinBand);
  const ratioFlag = flagAgainstBand(glucoseRatio, ratioBand);
  const rbcFlag = flagAgainstBand(rbc, rbcBand);
  const glucoseFlag = flagAgainstBand(glucose, gluBand);

  const wbcHigh = wbcFlag === 'high';
  const proteinHigh = proteinFlag === 'high';
  const ratioLow = ratioFlag === 'low';
  const rbcHigh = rbcFlag === 'high';
  const organisms = gramPositive(gram_stain);

  const bacterialChem = (ratioLow || proteinHigh);
  const bacterial =
    organisms ||
    (wbcHigh && pmn === true && bacterialChem);

  const viral =
    !bacterial &&
    !organisms &&
    wbcHigh &&
    pmn === false &&
    ratioFlag !== 'low';

  const fungalDx = fungal === true && !organisms;

  const correctedInRange =
    corrected?.ok && wbcBand.ok && isNum(corrected.value) && corrected.value <= wbcBand.high;
  const traumatic =
    rbcHigh &&
    !organisms &&
    (correctedInRange || (!corrected?.ok && !bacterial));

  return {
    bacterial,
    viral,
    fungal: fungalDx,
    traumatic,
    organisms,
    wbcHigh,
    proteinHigh,
    ratioLow,
    rbcHigh,
    wbcFlag,
    proteinFlag,
    ratioFlag,
    rbcFlag,
    glucoseFlag,
    wbcBand,
    proteinBand,
    ratioBand,
    rbcBand,
    gluBand,
    incomplete:
      !organisms &&
      (wbc == null || pmn == null || (!isNum(glucoseRatio) && glucose == null && protein == null)),
  };
}

function patternKb({ key, title_he, source_anchor, extra_anchors = [], evidence_he, workup, differential }) {
  const extra = extra_anchors
    .map((a) => attachLiteratureCitation({ source_anchor: a }).literature_citation?.display_he)
    .filter(Boolean);
  return {
    pattern_key: key,
    title_he,
    direction_he: differential?.[0]?.diagnosis_direction_he ?? title_he,
    suspicion: key === 'csf.bacterial' ? 'red' : 'yellow',
    clinical_reasoning_he: evidence_he,
    recommended_workup_he: (workup ?? []).map((w) => w.test_he),
    source_anchor,
    extra_anchors,
    verification_status: DRAFT,
    summary_he: extra.length ? `עיגון נוסף: ${extra.join('; ')}` : null,
    differential,
    workup,
  };
}

/**
 * @param {object} params
 * @param {object} [params.patient]
 * @param {object} [params.csf]
 * @param {object} [params.blood]
 * @param {string[]} [params.findings]
 * @param {string} [params.mode]
 */
export function runCsfInterpreter({
  patient = {},
  csf = {},
  blood = {},
  labs = [],
  findings = [],
  mode = 'development',
  locale = 'he',
} = {}) {
  const ageDays = toAgeDays(patient);
  const wbc = pickNum(csf.wbc, csf.csf_wbc, csf.WBC);
  const rbc = pickNum(csf.rbc, csf.csf_rbc, csf.RBC);
  const protein = pickNum(csf.protein, csf.csf_protein);
  const glucose = pickNum(csf.glucose, csf.csf_glucose);
  const bloodGlucose = pickNum(
    csf.blood_glucose,
    blood.glucose,
    ...labs.filter((l) => /gluc/i.test(String(l.analyte ?? l.key ?? ''))).map((l) => l.value),
  );
  const ratioDirect = pickNum(csf.glucose_ratio, csf.csf_glucose_ratio, csf.ratio);
  const glucoseRatio = isNum(ratioDirect)
    ? ratioDirect
    : (isNum(glucose) && isNum(bloodGlucose) && bloodGlucose > 0 ? glucose / bloodGlucose : null);

  const gram_stain = csf.gram_stain ?? csf.gram ?? csf.Gram;
  const hasAny =
    [wbc, rbc, protein, glucose, glucoseRatio].some(isNum) ||
    gram_stain != null ||
    fungalAnnotated(csf, findings) ||
    (findings ?? []).some(Boolean);

  if (!hasAny) {
    return finalizeLocale(fail('no_csf_input', { message_he: 'לא סופקו ערכי LP / CSF או צביעת גראם.' }), locale);
  }

  const wbcBlood = pickNum(blood.wbc, blood.WBC, csf.blood_wbc);
  const rbcBlood = pickNum(blood.rbc, blood.RBC, csf.blood_rbc);
  const corrected = correctedCsfWbc({
    wbc_csf: wbc,
    rbc_csf: rbc,
    wbc_blood: wbcBlood,
    rbc_blood: rbcBlood,
  });

  const pmn = pmnPredominant(csf);
  const fungal = fungalAnnotated(csf, findings);
  const cls = classifyCsfPattern({
    ageDays,
    wbc,
    rbc,
    protein,
    glucose,
    glucoseRatio,
    gram_stain,
    pmn,
    fungal,
    corrected,
  });

  const matched = [];
  const red_flags = [];

  if (cls.bacterial) {
    const p = patternKb({
      key: 'csf.bacterial',
      title_he: 'דפוס דלקת קרום המוח חיידקית (Bacterial Meningitis)',
      source_anchor: NELSON_BACTERIAL,
      extra_anchors: [NELSON_CSF_REF],
      evidence_he: cls.organisms
        ? 'צביעת גראם חיובית לאורגניזמים — דפוס חיידקי עד שיוכח אחרת'
        : 'WBC גבוה לגיל + שליטת PMN + (יחס גלוקוז נמוך או חלבון גבוה)',
      differential: [
        {
          direction_id: 'CSF-B1',
          diagnosis_direction_he: 'Bacterial Meningitis — כיוון דחוף',
          vs_he: 'יש לאשר בתרבית/PCR; הטיפול האמפירי לא ממתין לאישור',
        },
        {
          direction_id: 'CSF-B2',
          diagnosis_direction_he: 'Parameningeal focus / חלקית-מטופל',
          vs_he: 'אם הצביעה שלילית והקליניקה לא-טיפוסית',
        },
      ],
      workup: [
        {
          test_he: 'תרבית CSF + דם ו-PCR לפי פרוטוקול מקומי מאומת',
          source_anchor: NELSON_BACTERIAL,
        },
      ],
    });
    matched.push(p);
    red_flags.push({
      flag_key: 'csf.bacterial_meningitis',
      label_he: 'חשד לדלקת קרום המוח חיידקית',
      severity: 'critical',
      action_he:
        'התרעת חירום: התחל אנטיביוטיקה אמפירית מיידית לפי פרוטוקול מקומי מאומת — אין לדחות לתרבית. אין שמות תרופות או מינונים במנוע זה.',
      source_anchor: NELSON_BACTERIAL,
      extra_anchors: [NELSON_CSF_REF],
      verification_status: DRAFT,
    });
  }

  if (cls.viral) {
    matched.push(patternKb({
      key: 'csf.viral_aseptic',
      title_he: 'דפוס דלקת קרום המוח ויראלית / אספטית',
      source_anchor: NELSON_ASEPTIC,
      extra_anchors: [NELSON_CSF_REF],
      evidence_he: 'WBC גבוה לגיל + שליטה לימפוציטית + יחס גלוקוז לא-נמוך + גראם ללא אורגניזמים',
      differential: [
        {
          direction_id: 'CSF-V1',
          diagnosis_direction_he: 'Viral / Aseptic Meningitis — כיוון',
          vs_he: 'אינו שולל חיידקי חלקית-מטופל; הקליניקה גוברת',
        },
        {
          direction_id: 'CSF-V2',
          diagnosis_direction_he: 'Encephalitis / מחלה דלקתית אחרת',
          vs_he: 'PCR, דימות והקשר קליני',
        },
      ],
      workup: [
        {
          test_he: 'PCR ל-enterovirus/HSV לפי פרוטוקול מקומי (לא אבחנה מהספירה)',
          source_anchor: NELSON_ASEPTIC,
        },
      ],
    }));
  }

  if (cls.fungal) {
    matched.push(patternKb({
      key: 'csf.fungal',
      title_he: 'דפוס דלקת קרום המוח פטרייתית — לפי אנוטציה בלבד',
      source_anchor: NELSON_FUNGAL,
      extra_anchors: [NELSON_CSF_REF],
      evidence_he: 'סומן fungal elements / India ink / Cryptococcal Ag — לא מאבחנים מפטריות ממספרים בלבד',
      differential: [
        {
          direction_id: 'CSF-F1',
          diagnosis_direction_he: 'Fungal Meningitis — כיוון',
          vs_he: 'דורש אישור מעבדתי ייעודי',
        },
      ],
      workup: [
        {
          test_he: 'ייעוץ זיהומי / בדיקות פטרייה לפי פרוטוקול מקומי מאומת',
          source_anchor: NELSON_FUNGAL,
        },
      ],
    }));
  }

  if (cls.traumatic) {
    matched.push(patternKb({
      key: 'csf.traumatic_tap',
      title_he: 'דפוס דיקור טראומטי (Traumatic Tap)',
      source_anchor: NELSON_LP,
      extra_anchors: [NELSON_CSF_REF],
      evidence_he: corrected.ok
        ? `RBC מוגבר; WBC מתוקן=${corrected.value}/µL`
        : 'RBC מוגבר ב-CSF — אין ספירת דם לתיקון, לא ניתן לשלול דלקת',
      differential: [
        {
          direction_id: 'CSF-T1',
          diagnosis_direction_he: 'Traumatic Tap — כיוון',
          vs_he: 'אינו שולל דלקת אם יש גראם חיובי, יחס גלוקוז נמוך או WBC מתוקן גבוה',
        },
      ],
      workup: [
        {
          test_he: 'אין להרגיע על סמך RBC בלבד — חזור על הערכה עם תיקון WBC וכימיה',
          source_anchor: NELSON_LP,
        },
      ],
    }));
  }

  const kbItems = matched.map((p) => ({
    ...p,
    extra_anchors: [...new Set([...(p.extra_anchors ?? []), NELSON_CSF_REF])],
  }));

  const deterministic = [];
  if (isNum(glucoseRatio)) {
    deterministic.push({
      key: 'csf_glucose_ratio',
      label_he: 'יחס גלוקוז CSF/דם',
      value: Math.round(glucoseRatio * 1000) / 1000,
      unit: '',
      formula_source: isNum(ratioDirect) ? null : 'CSF_glucose / blood_glucose',
    });
  }
  if (corrected.ok) deterministic.push(corrected);

  const patientData = [
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
    ...(isNum(wbc) ? [{
      key: 'csf_wbc', label_he: 'WBC ב-CSF', value: wbc, unit: '/µL',
      flag: cls.wbcFlag, ref_low: cls.wbcBand.low, ref_high: cls.wbcBand.high,
    }] : []),
    ...(isNum(rbc) ? [{
      key: 'csf_rbc', label_he: 'RBC ב-CSF', value: rbc, unit: '/µL',
      flag: cls.rbcFlag, ref_high: cls.rbcBand.high,
    }] : []),
    ...(isNum(protein) ? [{
      key: 'csf_protein', label_he: 'חלבון ב-CSF', value: protein, unit: 'mg/dL',
      flag: cls.proteinFlag, ref_low: cls.proteinBand.low, ref_high: cls.proteinBand.high,
    }] : []),
    ...(isNum(glucose) ? [{
      key: 'csf_glucose', label_he: 'גלוקוז ב-CSF', value: glucose, unit: 'mg/dL',
      flag: cls.glucoseFlag, ref_low: cls.gluBand.low, ref_high: cls.gluBand.high,
    }] : []),
  ];

  const factBlock = buildFactBlock({ kbItems, deterministic, patientData, mode });

  const unknowns = [];
  if (!isNum(ageDays)) unknowns.push('גיל חסר — לא יושמו טווחי WBC/חלבון תלויי-גיל מה-seed.');
  if (cls.rbcHigh && !corrected.ok) {
    unknowns.push('דיקור טראומטי אפשרי אך חסר WBC/RBC בדם — לא ניתן לשלול דלקת על סמך תיקון.');
  }
  if (!matched.length) {
    unknowns.push('לא הותאם דפוס CSF דטרמיניסטי — ערך בודד אינו אבחנה.');
  }

  return finalizeLocale({
    ok: true,
    engine: 'csf_interpreter',
    verification_status: DRAFT,
    age_days: ageDays,
    flags: {
      wbc: cls.wbcFlag,
      protein: cls.proteinFlag,
      glucose_ratio: cls.ratioFlag,
      rbc: cls.rbcFlag,
      pmn,
    },
    matched_patterns: matched.map((p) => p.pattern_key),
    kbItems,
    red_flags,
    safety_alerts: red_flags,
    emergency: cls.bacterial,
    differential: matched.flatMap((p) => (p.differential ?? []).map((d) => ({
      ...d,
      source_anchors: [p.source_anchor, ...(p.extra_anchors ?? [])],
      supports_he: [p.clinical_reasoning_he],
      refutes_he: [d.vs_he],
      based_on_patterns: [p.pattern_key],
      verification_status: DRAFT,
    }))),
    recommended_tests: matched.flatMap((p) => p.workup ?? []).map((w) => ({
      test_he: w.test_he,
      source_anchor: w.source_anchor,
      verification_status: DRAFT,
    })),
    calculators: deterministic,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'טווחי הייחוס הם מ-SEED_RANGES בטיוטה — לא גיליון המעבדה המקומית.',
      'אין מינונים או שמות אנטיביוטיקה. טיפול אמפירי לפי פרוטוקול מחלקתי מאומת בלבד.',
    ],
    unknowns_he: unknowns,
  }, locale);
}
