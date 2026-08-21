/**
 * DoctorPedAI — תזונת תינוקות, תמ"לים ואבני דרך (CDC/Denver II — טיוטה)
 *
 * דטרמיניסטי. 150 מ״ל/ק״ג/יום הוא כלל אצבע אריתמטי, לא הוראת הזנה.
 * גיל מתוקן לפגים: ימים − (40 − GA) × 7, עד כ־24 חודשים מתוקנים.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { growthPercentile } from '../deterministic/calculators.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { t, finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';
export const ML_PER_KG_DAY = 150;

const NELSON_FORMULA = 'needs_verification.nelson.nutrition.infant_formula';
const NELSON_CMPA = 'needs_verification.nelson.allergy.cmpa';
const NELSON_FTT = 'needs_verification.nelson.nutrition.failure_to_thrive';
const NELSON_PYLORIC = 'needs_verification.nelson.gi.pyloric_stenosis';
const CDC_MS = 'needs_verification.cdc.development.milestones';
const NELSON_DEV = 'needs_verification.nelson.developmental.milestones';
const DENVER = 'needs_verification.cdc.denver_ii.screening';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function fail(reason, extra, locale = 'he') {
  return finalizeLocale({
    ok: false, reason, verification_status: 'unavailable', disclaimer_he: DISCLAIMER_HE, ...extra,
  }, locale);
}

export const FORMULA_TYPES = Object.freeze({
  standard: { i18n_key: 'formula.standard', source_anchor: NELSON_FORMULA },
  comfort: { i18n_key: 'formula.comfort', source_anchor: NELSON_FORMULA },
  soy: { i18n_key: 'formula.soy', source_anchor: NELSON_FORMULA },
  ar: { i18n_key: 'formula.ar', source_anchor: NELSON_FORMULA },
  ehf: { i18n_key: 'formula.ehf', source_anchor: NELSON_CMPA },
  aaf: { i18n_key: 'formula.aaf', source_anchor: NELSON_CMPA },
});

export function correctedAgeDays({ ageDays, ga_weeks } = {}) {
  if (!isNum(ageDays)) return { ok: false, reason: 'age_required' };
  if (!isNum(ga_weeks) || ga_weeks >= 37) {
    return { ok: true, chronological_days: ageDays, corrected_days: ageDays, preterm: false };
  }
  const deficit = (40 - ga_weeks) * 7;
  const corrected = Math.max(0, ageDays - deficit);
  const months = corrected / 30.4375;
  const stillCorrect = months < 24;
  return {
    ok: true,
    chronological_days: ageDays,
    corrected_days: stillCorrect ? corrected : ageDays,
    preterm: true,
    ga_weeks,
    formula_source: 'corrected_days = age_days - (40 - GA_weeks) * 7 (until ~24 corrected months)',
  };
}

export function formulaVolume({ weight_kg, feeds_per_day = 6 } = {}) {
  const w = Number(weight_kg);
  const n = Number(feeds_per_day);
  if (!isNum(w) || w <= 0) return { ok: false, reason: 'weight_required' };
  if (!isNum(n) || n < 1 || n > 12) return { ok: false, reason: 'feeds_out_of_range' };
  const daily = Math.round(ML_PER_KG_DAY * w);
  const perFeed = Math.round((daily / n) * 10) / 10;
  return {
    ok: true,
    daily_ml: daily,
    per_feed_ml: perFeed,
    feeds_per_day: n,
    ml_per_kg_day: ML_PER_KG_DAY,
    formula_source: '150 mL/kg/day ÷ feeds (feeding heuristic, not a prescription)',
    verification_status: DRAFT,
  };
}

function texty(findings, features) {
  return `${(findings ?? []).join(' ')} ${Object.entries(features ?? {}).filter(([, v]) => v === true).map(([k]) => k).join(' ')}`.toLowerCase();
}

export function matchFormulaType({ findings = [], features = {}, ageDays = null } = {}) {
  const tx = texty(findings, features);
  const anaphylaxis = features.anaphylaxis === true || /anaphylax|אנפילקס/.test(tx);
  const fpies = features.fpies === true || /fpies/.test(tx);
  const cmpa = features.cmpa === true || /cmpa|cow.?milk|חלב פרה|אלרגיה לחלב/.test(tx);
  const ehfFailed = features.ehf_failed === true;
  const regurg = features.regurgitation === true || /reflux|regurg|פליטות/.test(tx);
  const projectile = features.projectile_vomiting === true || /projectile|הקאה הקשתית|הקאות הקשתיות/.test(tx);
  const fuss = features.fussiness === true || /colic|fuss|גזים|קוליק/.test(tx);
  const months = isNum(ageDays) ? ageDays / 30.4375 : null;

  if (anaphylaxis || fpies || ehfFailed) {
    return { type: 'aaf', reason: 'severe_allergy_or_ehf_fail', ...FORMULA_TYPES.aaf };
  }
  if (cmpa) {
    return { type: 'ehf', reason: 'cmpa', ...FORMULA_TYPES.ehf };
  }
  if (projectile) {
    return { type: 'standard', reason: 'projectile_not_formula', ...FORMULA_TYPES.standard, defer: true };
  }
  if (regurg && !cmpa && !anaphylaxis) {
    return { type: 'ar', reason: 'regurgitation', ...FORMULA_TYPES.ar };
  }
  if (features.soy === true || /soy|סויה/.test(tx)) {
    if (isNum(months) && months < 6 && cmpa) {
      return { type: 'ehf', reason: 'soy_not_first_line_cmpa_under_6m', ...FORMULA_TYPES.ehf };
    }
    return { type: 'soy', reason: 'soy_requested', ...FORMULA_TYPES.soy };
  }
  if (fuss && !cmpa && !anaphylaxis) {
    return { type: 'comfort', reason: 'fussiness_without_allergy', ...FORMULA_TYPES.comfort };
  }
  return { type: 'standard', reason: 'default', ...FORMULA_TYPES.standard };
}

const MS_ALIASES = {
  social_smile: ['social smile', 'smiles', 'חיוך חברתי'],
  head_control: ['head control', 'holds head', 'שליטת ראש'],
  sits: ['sits', 'sitting', 'יושב'],
  stands_or_pulls: ['pulls to stand', 'stands', 'נעמד', 'מושך לעמידה'],
  pincer_or_grasp: ['pincer', 'grasp', 'צבת', 'אוחז'],
  babble_or_mama: ['babble', 'mama', 'dada', 'מלמל', 'אבא אמא'],
  walks: ['walks', 'walking', 'הולך'],
  words: ['words', 'says words', 'מילים'],
  two_word: ['two word', 'two-word', 'שתי מילים'],
  tracks: ['tracks', 'follows', 'מעקב מבט'],
  response_to_sound: ['responds to sound', 'startles', 'מגיב לרעש'],
};

export const MILESTONE_GATES = Object.freeze([
  { min_months: 4, domain: 'social', key: 'social_smile', refer: 'cdu', i18n_domain: 'ms.social' },
  { min_months: 6, domain: 'gross', key: 'head_control', refer: 'pt', i18n_domain: 'ms.gross' },
  { min_months: 9, domain: 'gross', key: 'sits', refer: 'pt', i18n_domain: 'ms.gross' },
  { min_months: 12, domain: 'gross', key: 'stands_or_pulls', refer: 'pt', i18n_domain: 'ms.gross' },
  { min_months: 12, domain: 'fine', key: 'pincer_or_grasp', refer: 'ot', i18n_domain: 'ms.fine' },
  { min_months: 12, domain: 'language', key: 'babble_or_mama', refer: 'slp', i18n_domain: 'ms.language' },
  { min_months: 18, domain: 'gross', key: 'walks', refer: 'pt', i18n_domain: 'ms.gross' },
  { min_months: 18, domain: 'language', key: 'words', refer: 'slp', i18n_domain: 'ms.language' },
  { min_months: 24, domain: 'language', key: 'two_word', refer: 'slp', i18n_domain: 'ms.language' },
]);

function canDoSet(list = []) {
  const s = new Set();
  for (const raw of list ?? []) {
    const n = String(raw ?? '').toLowerCase();
    s.add(n.replace(/[^a-z0-9\u0590-\u05ff]+/g, ''));
    for (const [key, aliases] of Object.entries(MS_ALIASES)) {
      if (n.replace(/[^a-z0-9\u0590-\u05ff]+/g, '') === key.replace(/_/g, '')) s.add(key);
      if (aliases.some((a) => n.includes(a.toLowerCase()))) s.add(key);
    }
  }
  return s;
}

export function matchMilestones({ correctedDays, can_do = [] } = {}) {
  if (!isNum(correctedDays)) return { ok: false, reason: 'age_required' };
  const months = correctedDays / 30.4375;
  const present = canDoSet(can_do);
  const missing = [];
  for (const g of MILESTONE_GATES) {
    if (months + 1e-9 < g.min_months) continue;
    if (!present.has(g.key)) missing.push({ ...g, age_months: Math.round(months * 10) / 10 });
  }
  return {
    ok: true,
    corrected_months: Math.round(months * 10) / 10,
    missing,
    delayed: missing.length > 0,
    verification_status: DRAFT,
    source_anchor: CDC_MS,
    extra_anchors: [NELSON_DEV, DENVER],
  };
}

export function runInfantNutritionAndDevelopment({
  patient = {},
  findings = [],
  features = {},
  weight_kg = null,
  feeds_per_day = 6,
  ga_weeks = null,
  can_do = [],
  lmsTable = null,
  locale = 'he',
  mode = 'development',
} = {}) {
  const loc = locale;
  const ageDays = toAgeDays(patient);
  const w = Number(weight_kg ?? patient.weight_kg);
  const ga = Number(ga_weeks ?? patient.ga_weeks ?? patient.gestational_age_weeks);
  const hasNut = isNum(w) || (findings ?? []).length || Object.keys(features ?? {}).length;
  const hasMs = (can_do ?? []).length > 0 || features.milestones === true;
  if (!hasNut && !hasMs && !isNum(ageDays)) {
    return fail('no_infant_input', { message_he: 'לא סופקו משקל, תמ"ל, ממצאים או אבני דרך.' }, loc);
  }

  const age = correctedAgeDays({ ageDays, ga_weeks: isNum(ga) ? ga : null });
  const vol = isNum(w) ? formulaVolume({ weight_kg: w, feeds_per_day }) : { ok: false };
  const formula = matchFormulaType({ findings, features, ageDays: age.ok ? age.corrected_days : ageDays });
  const ms = hasMs || isNum(ageDays)
    ? matchMilestones({ correctedDays: age.ok ? age.corrected_days : ageDays, can_do })
    : { ok: false };

  const kbItems = [];
  const red_flags = [];
  const tests = [];
  const deterministic = [];

  if (formula?.type) {
    kbItems.push({
      pattern_key: `formula.${formula.type}`,
      i18n_key: formula.i18n_key,
      title_he: t(loc, formula.i18n_key),
      source_anchor: formula.source_anchor,
      extra_anchors: [NELSON_FORMULA],
      verification_status: DRAFT,
      suspicion: formula.type === 'aaf' ? 'yellow' : 'green',
    });
  }

  if (vol.ok) {
    deterministic.push({
      key: 'formula.daily_ml',
      label_he: 'נפח כלכלה ל-24ש׳ (כלל 150 מ״ל/ק״ג)',
      value: vol.daily_ml,
      unit: 'mL/24h',
      formula_source: vol.formula_source,
    });
    deterministic.push({
      key: 'formula.per_feed_ml',
      label_he: 'נפח לארוחה',
      value: vol.per_feed_ml,
      unit: 'mL',
      formula_source: vol.formula_source,
    });
  }

  const tx = texty(findings, features);
  const dehyd = features.dehydration === true || /dehydr|sunken|no tears|התייבשות|מרפס שקוע/.test(tx);
  const projectile = features.projectile_vomiting === true || /projectile|הקאות הקשתיות/.test(tx);
  const anaphylaxis = features.anaphylaxis === true || /anaphylax/.test(tx);
  const fpies = features.fpies === true || /fpies/.test(tx);

  if (anaphylaxis) {
    red_flags.push({
      flag_key: 'nutrition.anaphylaxis',
      i18n_key: 'flag.anaphylaxis',
      i18n_action_key: 'emergency.ed',
      label_he: t(loc, 'flag.anaphylaxis'),
      action_he: t(loc, 'emergency.ed'),
      severity: 'critical',
      source_anchor: NELSON_CMPA,
      verification_status: DRAFT,
    });
  }
  if (fpies) {
    red_flags.push({
      flag_key: 'nutrition.fpies',
      i18n_key: 'flag.fpies',
      i18n_action_key: 'emergency.ed',
      label_he: t(loc, 'flag.fpies'),
      action_he: t(loc, 'emergency.ed'),
      severity: 'critical',
      source_anchor: NELSON_CMPA,
      verification_status: DRAFT,
    });
  }
  if (projectile) {
    red_flags.push({
      flag_key: 'nutrition.projectile',
      i18n_key: 'flag.projectile',
      i18n_action_key: 'emergency.ed',
      label_he: t(loc, 'flag.projectile'),
      action_he: t(loc, 'emergency.ed'),
      severity: 'critical',
      source_anchor: NELSON_PYLORIC,
      verification_status: DRAFT,
    });
  }
  if (dehyd) {
    red_flags.push({
      flag_key: 'nutrition.dehydration',
      i18n_key: 'flag.dehydration',
      i18n_action_key: 'emergency.ed',
      label_he: t(loc, 'flag.dehydration'),
      action_he: t(loc, 'emergency.ed'),
      severity: 'critical',
      source_anchor: NELSON_FTT,
      verification_status: DRAFT,
    });
  }

  if (isNum(w) && lmsTable && age.ok) {
    const gp = growthPercentile({
      measurement: w,
      age_days: age.corrected_days,
      sex: patient.sex,
      metric: 'wfa',
      lmsTable,
    });
    if (gp.ok && gp.z_score <= -2) {
      red_flags.push({
        flag_key: 'nutrition.ftt',
        i18n_key: 'flag.fft',
        label_he: t(loc, 'flag.fft'),
        action_he: t(loc, 'flag.fft'),
        source_anchor: NELSON_FTT,
        verification_status: DRAFT,
      });
    }
  }

  if (ms.ok && ms.delayed) {
    kbItems.push({
      pattern_key: 'dev.delay',
      i18n_key: 'ms.delay',
      title_he: t(loc, 'ms.delay'),
      source_anchor: CDC_MS,
      extra_anchors: [NELSON_DEV, DENVER],
      suspicion: 'yellow',
      verification_status: DRAFT,
    });
    const refers = new Set(ms.missing.map((m) => m.refer));
    const referKey = { pt: 'refer.pt', ot: 'refer.ot', slp: 'refer.slp', cdu: 'refer.cdu' };
    tests.push({
      test_he: t(loc, 'refer.cdu'),
      i18n_key: 'refer.cdu',
      source_anchor: NELSON_DEV,
      verification_status: DRAFT,
    });
    for (const r of refers) {
      tests.push({
        test_he: t(loc, referKey[r] || 'refer.cdu'),
        i18n_key: referKey[r],
        source_anchor: CDC_MS,
        verification_status: DRAFT,
      });
    }
    red_flags.push({
      flag_key: 'dev.delay',
      i18n_key: 'ms.delay',
      i18n_action_key: 'ms.delay',
      label_he: t(loc, 'ms.delay'),
      action_he: t(loc, 'ms.delay'),
      source_anchor: CDC_MS,
      extra_anchors: [DENVER],
      verification_status: DRAFT,
    });
  }

  if (kbItems[0]) {
    const extras = tests.map((x) => x.source_anchor).filter(Boolean);
    kbItems[0] = { ...kbItems[0], extra_anchors: [...new Set([...(kbItems[0].extra_anchors ?? []), ...extras, CDC_MS])] };
  }

  const factBlock = buildFactBlock({
    kbItems,
    deterministic,
    patientData: [
      ...(age.ok ? [{ key: 'corrected_days', label_he: 'גיל מתוקן (ימים)', value: age.corrected_days, unit: 'days' }] : []),
      ...(isNum(w) ? [{ key: 'weight_kg', label_he: 'משקל', value: w, unit: 'kg' }] : []),
    ],
    mode,
  });

  return finalizeLocale({
    ok: true,
    engine: 'infant_nutrition_development',
    verification_status: DRAFT,
    formula: formula?.type,
    formula_reason: formula?.reason,
    volume: vol.ok ? vol : null,
    corrected_age: age.ok ? age : null,
    milestones: ms.ok ? ms : null,
    matched_patterns: kbItems.map((k) => k.pattern_key),
    kbItems,
    red_flags,
    emergency: red_flags.some((f) => f.severity === 'critical'),
    differential: kbItems.map((k, i) => ({
      direction_id: `INF-${i + 1}`,
      i18n_key: k.i18n_key,
      diagnosis_direction_he: k.title_he,
      vs_he: 'התאמת תמ"ל/אבני דרך אינה אבחנה',
      source_anchors: [k.source_anchor, ...(k.extra_anchors ?? [])],
      verification_status: DRAFT,
    })),
    recommended_tests: tests,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      '150 מ״ל/ק״ג/יום הוא כלל אצבע. הקאות הקשתיות אינן סיבה להחלפת תמ"ל.',
      'אבני דרך לפי CDC/Denver כטיוטה; גיל מתוקן לפגים עד ~24 חודשים.',
    ],
  }, loc);
}
