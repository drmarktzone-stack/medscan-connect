/**
 * DoctorPedAI — מנוע אולטרסאונד ילדים: פרקי ירכיים (DDH/Graf) ו-US מוח בילוד
 *
 * דטרמיניסטי, ללא LLM. מקבל **מדידות/אנוטציות** (זוויות α/β, דרגת IVH)
 * ולא מנחש מילים מפיקסלים. סיווג Graf הוא הגדרת הסיווג (כמו נוסחת Bazett),
 * עדיין מעוגן כטיוטה ל-ACR/Nelson.
 *
 * Red flag מיידי: IVH דרגה 3–4 או PVL → ייעוץ נאונטולוגי/נוירוכירורגי דחוף.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

/** סף Graf IIa מול IIb — 12 שבועות = 84 ימים (הגדרת הסיווג, לא סף מ"מ מומצא). */
export const GRAF_IIA_MAX_AGE_DAYS = 84;

const ACR_DDH = 'needs_verification.acr.pediatric.ddh';
const ACR_NSG = 'needs_verification.acr.pediatric.neurosonography';
const NELSON_DDH = 'needs_verification.nelson.orthopedics.developmental_dysplasia_hip';
const NELSON_IVH = 'needs_verification.nelson.neonatology.ivh';
const NELSON_PVL = 'needs_verification.nelson.neonatology.pvl';
const NELSON_HYDRO = 'needs_verification.nelson.neonatology.hydrocephalus';

const fail = (reason, extra = {}) => ({
  ok: false,
  reason,
  verification_status: 'unavailable',
  disclaimer_he: DISCLAIMER_HE,
  ...extra,
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function pickNum(...vals) {
  for (const v of vals) {
    if (isNum(v)) return v;
    const n = Number(v);
    if (v != null && v !== '' && isNum(n)) return n;
  }
  return null;
}

/**
 * סיווג Graf לפי זווית Alpha (מעלות) ± Beta ± פריקה.
 * I: α ≥ 60°
 * IIa: 50° ≤ α < 60° וגיל < 12 שבועות
 * IIb: 50° ≤ α < 60° וגיל ≥ 12 שבועות
 * IIa_or_IIb: 50–59.9° בלי גיל — לא מנחשים
 * III: α < 50° ואינו פרוק
 * IV: פרוק / inverted labrum
 */
export function classifyGraf({ alpha_deg, beta_deg, ageDays, dislocated, inverted_labrum } = {}) {
  const alpha = pickNum(alpha_deg);
  const beta = pickNum(beta_deg);
  const dislocation = dislocated === true || inverted_labrum === true;
  if (dislocation) {
    return {
      ok: true,
      type: 'IV',
      label_he: 'Graf Type IV — ירך פרוקה',
      alpha_deg: alpha,
      beta_deg: beta,
      source_anchor: ACR_DDH,
      extra_anchors: [NELSON_DDH],
      verification_status: DRAFT,
      abnormal: true,
    };
  }
  if (!isNum(alpha)) {
    return { ok: false, reason: 'missing_alpha' };
  }
  if (alpha >= 60) {
    return {
      ok: true,
      type: 'I',
      label_he: 'Graf Type I — ירך בשלה/תקינה לסיווג',
      alpha_deg: alpha,
      beta_deg: beta,
      source_anchor: ACR_DDH,
      extra_anchors: [NELSON_DDH],
      verification_status: DRAFT,
      abnormal: false,
    };
  }
  if (alpha >= 50) {
    if (!isNum(ageDays)) {
      return {
        ok: true,
        type: 'IIa_or_IIb',
        label_he: 'Graf Type IIa או IIb — נדרש גיל (סף 12 שבועות) כדי להבחין',
        alpha_deg: alpha,
        beta_deg: beta,
        source_anchor: ACR_DDH,
        extra_anchors: [NELSON_DDH],
        verification_status: DRAFT,
        abnormal: true,
        needs_age: true,
      };
    }
    if (ageDays < GRAF_IIA_MAX_AGE_DAYS) {
      return {
        ok: true,
        type: 'IIa',
        label_he: 'Graf Type IIa — בשלות פיזיולוגית (גיל < 12 שבועות)',
        alpha_deg: alpha,
        beta_deg: beta,
        source_anchor: ACR_DDH,
        extra_anchors: [NELSON_DDH],
        verification_status: DRAFT,
        abnormal: true,
      };
    }
    return {
      ok: true,
      type: 'IIb',
      label_he: 'Graf Type IIb — דיספלזיה בגיל ≥ 12 שבועות',
      alpha_deg: alpha,
      beta_deg: beta,
      source_anchor: ACR_DDH,
      extra_anchors: [NELSON_DDH],
      verification_status: DRAFT,
      abnormal: true,
    };
  }
  return {
    ok: true,
    type: 'III',
    label_he: 'Graf Type III — גג אצטבולרי שטוח, לא פרוק',
    alpha_deg: alpha,
    beta_deg: beta,
    source_anchor: ACR_DDH,
    extra_anchors: [NELSON_DDH],
    verification_status: DRAFT,
    abnormal: true,
  };
}

/**
 * IVH לפי אנוטציית Papile (דרגה 1–4) — לא מפיקסלים.
 * PVL / הידרוצפלוס רק אם סומנו. אין ספי מ"מ חדרי מומצאים.
 */
export function classifyCranialUs(cranial = {}) {
  const gradeRaw = cranial.ivh_grade ?? cranial.IVH ?? cranial.papile_grade;
  let ivh_grade = null;
  if (gradeRaw === 0 || gradeRaw === '0' || gradeRaw === 'none' || gradeRaw === false) ivh_grade = 0;
  else {
    const n = pickNum(gradeRaw);
    if (isNum(n) && n >= 1 && n <= 4) ivh_grade = n;
  }

  const pvl = cranial.pvl === true || cranial.PVL === true || String(cranial.pvl ?? '').toLowerCase() === 'true';
  const hydro =
    cranial.hydrocephalus === true ||
    cranial.ventriculomegaly === true ||
    cranial.ventricular_dilatation === true;

  const findings = [];
  if (isNum(ivh_grade) && ivh_grade >= 1) {
    findings.push({
      key: `us.ivh_grade_${ivh_grade}`,
      grade: ivh_grade,
      title_he: `IVH Grade ${ivh_grade} (Papile) — מאנוטציה`,
      source_anchor: NELSON_IVH,
      extra_anchors: [ACR_NSG],
      critical: ivh_grade >= 3,
    });
  }
  if (pvl) {
    findings.push({
      key: 'us.pvl',
      title_he: 'Periventricular Leukomalacia (PVL) — מאנוטציה',
      source_anchor: NELSON_PVL,
      extra_anchors: [ACR_NSG],
      critical: true,
    });
  }
  if (hydro) {
    findings.push({
      key: 'us.hydrocephalus',
      title_he: 'הידרוצפלוס / הרחבת חדרים — מאנוטציה (אין סף מ"מ במנוע)',
      source_anchor: NELSON_HYDRO,
      extra_anchors: [ACR_NSG],
      critical: false,
    });
  }

  return {
    ivh_grade,
    pvl,
    hydrocephalus: hydro,
    findings,
    has_input:
      isNum(ivh_grade) ||
      pvl ||
      hydro ||
      cranial.annotated === true,
  };
}

function hipList(hips) {
  if (!hips) return [];
  if (Array.isArray(hips)) return hips;
  if (hips.left || hips.right) {
    const out = [];
    if (hips.left) out.push({ side: 'left', ...hips.left });
    if (hips.right) out.push({ side: 'right', ...hips.right });
    if (out.length) return out;
  }
  return [{ side: hips.side ?? 'unspecified', ...hips }];
}

function kbFromGraf(g, side) {
  const extra = [NELSON_DDH];
  const cit = extra
    .map((a) => attachLiteratureCitation({ source_anchor: a }).literature_citation?.display_he)
    .filter(Boolean);
  return {
    pattern_key: `us.graf_${g.type}_${side || 'hip'}`,
    title_he: `US ירך (${side || '—'}): ${g.label_he}`,
    direction_he: g.label_he,
    suspicion: g.type === 'I' ? 'green' : 'yellow',
    clinical_reasoning_he: `α=${g.alpha_deg}°` + (isNum(g.beta_deg) ? `, β=${g.beta_deg}°` : ''),
    source_anchor: ACR_DDH,
    extra_anchors: extra,
    verification_status: DRAFT,
    summary_he: cit.length ? `עיגון נוסף: ${cit.join('; ')}` : null,
  };
}

function kbFromCranial(f) {
  return {
    pattern_key: f.key,
    title_he: f.title_he,
    direction_he: f.title_he,
    suspicion: f.critical ? 'red' : 'yellow',
    source_anchor: f.source_anchor,
    extra_anchors: f.extra_anchors ?? [],
    verification_status: DRAFT,
  };
}

/**
 * @param {object} params
 * @param {object} [params.patient]
 * @param {object|object[]} [params.hips]
 * @param {object} [params.cranial]
 * @param {string} [params.mode]
 */
export function runPediatricUltrasound({
  patient = {},
  hips = null,
  cranial = null,
  mode = 'development',
  locale = 'he',
} = {}) {
  const ageDays = toAgeDays(patient);
  const hipInputs = hipList(hips);
  const grafResults = [];
  const grafErrors = [];

  for (const h of hipInputs) {
    const hasMeasure =
      isNum(pickNum(h.alpha_deg, h.alpha, h.Alpha)) ||
      h.dislocated === true ||
      h.inverted_labrum === true;
    if (!hasMeasure && hipInputs.length === 1 && !cranial) {
      grafErrors.push({ side: h.side, reason: 'missing_alpha' });
      continue;
    }
    if (!hasMeasure) continue;
    const g = classifyGraf({
      alpha_deg: pickNum(h.alpha_deg, h.alpha, h.Alpha),
      beta_deg: pickNum(h.beta_deg, h.beta, h.Beta),
      ageDays,
      dislocated: h.dislocated,
      inverted_labrum: h.inverted_labrum,
    });
    if (!g.ok) grafErrors.push({ side: h.side, reason: g.reason });
    else grafResults.push({ side: h.side ?? 'unspecified', ...g });
  }

  const cranialIn = cranial && typeof cranial === 'object' ? cranial : {};
  const cranialRes = classifyCranialUs(cranialIn);
  const hasCranial = cranial != null && cranialRes.has_input;
  const hasHips = grafResults.length > 0;

  if (!hasHips && !hasCranial) {
    const reason = grafErrors.some((e) => e.reason === 'missing_alpha')
      ? 'missing_alpha'
      : 'no_ultrasound_input';
    return finalizeLocale(fail(reason, {
      message_he:
        reason === 'missing_alpha'
          ? 'חסרה זווית Alpha לסיווג Graf — לא מנחשים מפיקסלים.'
          : 'לא סופקו מדידות Graf או אנוטציות US מוח.',
    }), locale);
  }

  const kbItems = [
    ...grafResults.map((g) => kbFromGraf(g, g.side)),
    ...cranialRes.findings.map(kbFromCranial),
  ];

  const red_flags = [];
  for (const f of cranialRes.findings) {
    if (f.key.startsWith('us.ivh_grade_') && f.grade >= 3) {
      red_flags.push({
        flag_key: 'us.ivh_grade_3_4',
        label_he: `דימום תוך-חדרי דרגה ${f.grade}`,
        severity: 'critical',
        action_he: 'Red flag מיידי: ייעוץ נאונטולוגי ונוירוכירורגי דחוף.',
        source_anchor: NELSON_IVH,
        extra_anchors: [ACR_NSG],
        verification_status: DRAFT,
      });
    }
    if (f.key === 'us.pvl') {
      red_flags.push({
        flag_key: 'us.pvl',
        label_he: 'PVL',
        severity: 'critical',
        action_he: 'Red flag מיידי: ייעוץ נאונטולוגי ונוירוכירורגי דחוף.',
        source_anchor: NELSON_PVL,
        extra_anchors: [ACR_NSG],
        verification_status: DRAFT,
      });
    }
  }

  const differential = [];
  for (const g of grafResults) {
    differential.push({
      direction_id: `US-GRAF-${g.side}-${g.type}`,
      diagnosis_direction_he: g.label_he,
      vs_he: g.type === 'I'
        ? 'סיווג זוויתי בלבד — אינו מחליף בדיקה קלינית (Ortolani/Barlow)'
        : 'יש להפנות לאורתופדיית ילדים לפי פרוטוקול DDH מקומי',
      source_anchors: [ACR_DDH, NELSON_DDH],
      supports_he: [`α=${g.alpha_deg}°`],
      based_on_patterns: [`us.graf_${g.type}`],
      verification_status: DRAFT,
    });
  }
  for (const f of cranialRes.findings) {
    differential.push({
      direction_id: `US-${f.key}`,
      diagnosis_direction_he: f.title_he,
      vs_he: 'מבוסס אנוטציה, לא מדידת מ"מ שהומצאה במנוע',
      source_anchors: [f.source_anchor, ...(f.extra_anchors ?? [])],
      based_on_patterns: [f.key],
      verification_status: DRAFT,
    });
  }

  const recommended_tests = [];
  if (grafResults.some((g) => g.type !== 'I')) {
    recommended_tests.push({
      test_he: 'הפניה לאורתופדיית ילדים / מעקב DDH לפי הנחיות ACR ו-Nelson (פרוטוקול מקומי)',
      source_anchor: ACR_DDH,
      verification_status: DRAFT,
    });
  }
  if (cranialRes.findings.some((f) => f.critical)) {
    recommended_tests.push({
      test_he: 'ייעוץ נאונטולוגי ונוירוכירורגי דחוף; מעקב US/דימות לפי פרוטוקול מקומי',
      source_anchor: NELSON_IVH,
      verification_status: DRAFT,
    });
  } else if (cranialRes.hydrocephalus) {
    recommended_tests.push({
      test_he: 'הערכת הידרוצפלוס קלינית + מעקב היקף ראש / US לפי פרוטוקול מקומי',
      source_anchor: NELSON_HYDRO,
      verification_status: DRAFT,
    });
  }

  const patientData = [
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
    ...grafResults.map((g) => ({
      key: `graf_alpha_${g.side}`,
      label_he: `זווית Alpha (${g.side})`,
      value: g.alpha_deg,
      unit: 'deg',
    })),
    ...(isNum(cranialRes.ivh_grade)
      ? [{ key: 'ivh_grade', label_he: 'IVH grade (אנוטציה)', value: cranialRes.ivh_grade }]
      : []),
  ];

  const deterministic = grafResults.map((g) => ({
    key: `graf_type_${g.side}`,
    label_he: `סיווג Graf (${g.side})`,
    value: g.type,
    formula_source: 'Graf alpha/beta classification (12-week IIa/IIb threshold = 84 days)',
  }));

  const factBlock = buildFactBlock({ kbItems, deterministic, patientData, mode });

  return finalizeLocale({
    ok: true,
    engine: 'pediatric_ultrasound',
    verification_status: DRAFT,
    age_days: ageDays,
    graf: grafResults,
    cranial: {
      ivh_grade: cranialRes.ivh_grade,
      pvl: cranialRes.pvl,
      hydrocephalus: cranialRes.hydrocephalus,
    },
    matched_patterns: kbItems.map((k) => k.pattern_key),
    kbItems,
    red_flags,
    safety_alerts: red_flags,
    emergency: red_flags.length > 0,
    differential,
    recommended_tests,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'זוויות Graf ודרגות IVH מתקבלות כקלט — המנוע אינו מחלץ אותן מתמונה.',
      'אין ספי קוטר חדרים במ"מ. הידרוצפלוס רק מאנוטציה.',
    ],
    unknowns_he: grafResults.some((g) => g.type === 'IIa_or_IIb')
      ? ['גיל חסר — לא הובחן Graf IIa מול IIb.']
      : [],
  }, locale);
}
