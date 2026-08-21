/**
 * DoctorPedAI — מודולי מומחה: טוקסיקולוגיה, טראומה/PECARN, גדילה וחיסונים
 *
 * דטרמיניסטי. אינו אבחנה. אין מינוני תרופות/NAC/אנטידוט מהזיכרון.
 * ספי רעילות לא מומצאים — mg/kg מחושב כחשבון בלבד.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { growthPercentile, midParentalHeight } from '../deterministic/calculators.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { t, finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

const NELSON_TOX = 'needs_verification.nelson.emergency.toxicology';
const NELSON_BATTERY = 'needs_verification.nelson.emergency.button_battery';
const NELSON_MAGNET = 'needs_verification.nelson.emergency.magnet_ingestion';
const NELSON_APAP = 'needs_verification.nelson.emergency.paracetamol';
const NELSON_IBU = 'needs_verification.nelson.emergency.ibuprofen';
const PECARN_A = 'needs_verification.aap.pecarn.head_ct';
const NELSON_TBI = 'needs_verification.nelson.emergency.head_trauma';
const NELSON_BURN = 'needs_verification.nelson.emergency.burns';
const WHO_GROWTH = 'needs_verification.who.growth.zscore';
const NELSON_FTT = 'needs_verification.nelson.nutrition.failure_to_thrive';
const MOH_VAX = 'needs_verification.moh.immunization.schedule';
const MOH_CATCH = 'needs_verification.moh.immunization.catch_up';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function fail(reason, extra, locale = 'he') {
  return finalizeLocale({
    ok: false,
    reason,
    verification_status: 'unavailable',
    disclaimer_he: DISCLAIMER_HE,
    ...extra,
  }, locale);
}

function blob(list = []) {
  return (list ?? []).map((x) => String(x ?? '').toLowerCase()).join(' | ');
}

function has(text, re) {
  return re.test(text);
}

/* ── Toxidromes ──────────────────────────────────────────────────────── */

const TOXIDROMES = Object.freeze([
  {
    pattern_key: 'tox.opioid',
    i18n_key: 'tox.opioid.title',
    suspicion: 'red',
    emergency: true,
    need: ['miosis', 'cns_depression'],
    plusAny: ['hypoventilation', 'bradycardia'],
    source_anchor: NELSON_TOX,
  },
  {
    pattern_key: 'tox.anticholinergic',
    i18n_key: 'tox.anticholinergic.title',
    suspicion: 'red',
    need: ['mydriasis', 'tachycardia'],
    plusAny: ['dry_skin', 'hyperthermia', 'delirium', 'urinary_retention'],
    source_anchor: NELSON_TOX,
  },
  {
    pattern_key: 'tox.cholinergic',
    i18n_key: 'tox.cholinergic.title',
    suspicion: 'red',
    emergency: true,
    need: ['secretions'],
    plusAny: ['miosis', 'bradycardia', 'wheeze', 'diarrhea'],
    source_anchor: NELSON_TOX,
  },
  {
    pattern_key: 'tox.sympathomimetic',
    i18n_key: 'tox.sympathomimetic.title',
    suspicion: 'red',
    need: ['tachycardia', 'mydriasis'],
    plusAny: ['diaphoresis', 'hypertension', 'agitation', 'hyperthermia'],
    source_anchor: NELSON_TOX,
  },
  {
    pattern_key: 'tox.sedative',
    i18n_key: 'tox.sedative.title',
    suspicion: 'yellow',
    need: ['cns_depression'],
    plusAny: ['hypoventilation'],
    refute: ['miosis'],
    source_anchor: NELSON_TOX,
  },
]);

export function collectToxidromeFlags({ findings = [], vitals = {}, features = {} } = {}) {
  const t = `${blob(findings)} ${blob(Object.keys(features).filter((k) => features[k]))}`.toLowerCase();
  const flags = new Set();
  const hr = String(vitals.hr_flag ?? '').toLowerCase();
  const rr = String(vitals.rr_flag ?? vitals.resp_flag ?? '').toLowerCase();
  const bp = String(vitals.bp_flag ?? '').toLowerCase();
  const temp = String(vitals.temp_flag ?? '').toLowerCase();
  const gcs = Number(vitals.gcs ?? features.gcs);
  const pupils = String(vitals.pupils ?? features.pupils ?? '').toLowerCase();

  if (hr === 'low' || /brady/.test(t)) flags.add('bradycardia');
  if (hr === 'high' || /tachy/.test(t)) flags.add('tachycardia');
  if (bp === 'high' || /hypertens/.test(t)) flags.add('hypertension');
  if (rr === 'low' || /hypovent|apnea|bradypnea/.test(t)) flags.add('hypoventilation');
  if (temp === 'high' || /hyperther|fever/.test(t)) flags.add('hyperthermia');
  if (isNum(gcs) && gcs < 14) flags.add('cns_depression');
  if (/somnol|unrespon|altered|coma|ירידת הכרה|ישנוני/.test(t)) flags.add('cns_depression');
  if (pupils.includes('miosis') || pupils.includes('pinpoint') || /miosis|pinpoint|אישונים צרים/.test(t)) flags.add('miosis');
  if (pupils.includes('mydriasis') || pupils.includes('dilat') || /mydriasis|dilated|אישונים רחבים/.test(t)) flags.add('mydriasis');
  if (/dry skin|dry mucosa|red as a beet|יבש/.test(t) || features.dry_skin) flags.add('dry_skin');
  if (/diaphor|sweat|הזעה/.test(t)) flags.add('diaphoresis');
  if (/delirium|agitated|hallucin/.test(t)) flags.add('delirium');
  if (/urinary retention|שתן עצור/.test(t)) flags.add('urinary_retention');
  if (/sludge|salivat|lacrimat|bronchorrhea|ריור/.test(t) || features.secretions) flags.add('secretions');
  if (/wheeze|צפצוף/.test(t)) flags.add('wheeze');
  if (/diarrhea|שלשול/.test(t)) flags.add('diarrhea');
  if (/agitation|אי שקט/.test(t)) flags.add('agitation');
  return flags;
}

export function matchToxidromes(flagSet) {
  const matched = [];
  for (const tx of TOXIDROMES) {
    if ((tx.need ?? []).some((k) => !flagSet.has(k))) continue;
    if ((tx.plusAny ?? []).length && !(tx.plusAny ?? []).some((k) => flagSet.has(k))) continue;
    if ((tx.refute ?? []).some((k) => flagSet.has(k))) continue;
    matched.push({ ...tx, verification_status: DRAFT });
  }
  return matched;
}

function ingestionKind(findings, features) {
  const t = `${blob(findings)} ${String(features.ingestion ?? '')}`.toLowerCase();
  if (features.button_battery || /button battery|סוללת כפתור|סוללה/.test(t)) return 'button_battery';
  if (features.magnets || /magnet|מגנט/.test(t)) return 'magnets';
  if (features.paracetamol || /paracetamol|acetaminophen|אקמול/.test(t)) return 'paracetamol';
  if (features.ibuprofen || /ibuprofen|נורופן|אדוויל/.test(t)) return 'ibuprofen';
  return features.ingestion_type || null;
}

export function runToxicologyEngine({
  patient = {},
  findings = [],
  vitals = {},
  features = {},
  ingested_mg = null,
  mode = 'development',
  locale = 'he',
} = {}) {
  const loc = locale;
  const ageDays = toAgeDays(patient);
  const hasAny = (findings ?? []).some(Boolean) || Object.keys(vitals ?? {}).length || Object.keys(features ?? {}).length || ingested_mg != null;
  if (!hasAny) return fail('no_tox_input', { message_he: 'לא סופקו ממצאי הרעלה, בליעה או סימנים חיוניים.' }, loc);

  const flags = collectToxidromeFlags({ findings, vitals, features });
  const matched = matchToxidromes(flags);
  const kind = ingestionKind(findings, features);
  const red_flags = [];
  const kbItems = [];
  const weight = Number(patient.weight_kg);
  const mg = Number(ingested_mg ?? features.ingested_mg);
  const mgPerKg = isNum(mg) && isNum(weight) && weight > 0 ? Math.round((mg / weight) * 10) / 10 : null;

  const pushKb = (item) => kbItems.push({ ...item, verification_status: DRAFT, suspicion: item.suspicion || 'yellow' });

  for (const tx of matched) {
    pushKb({
      pattern_key: tx.pattern_key,
      i18n_key: tx.i18n_key,
      title_he: t(loc, tx.i18n_key),
      direction_he: t(loc, tx.i18n_key),
      source_anchor: tx.source_anchor,
      extra_anchors: [NELSON_TOX],
    });
    if (tx.emergency) {
      red_flags.push({
        flag_key: tx.pattern_key,
        i18n_key: tx.i18n_key,
        i18n_action_key: 'emergency.ed',
        label_he: t(loc, tx.i18n_key),
        action_he: t(loc, 'emergency.ed'),
        severity: 'critical',
        source_anchor: tx.source_anchor,
        verification_status: DRAFT,
      });
    }
  }

  if (kind === 'button_battery') {
    pushKb({
      pattern_key: 'tox.button_battery',
      title_he: t(loc, 'tox.battery.action'),
      i18n_key: 'tox.battery.action',
      source_anchor: NELSON_BATTERY,
      extra_anchors: [NELSON_TOX],
      suspicion: 'red',
    });
    red_flags.push({
      flag_key: 'tox.button_battery',
      i18n_key: 'tox.battery.action',
      i18n_action_key: 'tox.battery.action',
      label_he: t(loc, 'tox.battery.action'),
      action_he: t(loc, 'tox.battery.action'),
      severity: 'critical',
      source_anchor: NELSON_BATTERY,
      verification_status: DRAFT,
    });
  }
  if (kind === 'magnets') {
    const count = Number(features.magnet_count);
    const multi = !isNum(count) || count >= 2 || features.magnet_plus_metal === true;
    if (multi) {
      pushKb({
        pattern_key: 'tox.magnets',
        i18n_key: 'tox.magnet.action',
        title_he: t(loc, 'tox.magnet.action'),
        source_anchor: NELSON_MAGNET,
        suspicion: 'red',
      });
      red_flags.push({
        flag_key: 'tox.magnets',
        i18n_action_key: 'tox.magnet.action',
        label_he: t(loc, 'tox.magnet.action'),
        action_he: t(loc, 'tox.magnet.action'),
        severity: 'critical',
        source_anchor: NELSON_MAGNET,
        verification_status: DRAFT,
      });
    }
  }

  const tests = [];
  if (kind === 'paracetamol') {
    pushKb({
      pattern_key: 'tox.paracetamol',
      title_he: 'Paracetamol — בליעה מדווחת (לא סיווג רעילות בלי סף מאומת)',
      source_anchor: NELSON_APAP,
      extra_anchors: [NELSON_TOX],
    });
    tests.push({
      test_he: 'רמת Paracetamol + זמן בליעה לפי פרוטוקול טוקסיקולוגיה מקומי מאומת. אין NAC/מינון במנוע.',
      source_anchor: NELSON_APAP,
      verification_status: DRAFT,
    });
    red_flags.push({
      flag_key: 'tox.paracetamol',
      label_he: 'בליעת Paracetamol',
      action_he: t(loc, 'emergency.ed'),
      i18n_action_key: 'emergency.ed',
      severity: 'critical',
      source_anchor: NELSON_APAP,
      verification_status: DRAFT,
    });
  }
  if (kind === 'ibuprofen') {
    pushKb({
      pattern_key: 'tox.ibuprofen',
      title_he: 'Ibuprofen — בליעה מדווחת (לא סיווג רעילות בלי סף מאומת)',
      source_anchor: NELSON_IBU,
    });
    tests.push({
      test_he: 'הערכה לפי פרוטוקול טוקסיקולוגיה מקומי מאומת. אין מינון במנוע.',
      source_anchor: NELSON_IBU,
      verification_status: DRAFT,
    });
  }

  if (kbItems[0] && tests.length) {
    kbItems[0] = {
      ...kbItems[0],
      extra_anchors: [...new Set([...(kbItems[0].extra_anchors ?? []), ...tests.map((x) => x.source_anchor)])],
    };
  }

  const deterministic = [];
  if (isNum(mgPerKg)) {
    deterministic.push({
      key: 'tox.mg_per_kg',
      label_he: 'כמות נבלעת (חשבון בלבד)',
      value: mgPerKg,
      unit: 'mg/kg',
      formula_source: 'ingested_mg / weight_kg (not a toxicity cutoff)',
    });
  }

  const differential = kbItems.map((k, i) => ({
    direction_id: `TOX-${i + 1}`,
    i18n_key: k.i18n_key,
    diagnosis_direction_he: k.title_he,
    vs_he: 'טוקסידרום/בליעה אינם מזהים חומר ודאי; מרכז הרעלות לפי פרוטוקול',
    source_anchors: [k.source_anchor, ...(k.extra_anchors ?? [])],
    verification_status: DRAFT,
  }));

  const factBlock = buildFactBlock({
    kbItems,
    deterministic,
    patientData: [
      ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
      ...[...flags].map((f) => ({ key: `tox_${f}`, label_he: f, value: 'present' })),
    ],
    mode,
  });

  return finalizeLocale({
    ok: true,
    engine: 'toxicology',
    verification_status: DRAFT,
    matched_patterns: kbItems.map((k) => k.pattern_key),
    toxidrome_flags: [...flags],
    ingestion_kind: kind,
    mg_per_kg: mgPerKg,
    kbItems,
    red_flags,
    emergency: red_flags.length > 0,
    differential,
    recommended_tests: tests,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: ['אין אנטידוט/NAC/מינון במנוע זה. מרכז הרעלות לפי פרוטוקול מקומי מאומת.'],
  }, loc);
}

/* ── PECARN + Lund-Browder ───────────────────────────────────────────── */

const PECARN_2Y = 730;

export function classifyPecarn({ ageDays, gcs, findings = [], features = {}, mechanism = null } = {}) {
  const under2 = isNum(ageDays) && ageDays < PECARN_2Y;
  const over2 = isNum(ageDays) && ageDays >= PECARN_2Y;
  if (!isNum(ageDays)) return { ok: false, reason: 'age_required' };

  const t = blob(findings);
  const ams = features.altered_mental_status === true || /altered|agitat|somnol|repetitive|ירידת הכרה/.test(t);
  const gcsLow = isNum(gcs) && gcs <= 14;
  const palpableFx = features.palpable_skull_fracture === true || /palpable skull|שקע גולגולת/.test(t);
  const basilar = features.basilar_skull_fracture === true || /raccoon|battle|csf leak|hemotympanum|שבר בסיס/.test(t);
  const hematomaNonfrontal = features.nonfrontal_hematoma === true
    || /parietal hematoma|occipital hematoma|temporal hematoma|המטומה פריאטל|עורפית/.test(t);
  const loc = features.loc === true || /loss of consciousness|איבוד הכרה/.test(t);
  const locGe5 = features.loc_seconds >= 5 || features.loc_ge_5s === true;
  const notNormal = features.not_acting_normally === true || /not acting normally|לא כרגיל/.test(t);
  const vomiting = features.vomiting === true || /vomit|הקאה/.test(t);
  const severeHa = features.severe_headache === true || /severe headache|כאב ראש חזק/.test(t);
  const mech = String(mechanism ?? features.severe_mechanism ?? '').toLowerCase();
  const severeMech = features.severe_mechanism === true
    || /mvc|rollover|ejection|pedestrian|fall >|high-impact|מנגנון קשה/.test(mech) || /מנגנון קשה/.test(t);

  let risk = 'low';
  let pecarn_action = 'no_ct';
  if (under2) {
    if (gcsLow || ams || palpableFx) {
      risk = 'high';
      pecarn_action = 'ct';
    } else if (hematomaNonfrontal || locGe5 || loc || notNormal || severeMech) {
      risk = 'intermediate';
      pecarn_action = 'observe_vs_ct';
    }
  } else if (over2) {
    if (gcsLow || ams || basilar) {
      risk = 'high';
      pecarn_action = 'ct';
    } else if (loc || vomiting || severeHa || severeMech) {
      risk = 'intermediate';
      pecarn_action = 'observe_vs_ct';
    }
  }

  return {
    ok: true,
    age_band: under2 ? 'under_2y' : '2y_and_over',
    risk,
    pecarn_action,
    source_anchor: PECARN_A,
    extra_anchors: [NELSON_TBI],
    verification_status: DRAFT,
  };
}

/** Lund-Browder — אחוזי פרסום קלאסיים לפי גיל (טיוטה). */
const LB_HEAD = [[0, 19], [1, 17], [5, 13], [10, 11], [15, 9], [18, 7]];
const LB_THIGH = [[0, 5.5], [1, 6.5], [5, 8], [10, 8.5], [15, 9], [18, 9.5]];
const LB_LEG = [[0, 5], [1, 5], [5, 5.5], [10, 6], [15, 6.5], [18, 7]];

function interp(table, ageYears) {
  const a = Math.max(0, Number(ageYears));
  for (let i = 0; i < table.length - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (a <= x1) {
      const t = (a - x0) / (x1 - x0 || 1);
      return y0 + t * (y1 - y0);
    }
  }
  return table[table.length - 1][1];
}

export function lundBrowderTbsa({ ageDays, regions = {} } = {}) {
  if (!isNum(ageDays)) return { ok: false, reason: 'age_required' };
  const years = ageDays / 365.25;
  const pct = {
    head: interp(LB_HEAD, years),
    neck: 2,
    anterior_trunk: 13,
    posterior_trunk: 13,
    upper_arm: 4,
    forearm: 3,
    hand: 2.5,
    buttocks: 2.5,
    genitalia: 1,
    thigh: interp(LB_THIGH, years),
    leg: interp(LB_LEG, years),
    foot: 3.5,
  };
  const paired = new Set(['upper_arm', 'forearm', 'hand', 'buttocks', 'thigh', 'leg', 'foot']);
  let total = 0;
  const used = [];
  for (const [k, frac] of Object.entries(regions)) {
    const f = Number(frac);
    if (!isNum(f) || f <= 0) continue;
    const unit = pct[k];
    if (!isNum(unit)) continue;
    const sides = paired.has(k) ? 1 : 1;
    const add = unit * Math.min(1, f) * sides;
    total += add;
    used.push({ region: k, unit_pct: unit, fraction: Math.min(1, f), add });
  }
  total = Math.round(Math.min(100, total) * 10) / 10;
  return {
    ok: true,
    tbsa_pct: total,
    region_units: pct,
    used,
    formula_source: 'Lund-Browder age-banded percentages (draft chart)',
    source_anchor: NELSON_BURN,
    verification_status: DRAFT,
  };
}

export function runTraumaEngine({
  patient = {},
  findings = [],
  features = {},
  gcs = null,
  mechanism = null,
  burn_regions = null,
  mode = 'development',
  locale = 'he',
} = {}) {
  const loc = locale;
  const ageDays = toAgeDays(patient);
  const hasHead = (findings ?? []).some(Boolean) || features.head_trauma === true || gcs != null || mechanism;
  const hasBurn = burn_regions && Object.keys(burn_regions).length;
  if (!hasHead && !hasBurn) return fail('no_trauma_input', { message_he: 'לא סופקו ממצאי חבלת ראש או כוויה.' }, loc);

  const pecarn = hasHead ? classifyPecarn({
    ageDays,
    gcs: Number(gcs ?? features.gcs ?? patient.gcs),
    findings,
    features,
    mechanism,
  }) : null;

  const burn = hasBurn ? lundBrowderTbsa({ ageDays, regions: burn_regions }) : null;
  const kbItems = [];
  const red_flags = [];
  const tests = [];
  const locKey = pecarn?.ok
    ? (pecarn.pecarn_action === 'ct' ? 'pecarn.ct' : pecarn.pecarn_action === 'observe_vs_ct' ? 'pecarn.observe' : 'pecarn.no_ct')
    : null;

  if (pecarn?.ok) {
    kbItems.push({
      pattern_key: `trauma.pecarn.${pecarn.pecarn_action}`,
      i18n_key: locKey,
      title_he: t(loc, locKey),
      direction_he: t(loc, locKey),
      source_anchor: PECARN_A,
      extra_anchors: [NELSON_TBI],
      suspicion: pecarn.risk === 'high' ? 'red' : 'yellow',
      verification_status: DRAFT,
    });
    tests.push({
      test_he: t(loc, locKey),
      i18n_key: locKey,
      source_anchor: PECARN_A,
      verification_status: DRAFT,
    });
    if (pecarn.risk === 'high') {
      red_flags.push({
        flag_key: 'trauma.pecarn.high',
        i18n_action_key: 'pecarn.ct',
        label_he: t(loc, 'pecarn.ct'),
        action_he: t(loc, 'pecarn.ct'),
        severity: 'critical',
        source_anchor: PECARN_A,
        verification_status: DRAFT,
      });
    }
  } else if (hasHead && pecarn && !pecarn.ok) {
    return fail(pecarn.reason, { message_he: 'PECARN דורש גיל לקביעת סף שנתיים.' }, loc);
  }

  if (burn?.ok) {
    kbItems.push({
      pattern_key: 'trauma.lund_browder',
      title_he: `Lund-Browder TBSA ${burn.tbsa_pct}%`,
      source_anchor: NELSON_BURN,
      verification_status: DRAFT,
      suspicion: burn.tbsa_pct >= 10 ? 'red' : 'yellow',
    });
    if (burn.tbsa_pct >= 10) {
      red_flags.push({
        flag_key: 'trauma.burn_tbsa',
        label_he: `שטח כוויה ${burn.tbsa_pct}%`,
        action_he: t(loc, 'emergency.ed'),
        i18n_action_key: 'emergency.ed',
        severity: 'critical',
        source_anchor: NELSON_BURN,
        verification_status: DRAFT,
      });
    }
  }

  const deterministic = [];
  if (burn?.ok) {
    deterministic.push({
      key: 'burn.tbsa_pct',
      label_he: 'TBSA (Lund-Browder)',
      value: burn.tbsa_pct,
      unit: '%',
      formula_source: burn.formula_source,
    });
  }

  const factBlock = buildFactBlock({
    kbItems,
    deterministic,
    patientData: [
      ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
      ...(isNum(Number(gcs ?? features.gcs)) ? [{ key: 'gcs', label_he: 'GCS', value: Number(gcs ?? features.gcs) }] : []),
    ],
    mode,
  });

  return finalizeLocale({
    ok: true,
    engine: 'trauma',
    verification_status: DRAFT,
    pecarn,
    burn,
    matched_patterns: kbItems.map((k) => k.pattern_key),
    kbItems,
    red_flags,
    emergency: red_flags.length > 0,
    differential: kbItems.map((k, i) => ({
      direction_id: `TR-${i + 1}`,
      i18n_key: k.i18n_key,
      diagnosis_direction_he: k.title_he,
      vs_he: 'כלל PECARN/Lund-Browder אינם מחליפים שיקול קליני',
      source_anchors: [k.source_anchor, ...(k.extra_anchors ?? [])],
      verification_status: DRAFT,
    })),
    recommended_tests: tests,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
  }, loc);
}

/* ── Growth + immunizations ──────────────────────────────────────────── */

export function runGrowthImmunizationEngine({
  patient = {},
  weight_kg = null,
  height_cm = null,
  lmsTable = null,
  father_cm = null,
  mother_cm = null,
  falling_percentiles = false,
  immunization = {},
  mode = 'development',
  locale = 'he',
} = {}) {
  const loc = locale;
  const ageDays = toAgeDays(patient);
  const sex = patient.sex ?? patient.gender;
  const w = Number(weight_kg ?? patient.weight_kg);
  const h = Number(height_cm ?? patient.height_cm);
  const hasGrowth = isNum(w) || isNum(h) || lmsTable || father_cm || falling_percentiles;
  const hasVax = immunization && Object.keys(immunization).length;
  if (!hasGrowth && !hasVax) return fail('no_growth_vax_input', { message_he: 'לא סופקו מדדי גדילה או סטטוס חיסונים.' }, loc);

  const kbItems = [];
  const red_flags = [];
  const tests = [];
  const deterministic = [];
  let z = null;

  if (isNum(w) && lmsTable) {
    const gp = growthPercentile({
      measurement: w, age_days: ageDays, sex, metric: 'wfa', lmsTable,
    });
    if (gp.ok) {
      z = gp.z_score;
      deterministic.push({ ...gp, key: 'growth.wfa_percentile' });
      if (isNum(z) && z <= -2) {
        kbItems.push({
          pattern_key: 'growth.ftt_screen',
          i18n_key: 'flag.fft',
          title_he: t(loc, 'flag.fft'),
          source_anchor: NELSON_FTT,
          extra_anchors: [WHO_GROWTH],
          suspicion: 'yellow',
          verification_status: DRAFT,
        });
        red_flags.push({
          flag_key: 'growth.ftt',
          i18n_key: 'flag.fft',
          label_he: t(loc, 'flag.fft'),
          action_he: 'בירור FTT לפי פרוטוקול מקומי — Z בודד אינו אבחנה',
          source_anchor: NELSON_FTT,
          verification_status: DRAFT,
        });
      }
    }
  } else if (isNum(w) && !lmsTable) {
    tests.push({
      test_he: 'לא חושב Z-score — חסרה טבלת LMS מאומתת (WHO/CDC). אין הערכה מהזיכרון.',
      source_anchor: WHO_GROWTH,
      verification_status: DRAFT,
    });
  }

  if (falling_percentiles) {
    kbItems.push({
      pattern_key: 'growth.falling_percentiles',
      i18n_key: 'flag.fft',
      title_he: t(loc, 'flag.fft'),
      source_anchor: NELSON_FTT,
      verification_status: DRAFT,
    });
  }

  if (father_cm && mother_cm) {
    const mph = midParentalHeight({ father_cm, mother_cm, sex });
    if (mph.ok) deterministic.push(mph);
  }

  const delayed = immunization.delayed === true || immunization.catch_up === true || immunization.missed_doses === true;
  const live = immunization.live_vaccine_planned === true;
  const immuno = immunization.immunodeficiency === true || immunization.severe_immunodeficiency === true;
  const anaph = immunization.anaphylaxis_to_component === true;

  if (delayed) {
    kbItems.push({
      pattern_key: 'vax.catch_up',
      title_he: 'השלמת חיסונים (Catch-up) לפי חוזר משרד הבריאות — ללא מרווחים מהזיכרון',
      source_anchor: MOH_CATCH,
      extra_anchors: [MOH_VAX],
      verification_status: DRAFT,
    });
    tests.push({
      test_he: 'Catch-up לפי החוזר העדכני של משרד הבריאות / טיפת חלב. אין לוח חיסונים verbatim במנוע.',
      source_anchor: MOH_CATCH,
      verification_status: DRAFT,
    });
  }
  if (anaph || (live && immuno)) {
    red_flags.push({
      flag_key: 'vax.contraindication',
      label_he: 'התווית נגד אפשרית לחיסון',
      action_he: 'אל תחסן ממנוע זה. אנפילקסיס לרכיב או חיסון חי + דיכוי חיסוני חמור — לפי חוזר מאומת.',
      source_anchor: MOH_VAX,
      verification_status: DRAFT,
    });
    kbItems.push({
      pattern_key: 'vax.contraindication',
      title_he: 'התווית נגד — טיוטה לאימות מול החוזר',
      source_anchor: MOH_VAX,
      suspicion: 'red',
      verification_status: DRAFT,
    });
  }

  if (kbItems[0]) {
    const extras = [...tests.map((x) => x.source_anchor), WHO_GROWTH, MOH_VAX].filter(Boolean);
    kbItems[0] = { ...kbItems[0], extra_anchors: [...new Set([...(kbItems[0].extra_anchors ?? []), ...extras])] };
  }

  const factBlock = buildFactBlock({
    kbItems,
    deterministic,
    patientData: [
      ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
      ...(isNum(w) ? [{ key: 'weight_kg', label_he: 'משקל', value: w, unit: 'kg' }] : []),
      ...(isNum(z) ? [{ key: 'wfa_z', label_he: 'Z משקל לגיל', value: z }] : []),
    ],
    mode,
  });

  return finalizeLocale({
    ok: true,
    engine: 'growth_immunization',
    verification_status: DRAFT,
    z_score: z,
    matched_patterns: kbItems.map((k) => k.pattern_key),
    kbItems,
    red_flags,
    emergency: red_flags.some((f) => f.flag_key === 'vax.contraindication'),
    differential: kbItems.map((k, i) => ({
      direction_id: `GV-${i + 1}`,
      i18n_key: k.i18n_key,
      diagnosis_direction_he: k.title_he,
      vs_he: 'Z בודד / סטטוס חיסון אינם אבחנה',
      source_anchors: [k.source_anchor, ...(k.extra_anchors ?? [])],
      verification_status: DRAFT,
    })),
    recommended_tests: tests,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'Z-score רק מטבלת LMS שסופקה. לוח החיסונים לא מועתק מהזיכרון.',
    ],
  }, loc);
}

export function runExpertModules(params = {}) {
  const domain = params.domain || params.module;
  if (domain === 'toxicology' || domain === 'tox') return runToxicologyEngine(params);
  if (domain === 'trauma' || domain === 'pecarn' || domain === 'burns') return runTraumaEngine(params);
  if (domain === 'growth' || domain === 'immunization' || domain === 'vax') return runGrowthImmunizationEngine(params);
  return fail('unknown_expert_module', { message_he: 'יש לציין domain: toxicology | trauma | growth' }, params.locale);
}
