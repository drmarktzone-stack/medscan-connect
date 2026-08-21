/**
 * DoctorPedAI — רשימות מוכנות-להפניה ועצי בירור מדורגים (קהילה).
 * אינו מנפיק הפניה אם חסרים תנאים מוקדמים. בלי ספי מעבדה מומצאים.
 */

import { midParentalHeight } from '../deterministic/calculators.js';
import { t } from '../i18n/localize.js';

const DRAFT = 'draft_needs_verification';
const MOH_DEV = 'needs_verification.moh.child_development.referral';
const NELSON_CELIAC = 'needs_verification.nelson.gi.celiac';
const NELSON_GROWTH = 'needs_verification.nelson.endocrine.short_stature';
const AAP_ASD = 'needs_verification.aap.asd.guidelines';
const AAP_ADHD = 'needs_verification.aap.adhd.guidelines';

function labHit(labs, re) {
  return (labs ?? []).some((l) => re.test(`${l.analyte ?? ''} ${l.canonical_key ?? ''} ${l.label_he ?? ''}`));
}

export const REFERRAL_PATHWAYS = Object.freeze({
  asd_adhd: {
    id: 'asd_adhd',
    i18n_key: 'refer.pathway.asd_adhd',
    source_anchor: MOH_DEV,
    extra_anchors: [AAP_ASD, AAP_ADHD],
    specialist_i18n: 'refer.cdu',
  },
  celiac: {
    id: 'celiac',
    i18n_key: 'refer.pathway.celiac',
    source_anchor: NELSON_CELIAC,
    specialist_i18n: 'refer.gi',
  },
  short_stature: {
    id: 'short_stature',
    i18n_key: 'refer.pathway.growth',
    source_anchor: NELSON_GROWTH,
    specialist_i18n: 'refer.endocrinology',
  },
});

export const DIAGNOSTIC_TIERS = Object.freeze({
  asd_adhd: [
    { tier: 1, i18n_key: 'tier.community', items: ['vision', 'hearing', 'mchat_or_vanderbilt'] },
    { tier: 2, i18n_key: 'tier.advanced', items: ['audiology_if_failed', 'developmental_screen'] },
    { tier: 3, i18n_key: 'tier.specialist', items: ['child_development_unit'] },
  ],
  celiac: [
    { tier: 1, i18n_key: 'tier.community', items: ['ttg_iga', 'total_iga', 'gluten_containing_diet'] },
    { tier: 2, i18n_key: 'tier.advanced', items: ['ema_or_repeat_serology_per_local'] },
    { tier: 3, i18n_key: 'tier.specialist', items: ['pediatric_gi'] },
  ],
  short_stature: [
    { tier: 1, i18n_key: 'tier.community', items: ['mid_parental_height', 'growth_plot', 'cbc_tsh_celiac_screen'] },
    { tier: 2, i18n_key: 'tier.advanced', items: ['bone_age_xray', 'endocrine_labs_per_local'] },
    { tier: 3, i18n_key: 'tier.specialist', items: ['pediatric_endocrinology'] },
  ],
});

export function evaluateAsdAdhdReferral({ features = {}, questionnaires = {} } = {}) {
  const vision = features.vision_tested === true;
  const hearing = features.hearing_tested === true;
  const mchat = Number.isFinite(Number(questionnaires.mchat_total ?? features.mchat_total));
  const vanderbilt = Boolean(questionnaires.vanderbilt || features.vanderbilt);
  const conners = Boolean(questionnaires.conners || features.conners);
  const qok = mchat || vanderbilt || conners;
  const missing = [];
  if (!vision) missing.push({ item: 'vision', i18n_key: 'check.vision' });
  if (!hearing) missing.push({ item: 'hearing', i18n_key: 'check.hearing' });
  if (!qok) missing.push({ item: 'questionnaire', i18n_key: 'check.questionnaire' });
  return {
    pathway: 'asd_adhd',
    ready: missing.length === 0,
    missing,
    completed: { vision, hearing, questionnaire: qok },
    source_anchor: MOH_DEV,
    extra_anchors: [AAP_ASD, AAP_ADHD],
    verification_status: DRAFT,
  };
}

export function evaluateCeliacReferral({ labs = [], features = {} } = {}) {
  const ttg = features.ttg_iga_done === true || labHit(labs, /ttg|tTG|anti.?ttg/i);
  const iga = features.total_iga_done === true || labHit(labs, /total.?iga|\biga\b/i);
  const onGluten = features.gluten_containing_diet === true;
  const glutenFree = features.gluten_free_diet === true;
  const missing = [];
  if (!ttg) missing.push({ item: 'ttg_iga', i18n_key: 'check.ttg' });
  if (!iga) missing.push({ item: 'total_iga', i18n_key: 'check.iga' });
  if (!onGluten) missing.push({ item: 'gluten_containing_diet', i18n_key: 'check.gluten' });
  return {
    pathway: 'celiac',
    ready: missing.length === 0 && !glutenFree,
    missing,
    completed: { ttg_iga: ttg, total_iga: iga, gluten_containing_diet: onGluten },
    blocked_reason: glutenFree ? 'gluten_free_diet' : null,
    source_anchor: NELSON_CELIAC,
    verification_status: DRAFT,
    notes_he: glutenFree
      ? 'אין להשלים פאנל צליאק על דיאטה נטולת גלוטן — לפי פרוטוקול מקומי מאומת.'
      : 'פאנל צליאק (tTG-IgA + IgA כללי) רק בדיאטה עם גלוטן. אין ספי ערכים במנוע.',
  };
}

export function evaluateShortStatureReferral({
  patient = {},
  father_cm = null,
  mother_cm = null,
  lmsTable = null,
  features = {},
} = {}) {
  const sex = patient.sex ?? patient.gender;
  const mph = (father_cm && mother_cm)
    ? midParentalHeight({ father_cm, mother_cm, sex })
    : { ok: false, reason: 'parents_height_required' };
  const plot = features.growth_plotted === true || Boolean(lmsTable);
  const missing = [];
  if (!mph.ok) missing.push({ item: 'mid_parental_height', i18n_key: 'check.mph' });
  if (!plot) missing.push({ item: 'growth_plot', i18n_key: 'check.growth_plot' });
  const requested = [
    { item: 'bone_age_xray', i18n_key: 'check.bone_age', tier: 2 },
    { item: 'endocrine_screening', i18n_key: 'check.endocrine', tier: 2 },
  ];
  return {
    pathway: 'short_stature',
    ready: missing.length === 0,
    missing,
    requested_next: requested,
    mid_parental_height: mph.ok ? mph : null,
    source_anchor: NELSON_GROWTH,
    verification_status: DRAFT,
    notes_he: 'אין ספי אחוזונים מומצאים. Z רק מטבלת LMS שסופקה. צילום גיל עצם + סקר אנדוקריני לפי פרוטוקול מקומי.',
  };
}

export function evaluateReferral(pathway, params = {}) {
  if (pathway === 'asd_adhd' || pathway === 'child_development') return evaluateAsdAdhdReferral(params);
  if (pathway === 'celiac' || pathway === 'gi') return evaluateCeliacReferral(params);
  if (pathway === 'short_stature' || pathway === 'growth') return evaluateShortStatureReferral(params);
  return { ok: false, reason: 'unknown_referral_pathway', verification_status: 'unavailable' };
}

export function specialistAllowed(readiness, locale = 'he') {
  if (!readiness?.ready) {
    return {
      allowed: false,
      message_he: t(locale, 'refer.blocked'),
      missing: readiness?.missing ?? [],
    };
  }
  return {
    allowed: true,
    message_he: t(locale, 'refer.ready'),
    specialist_i18n: REFERRAL_PATHWAYS[readiness.pathway]?.specialist_i18n,
  };
}

export function diagnosticTree(pathway, locale = 'he') {
  const tiers = DIAGNOSTIC_TIERS[pathway];
  if (!tiers) return null;
  return {
    pathway,
    verification_status: DRAFT,
    tiers: tiers.map((row) => ({
      ...row,
      title_he: t(locale, row.i18n_key),
    })),
  };
}
