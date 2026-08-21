/**
 * DoctorPedAI — מנוע תלונות כרוניות: כאב בטן (Rome IV) וכאב ראש (ICHD-3)
 *
 * דטרמיניסטי. קריטריונים שסומנו + דגלים אדומים לאורגני/משני.
 * דגל אדום חוסם סיווג "תפקודי" מרגיע. אינו אבחנה.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

const NELSON_FAP = 'needs_verification.nelson.gi.functional_abdominal_pain';
const ROME_FAP = 'needs_verification.rome.iv.pediatric_fap';
const ROME_IBS = 'needs_verification.rome.iv.pediatric_ibs';
const NELSON_IBD = 'needs_verification.nelson.gi.ibd';
const NELSON_CELIAC = 'needs_verification.nelson.gi.celiac';
const NELSON_MIG = 'needs_verification.nelson.neurology.migraine';
const ICHD_MIG = 'needs_verification.ichd.3.migraine';
const ICHD_TTH = 'needs_verification.ichd.3.tension_type';
const AAP_HA = 'needs_verification.aap.headache.evaluation';
const NELSON_SEC_HA = 'needs_verification.nelson.neurology.secondary_headache';

const fail = (reason, extra = {}) => ({
  ok: false,
  reason,
  verification_status: 'unavailable',
  disclaimer_he: DISCLAIMER_HE,
  ...extra,
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenSet(list = [], features = {}) {
  const s = new Set();
  for (const x of list ?? []) s.add(norm(typeof x === 'object' ? (x.name ?? x.key ?? '') : x));
  for (const [k, v] of Object.entries(features ?? {})) if (v === true) s.add(norm(k));
  return s;
}

function hasAny(tokens, aliases) {
  return aliases.some((a) => {
    const n = norm(a);
    if (!n) return false;
    if (tokens.has(n)) return true;
    for (const t of tokens) {
      if (t === n) return true;
      if (n.length >= 4 && t.includes(n)) return true;
    }
    return false;
  });
}

const ABD_RED = {
  blood_stool: ['blood in stool', 'hematochezia', 'melena', 'דם בצואה', 'מלנה'],
  weight_loss: ['weight loss', 'failure to thrive', 'ירידה במשקל', 'כשל לשגשג'],
  nocturnal_pain: ['nocturnal pain', 'night pain', 'wakes from pain', 'כאב לילי', 'כאב מעיר'],
  fever: ['fever', 'חום כרוני', 'pyrexia'],
  arthritis: ['arthritis', 'דלקת מפרקים'],
  perianal: ['perianal', 'fistula', 'פריאנאלי'],
  family_ibd: ['family ibd', 'ibd family', 'קרוהן במשפחה'],
};

const IBS_FEAT = {
  related_defecation: ['related to defecation', 'pain with stool', 'קשור ליציאה'],
  change_frequency: ['change in frequency', 'diarrhea constipation', 'שינוי בתדירות יציאות'],
  change_form: ['change in form', 'bristol', 'שינוי בצורת הצואה'],
};

const HA_RED = {
  morning_vomiting: ['morning vomiting', 'vomiting on waking', 'הקאות בוקר'],
  wakes_from_sleep: ['wakes from sleep', 'night headache', 'כאב מעיר משינה'],
  focal_deficit: ['focal deficit', 'weakness', 'diplopia', 'papilledema', 'חסר נוירולוגי', 'פפילדמה'],
  thunderclap: ['thunderclap', 'sudden worst', 'כאב פתאומי חריף'],
};

const MIG_PAIN = {
  unilateral: ['unilateral', 'חד צדדי'],
  bilateral_ok: ['bilateral', 'דו צדדי'],
  pulsating: ['pulsating', 'throbbing', 'פועם'],
  moderate_severe: ['moderate', 'severe', 'בינוני', 'חמור'],
  activity_aggravation: ['worse with activity', 'aggravated by activity', 'מחמיר בפעילות'],
};

const MIG_ASSOC = {
  nausea_vomiting: ['nausea', 'vomiting', 'בחילה', 'הקאה'],
  photophobia: ['photophobia', 'פוטופוביה', 'רגישות לאור'],
  phonophobia: ['phonophobia', 'פונופוביה', 'רגישות לרעש'],
};

function labInflammatory(labs = []) {
  const hits = [];
  for (const l of labs ?? []) {
    const a = `${l.analyte ?? ''} ${l.canonical_key ?? ''}`.toLowerCase();
    const flag = String(l.flag ?? '').toLowerCase();
    if (flag !== 'high' && flag !== 'positive') continue;
    if (/esr|crp|calprotectin/.test(a)) hits.push(a);
    if (/anemi|hemoglobin|hgb/.test(a) && flag === 'low') hits.push('anemia');
  }
  // hemoglobin low:
  for (const l of labs ?? []) {
    const a = `${l.analyte ?? ''}`.toLowerCase();
    if (l.flag === 'low' && /hgb|hb|hemoglobin/.test(a)) hits.push('anemia');
  }
  return hits;
}

export function matchRomeIv({ findings = [], features = {}, labs = [], duration_months = null } = {}) {
  const tokens = tokenSet(findings, features);
  const duration = isNum(duration_months) ? duration_months : (isNum(Number(features.duration_months)) ? Number(features.duration_months) : null);
  const chronic = isNum(duration) && duration >= 2;
  const red = Object.entries(ABD_RED)
    .filter(([k, al]) => features[k] === true || hasAny(tokens, al))
    .map(([k]) => k);
  if (labInflammatory(labs).length) red.push('inflammatory_labs');
  const ibsHits = Object.entries(IBS_FEAT)
    .filter(([k, al]) => features[k] === true || hasAny(tokens, al))
    .map(([k]) => k);
  const pain = hasAny(tokens, ['abdominal pain', 'כאב בטן']) || features.abdominal_pain === true;
  const hasRed = red.length > 0;
  const ibs = chronic && pain && ibsHits.length >= 1 && !hasRed;
  const fap = chronic && pain && ibsHits.length === 0 && !hasRed;
  return {
    chronic,
    duration_months: duration,
    pain,
    red_flags: [...new Set(red)],
    ibs_features: ibsHits,
    organic_pathway: hasRed,
    ibs_direction: ibs,
    fap_direction: fap,
    verification_status: DRAFT,
  };
}

export function matchIchd3({
  findings = [],
  features = {},
  attacks = null,
  duration_hours = null,
} = {}) {
  const tokens = tokenSet(findings, features);
  const nAttacks = isNum(attacks) ? attacks : Number(features.attacks);
  const hours = isNum(duration_hours) ? duration_hours : Number(features.duration_hours);
  const red = Object.entries(HA_RED)
    .filter(([k, al]) => features[k] === true || hasAny(tokens, al))
    .map(([k]) => k);
  const painHits = Object.entries(MIG_PAIN)
    .filter(([k, al]) => features[k] === true || hasAny(tokens, al))
    .map(([k]) => k);
  const assocHits = Object.entries(MIG_ASSOC)
    .filter(([k, al]) => features[k] === true || hasAny(tokens, al))
    .map(([k]) => k);
  const photoPhono = assocHits.includes('photophobia') && assocHits.includes('phonophobia');
  const assocOk = assocHits.includes('nausea_vomiting') || photoPhono;
  const painOk = painHits.length >= 2;
  const attackOk = isNum(nAttacks) && nAttacks >= 5;
  // ICHD-3 pediatric migraine duration 2–72h when provided; missing duration → cannot complete.
  const durationOk = isNum(hours) && hours >= 2 && hours <= 72;
  const hasRed = red.length > 0;
  const migraine = !hasRed && attackOk && durationOk && painOk && assocOk;
  const tension =
    !hasRed &&
    !migraine &&
    hasAny(tokens, ['tension', 'pressing', 'band like', 'לחץ', 'כאב מתח']) &&
    !assocHits.includes('nausea_vomiting') &&
    !painHits.includes('activity_aggravation');
  return {
    attacks: isNum(nAttacks) ? nAttacks : null,
    duration_hours: isNum(hours) ? hours : null,
    red_flags: red,
    pain_features: painHits,
    associated: assocHits,
    secondary_pathway: hasRed,
    migraine_direction: migraine,
    tension_direction: tension,
    verification_status: DRAFT,
  };
}

function kb({ key, title_he, source_anchor, extra_anchors, evidence_he, workup, differential, suspicion = 'yellow' }) {
  const extra = (extra_anchors ?? [])
    .map((a) => attachLiteratureCitation({ source_anchor: a }).literature_citation?.display_he)
    .filter(Boolean);
  return {
    pattern_key: key,
    title_he,
    direction_he: differential?.[0]?.diagnosis_direction_he ?? title_he,
    suspicion,
    clinical_reasoning_he: evidence_he,
    recommended_workup_he: (workup ?? []).map((w) => w.test_he),
    source_anchor,
    extra_anchors: extra_anchors ?? [],
    verification_status: DRAFT,
    summary_he: extra.length ? `עיגון נוסף: ${extra.join('; ')}` : null,
    differential,
    workup,
  };
}

export function runChronicSymptomsEngine({
  patient = {},
  domain = null,
  findings = [],
  features = {},
  labs = [],
  duration_months = null,
  attacks = null,
  duration_hours = null,
  mode = 'development',
  locale = 'he',
} = {}) {
  const ageDays = toAgeDays(patient);
  const tokens = tokenSet(findings, features);
  const wantAbd = domain === 'abdominal' || hasAny(tokens, ['abdominal pain', 'כאב בטן', 'ibs', 'fap']) || features.abdominal_pain === true;
  const wantHa = domain === 'headache' || hasAny(tokens, ['headache', 'migraine', 'כאב ראש', 'מיגרנה']) || features.headache === true;
  if (!wantAbd && !wantHa && !(findings ?? []).length && !Object.values(features ?? {}).some(Boolean)) {
    return finalizeLocale(fail('no_chronic_input', { message_he: 'לא סופקו תלונות כאב בטן או כאב ראש כרוניים.' }), locale);
  }

  const rome = wantAbd ? matchRomeIv({ findings, features, labs, duration_months }) : null;
  const ichd = wantHa ? matchIchd3({ findings, features, attacks, duration_hours }) : null;
  const matched = [];
  const red_flags = [];

  if (rome?.organic_pathway) {
    matched.push(kb({
      key: 'chronic.abdominal_organic_flags',
      title_he: 'כאב בטן עם דגלים אדומים — בירור אורגני (IBD/צליאק) לא FAP',
      suspicion: 'red',
      source_anchor: NELSON_IBD,
      extra_anchors: [NELSON_CELIAC, NELSON_FAP],
      evidence_he: `דגלים: ${rome.red_flags.join(', ')}`,
      differential: [
        { direction_id: 'CHR-AB1', diagnosis_direction_he: 'IBD / צליאק / אורגני אחר — כיוון בירור', vs_he: 'אין לסווג כ-FAP בנוכחות דגל אדום' },
        { direction_id: 'CHR-AB2', diagnosis_direction_he: 'זיהום / ניתוחי דחוף לפי הקשר', vs_he: 'דם + חום + רגישות פריטונאלית' },
      ],
      workup: [
        { test_he: 'פרופיל צליאק (tTG-IgA + IgA כללי) לפי פרוטוקול מקומי', source_anchor: NELSON_CELIAC },
        { test_he: 'ESR/CRP + קלפרוטקטין בצואה אם חשד IBD', source_anchor: NELSON_IBD },
      ],
    }));
    red_flags.push({
      flag_key: 'chronic.abdominal_red_flag',
      label_he: 'דגל אדום בכאב בטן כרוני',
      severity: 'critical',
      action_he: 'אין לסווג ככאב תפקודי. בירור אורגני (צליאק/IBD) לפי פרוטוקול מקומי.',
      source_anchor: NELSON_IBD,
      extra_anchors: [NELSON_CELIAC],
      verification_status: DRAFT,
    });
  } else if (rome?.ibs_direction) {
    matched.push(kb({
      key: 'chronic.rome_ibs',
      title_he: 'Rome IV — כיוון ל-IBS בילדים (לא אבחנת שלילה בלבד)',
      source_anchor: ROME_IBS,
      extra_anchors: [NELSON_FAP],
      evidence_he: `משך ≥2 חודשים + מאפייני יציאה: ${rome.ibs_features.join(', ')}`,
      differential: [
        { direction_id: 'CHR-IBS1', diagnosis_direction_he: 'IBS — כיוון קריטריוני Rome IV', vs_he: 'אורגני אם יופיעו דגלים בהמשך' },
        { direction_id: 'CHR-IBS2', diagnosis_direction_he: 'FAP-NOS / עצירות תפקודית', vs_he: 'פחות זיקה ליציאות' },
      ],
      workup: [
        { test_he: 'אין בדיקות שגרה חובה בלי דגלים — שקול צליאק לפי פרוטוקול מקומי אם לא נשלל', source_anchor: NELSON_CELIAC },
      ],
    }));
  } else if (rome?.fap_direction) {
    matched.push(kb({
      key: 'chronic.rome_fap',
      title_he: 'Rome IV — כיוון ל-FAP (Functional Abdominal Pain)',
      source_anchor: ROME_FAP,
      extra_anchors: [NELSON_FAP],
      evidence_he: 'כאב בטן כרוני ≥2 חודשים ללא דגל אדום וללא מאפייני IBS',
      differential: [
        { direction_id: 'CHR-FAP1', diagnosis_direction_he: 'FAP-NOS — כיוון', vs_he: 'IBS אם יש זיקה ליציאות' },
        { direction_id: 'CHR-FAP2', diagnosis_direction_he: 'אורגני סמוי', vs_he: 'דגלים עתידיים / מעבדה דלקתית' },
      ],
      workup: [
        { test_he: 'מעקב דגלים; אל תרגיעו אם מופיעים דם/ירידת משקל/כאב לילי', source_anchor: NELSON_FAP },
      ],
    }));
  }

  if (ichd?.secondary_pathway) {
    matched.push(kb({
      key: 'chronic.headache_secondary_flags',
      title_he: 'כאב ראש עם דגלים — כיוון משני, לא מיגרנה ראשונית מרגיעה',
      suspicion: 'red',
      source_anchor: NELSON_SEC_HA,
      extra_anchors: [AAP_HA, ICHD_MIG],
      evidence_he: `דגלים: ${ichd.red_flags.join(', ')}`,
      differential: [
        { direction_id: 'CHR-HA1', diagnosis_direction_he: 'כאב ראש משני (ICP / מסה / זיהום) — כיוון', vs_he: 'אין לסווג כמיגרנה בנוכחות דגל' },
        { direction_id: 'CHR-HA2', diagnosis_direction_he: 'מיגרנה עם הילה / וריאנט נדיר', vs_he: 'רק אחרי שלילת משני' },
      ],
      workup: [
        { test_he: 'בדיקה נוירולוגית + סקר ראייה; דימות לפי פרוטוקול מקומי אם דגל משני', source_anchor: AAP_HA },
      ],
    }));
    red_flags.push({
      flag_key: 'chronic.headache_red_flag',
      label_he: 'דגל אדום בכאב ראש',
      severity: 'critical',
      action_he: 'הקאות בוקר / כאב מעיר / חסר נוירולוגי — הערכה דחופה. אין להרגיע כמיגרנה.',
      source_anchor: NELSON_SEC_HA,
      extra_anchors: [AAP_HA],
      verification_status: DRAFT,
    });
  } else if (ichd?.migraine_direction) {
    matched.push(kb({
      key: 'chronic.ichd_migraine',
      title_he: 'ICHD-3 — כיוון למיגרנה בילדים',
      source_anchor: ICHD_MIG,
      extra_anchors: [NELSON_MIG, AAP_HA],
      evidence_he: `≥5 התקפים, משך ${ichd.duration_hours}ש׳, מאפייני כאב ${ichd.pain_features.join(', ')}`,
      differential: [
        { direction_id: 'CHR-MIG1', diagnosis_direction_he: 'Pediatric migraine — כיוון ICHD-3', vs_he: 'כאב מתח / סינוסיטיס / משני' },
        { direction_id: 'CHR-MIG2', diagnosis_direction_he: 'Tension-type headache', vs_he: 'כאב לוחץ ללא בחילה/פוטו-פונו' },
      ],
      workup: [
        { test_he: 'סקר ראייה; יומן כאבי ראש; אין דימות שגרתי בלי דגלים', source_anchor: AAP_HA },
      ],
    }));
  } else if (ichd?.tension_direction) {
    matched.push(kb({
      key: 'chronic.ichd_tension',
      title_he: 'ICHD-3 — כיוון לכאב ראש מתחי',
      source_anchor: ICHD_TTH,
      extra_anchors: [NELSON_MIG],
      evidence_he: 'כאב לוחץ ללא דגלי משני וללא אשכול מיגרנה מלא',
      differential: [
        { direction_id: 'CHR-TTH1', diagnosis_direction_he: 'Tension-type headache — כיוון', vs_he: 'מיגרנה אם יופיעו בחילה/פוטופוביה' },
      ],
      workup: [
        { test_he: 'סקר ראייה והרגלי מסכים/שינה לפי פרוטוקול מקומי', source_anchor: AAP_HA },
      ],
    }));
  }

  const kbItems = matched;
  if (kbItems[0]) {
    const extras = matched.flatMap((m) => [m.source_anchor, ...(m.extra_anchors ?? []), ...(m.workup ?? []).map((w) => w.source_anchor)]);
    kbItems[0] = { ...kbItems[0], extra_anchors: [...new Set(extras.filter(Boolean))] };
  }

  const patientData = [
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
    ...(rome?.duration_months != null ? [{ key: 'abd_duration_mo', label_he: 'משך כאב בטן (חודשים)', value: rome.duration_months }] : []),
    ...(ichd?.attacks != null ? [{ key: 'ha_attacks', label_he: 'מספר התקפי כאב ראש', value: ichd.attacks }] : []),
  ];

  const factBlock = buildFactBlock({ kbItems, deterministic: [], patientData, mode });

  return finalizeLocale({
    ok: true,
    engine: 'chronic_symptoms',
    verification_status: DRAFT,
    age_days: ageDays,
    rome,
    ichd,
    matched_patterns: matched.map((m) => m.pattern_key),
    kbItems,
    red_flags,
    safety_alerts: red_flags,
    emergency: red_flags.length > 0,
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
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'Rome IV ו-ICHD-3 הם מילוי קריטריונים שסומנו, לא אבחנה.',
      'דגל אדום חוסם סיווג תפקודי/ראשוני מרגיע.',
    ],
    unknowns_he: matched.length ? [] : ['לא מולאו קריטריוני Rome/ICHD ולא סומנו דגלים — אין שלילה.'],
  }, locale);
}
