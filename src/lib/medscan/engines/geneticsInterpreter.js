/**
 * DoctorPedAI — מנוע הערכה גנטית וסינדרומולוגיה (Pediatric Dysmorphology)
 *
 * דטרמיניסטי, ללא LLM. מצליב תווי דיסמורפיזם שסומנו (לא מנוחשים מתמונה)
 * לאבחנה מבדלת של תסמונות נבחרות. אינו אבחנה גנטית.
 *
 * עיגון: Nelson Genetics / OMIM. המלצות עבודה: Karyotype / CMA / WES
 * לפי פנוטיפ — בלי שמות גנים כ"אבחנה" ובלי פאנלים מומצאים.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

/** מינימום מאפיינים תומכים כדי להציג תסמונת באבחנה מבדלת. */
export const MIN_SUPPORTING_FEATURES = 2;

const fail = (reason, extra = {}) => ({
  ok: false,
  reason,
  verification_status: 'unavailable',
  disclaimer_he: DISCLAIMER_HE,
  ...extra,
});

function normKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '');
}

export const FEATURE_ALIASES = Object.freeze({
  low_set_ears: ['low-set ears', 'low set ears', 'lowset ears', 'אוזניים נמוכות', 'אוזן נמוכה'],
  hypertelorism: ['hypertelorism', 'היפרטלוריזם', 'עיניים מרוחקות'],
  epicanthal_folds: ['epicanthal folds', 'epicanthus', 'epicanthal fold', 'קפלי אפיקנטוס', 'אפיקנטוס'],
  micrognathia: ['micrognathia', 'micrognathy', 'מיקרוגנתיה', 'לסת קטנה'],
  single_palmar_crease: [
    'single palmar crease', 'simian crease', 'transverse palmar crease',
    'קפל פלמרי יחיד', 'קפל סימיאני',
  ],
  upslanting_palpebral: ['upslanting palpebral fissures', 'upslanting', 'סדקי עפעף כלפי מעלה'],
  brachycephaly: ['brachycephaly', 'ברכיצפליה'],
  hypotonia: ['hypotonia', 'היפוטוניה'],
  sandal_gap: ['sandal gap', 'sandal-gap', 'רווח סנדל'],
  brushfield_spots: ['brushfield', 'brushfield spots', 'כתמי ברשפילד'],
  protruding_tongue: ['protruding tongue', 'macroglossia', 'לשון בולטת', 'מקרוגלוסיה'],
  webbed_neck: ['webbed neck', 'cystic hygroma', 'צוואר ממברנלי', 'צוואר מכונף'],
  short_stature: ['short stature', 'קומה נמוכה'],
  widely_spaced_nipples: ['widely spaced nipples', 'widely-spaced nipples', 'פטמות מרוחקות'],
  lymphedema: ['lymphedema', 'לימפאדמה', 'בצקת גב כף היד'],
  cubitus_valgus: ['cubitus valgus', 'קביטוס ולגוס'],
  coarctation: ['coarctation', 'coarctation of aorta', 'קוארקטציה'],
  downslanting_palpebral: ['downslanting palpebral fissures', 'downslanting', 'סדקי עפעף כלפי מטה'],
  pectus: ['pectus', 'pectus excavatum', 'pectus carinatum', 'חזה משפך', 'פקטוס'],
  pulmonic_stenosis: ['pulmonic stenosis', 'pulmonary stenosis', 'היצרות ריאתית'],
  stellate_iris: ['stellate iris', 'stellate pattern iris', 'קשתית כוכבית'],
  perioral_fullness: ['perioral fullness', 'full lips', 'שפתיים מלאות'],
  elfin_facies: ['elfin facies', 'elfin face', 'פני אלף'],
  supravalvular_as: ['supravalvular as', 'supravalvular aortic stenosis', 'היצרות אאורטלית סופראוולוולרית'],
  hypercalcemia: ['hypercalcemia', 'היפרקלצמיה'],
  cleft_palate: ['cleft palate', 'palatal cleft', 'חיך שסוע'],
  conotruncal_heart: ['conotruncal', 'truncus', 'interrupted aortic arch', 'מום קונוטרונקלי'],
  tetralogy: ['tetralogy of fallot', 'tof', 'טטרלוגיה'],
  hypocalcemia: ['hypocalcemia', 'היפוקלצמיה'],
  immunodeficiency: ['immunodeficiency', 'חסר חיסוני', 't-cell'],
});

export const SYNDROME_CATALOG = Object.freeze([
  Object.freeze({
    pattern_key: 'genetics.down',
    title_he: 'תסמונת דאון (Trisomy 21) — כיוון פנוטיפי',
    suspicion: 'yellow',
    source_anchor: 'needs_verification.nelson.genetics.down_syndrome',
    extra_anchors: [
      'needs_verification.omim.190685.down_syndrome',
      'needs_verification.orphanet.870.down_syndrome',
    ],
    supports: [
      'epicanthal_folds', 'single_palmar_crease', 'upslanting_palpebral',
      'brachycephaly', 'hypotonia', 'sandal_gap', 'brushfield_spots',
      'protruding_tongue', 'low_set_ears',
    ],
    // היפרטלוריזם ומקרוגנתיה אינם הסממנים הקלאסיים לדאון (יותר Noonan/22q).
    refutes: ['hypertelorism', 'micrognathia'],
    sex: 'any',
    differential: [
      {
        direction_id: 'GEN-DS1',
        diagnosis_direction_he: 'תסמונת דאון (טריזומיה 21) — כיוון',
        vs_he: 'יש לאשר בקריוטיפ; פנוטיפ אינו אבחנה',
      },
      {
        direction_id: 'GEN-DS2',
        diagnosis_direction_he: 'העתק/תסמונת אחרת עם היפוטוניה וקפל סימיאני',
        vs_he: 'CMA אם הקריוטיפ תקין או הפנוטיפ לא-קלאסי',
      },
    ],
    workup: [
      {
        test_he: 'Karyotype (קריוטיפ) — בדיקת בחירה לחשד אנאופלואידיה (דאון/טרנר)',
        source_anchor: 'needs_verification.nelson.genetics.karyotype',
      },
    ],
  }),
  Object.freeze({
    pattern_key: 'genetics.turner',
    title_he: 'תסמונת טרנר (45,X) — כיוון פנוטיפי',
    suspicion: 'yellow',
    source_anchor: 'needs_verification.nelson.genetics.turner_syndrome',
    extra_anchors: ['needs_verification.orphanet.881.turner_syndrome'],
    supports: [
      'webbed_neck', 'short_stature', 'widely_spaced_nipples', 'lymphedema',
      'cubitus_valgus', 'coarctation', 'low_set_ears',
    ],
    refutes: ['hypertelorism', 'single_palmar_crease', 'epicanthal_folds'],
    sex: 'female_or_unknown',
    differential: [
      {
        direction_id: 'GEN-TS1',
        diagnosis_direction_he: 'תסמונת טרנר (45,X / מוזאיקה) — כיוון',
        vs_he: 'רק בפנוטיפ נקבה/מין לא ידוע; חובה קריוטיפ',
      },
      {
        direction_id: 'GEN-TS2',
        diagnosis_direction_he: 'Noonan / RASopathy עם צוואר ממברנלי',
        vs_he: 'אם קריוטיפ תקין — CMA ואז פאנל/WES לפי פרוטוקול',
      },
    ],
    workup: [
      {
        test_he: 'Karyotype (קריוטיפ) — בדיקת בחירה לחשד טרנר',
        source_anchor: 'needs_verification.nelson.genetics.karyotype',
      },
    ],
  }),
  Object.freeze({
    pattern_key: 'genetics.noonan',
    title_he: 'תסמונת נונאן (RASopathy) — כיוון פנוטיפי',
    suspicion: 'yellow',
    source_anchor: 'needs_verification.nelson.genetics.noonan_syndrome',
    extra_anchors: [
      'needs_verification.omim.163950.noonan_syndrome',
      'needs_verification.orphanet.648.noonan_syndrome',
    ],
    supports: [
      'hypertelorism', 'low_set_ears', 'epicanthal_folds', 'micrognathia',
      'webbed_neck', 'short_stature', 'downslanting_palpebral', 'pectus',
      'pulmonic_stenosis',
    ],
    // epicanthus + אוזניים נמוכות לבדם חופפים לדאון — דורשים תו מבחין.
    requireAny: [
      'hypertelorism', 'micrognathia', 'webbed_neck', 'short_stature',
      'downslanting_palpebral', 'pectus', 'pulmonic_stenosis',
    ],
    refutes: ['single_palmar_crease', 'upslanting_palpebral'],
    sex: 'any',
    differential: [
      {
        direction_id: 'GEN-NS1',
        diagnosis_direction_he: 'תסמונת נונאן / RASopathy — כיוון',
        vs_he: 'פנוטיפ בלבד אינו מזהה גן; אין לרשום שם גן כאבחנה',
      },
      {
        direction_id: 'GEN-NS2',
        diagnosis_direction_he: 'תסמונת 22q11.2 / CNV אחר',
        vs_he: 'CMA שולל העתקים לפני פאנל',
      },
    ],
    workup: [
      {
        test_he: 'CMA (צ\'יפ גנטי) — לשלילת CNV לפני פאנל/WES',
        source_anchor: 'needs_verification.nelson.genetics.cma',
      },
      {
        test_he: 'WES או פאנל RASopathy לפי פרוטוקול מקומי מאומת — רק אם CMA לא-אבחוני',
        source_anchor: 'needs_verification.nelson.genetics.wes',
      },
    ],
  }),
  Object.freeze({
    pattern_key: 'genetics.williams',
    title_he: 'תסמונת וויליאמס (7q11.23) — כיוון פנוטיפי',
    suspicion: 'yellow',
    source_anchor: 'needs_verification.nelson.genetics.williams_syndrome',
    extra_anchors: [
      'needs_verification.omim.194050.williams_syndrome',
      'needs_verification.orphanet.904.williams_syndrome',
    ],
    supports: [
      'stellate_iris', 'perioral_fullness', 'elfin_facies',
      'supravalvular_as', 'hypercalcemia', 'short_stature',
    ],
    refutes: ['single_palmar_crease', 'webbed_neck'],
    sex: 'any',
    differential: [
      {
        direction_id: 'GEN-WS1',
        diagnosis_direction_he: 'תסמונת וויליאמס (מחיקת 7q11.23) — כיוון',
        vs_he: 'לא מאבחנים מתווי פנים כלליים בלבד; CMA מאשר/שולל',
      },
      {
        direction_id: 'GEN-WS2',
        diagnosis_direction_he: 'היצרות אאורטלית / היפרקלצמיה מסיבה אחרת',
        vs_he: 'הקשר קרדיאלי ומטבולי נפרד',
      },
    ],
    workup: [
      {
        test_he: 'CMA (צ\'יפ גנטי) — בדיקת בחירה לחשד וויליאמס / מחיקות מיקרו',
        source_anchor: 'needs_verification.nelson.genetics.cma',
      },
    ],
  }),
  Object.freeze({
    pattern_key: 'genetics.del22q11',
    title_he: 'מחיקת 22q11.2 (DiGeorge / VCFS) — כיוון פנוטיפי',
    suspicion: 'yellow',
    source_anchor: 'needs_verification.nelson.genetics.22q11_deletion',
    extra_anchors: [
      'needs_verification.omim.188400.digeorge',
      'needs_verification.orphanet.567.del22q11',
    ],
    supports: [
      'hypertelorism', 'low_set_ears', 'micrognathia', 'cleft_palate',
      'conotruncal_heart', 'tetralogy', 'hypocalcemia', 'immunodeficiency',
    ],
    requireAny: [
      'hypertelorism', 'micrognathia', 'cleft_palate', 'conotruncal_heart',
      'tetralogy', 'hypocalcemia', 'immunodeficiency',
    ],
    refutes: ['single_palmar_crease', 'stellate_iris'],
    sex: 'any',
    differential: [
      {
        direction_id: 'GEN-22Q1',
        diagnosis_direction_he: 'מחיקת 22q11.2 — כיוון',
        vs_he: 'CMA (או בדיקת מחיקה ייעודית לפי פרוטוקול) ולא פנוטיפ בלבד',
      },
      {
        direction_id: 'GEN-22Q2',
        diagnosis_direction_he: 'תסמונת נונאן / מום לב מבודד',
        vs_he: 'היעדר חיך שסוע / היפוקלצמיה / חסר חיסוני מחליש 22q',
      },
    ],
    workup: [
      {
        test_he: 'CMA (צ\'יפ גנטי) — בדיקת בחירה לחשד 22q11.2 / מומים מרובים',
        source_anchor: 'needs_verification.nelson.genetics.cma',
      },
    ],
  }),
]);

export function canonicalFeature(raw) {
  const n = normKey(raw);
  if (!n) return null;
  for (const [canon, aliases] of Object.entries(FEATURE_ALIASES)) {
    if (n === canon) return canon;
    if (aliases.some((a) => n === normKey(a))) return canon;
  }
  return null;
}

/**
 * מאחד רשימת תווים / ממצאים לקבוצה קנונית.
 * אובייקט עם present:false נספר כהיעדר.
 */
export function normalizeDysmorphicFeatures(features = [], findings = []) {
  const present = new Set();
  const unknown = [];
  const ingest = (item) => {
    if (item == null || item === false) return;
    if (typeof item === 'object') {
      const name = item.name ?? item.feature ?? item.key ?? item.id;
      const on = item.present !== false && item.present !== 'false';
      const canon = canonicalFeature(name);
      if (!canon) {
        if (name) unknown.push(String(name));
        return;
      }
      if (on) present.add(canon);
      return;
    }
    const canon = canonicalFeature(item);
    if (!canon) {
      if (item) unknown.push(String(item));
      return;
    }
    present.add(canon);
  };
  for (const f of features ?? []) ingest(f);
  for (const f of findings ?? []) ingest(f);
  return { present, unknown_tokens: unknown };
}

export function normalizeSex(raw) {
  const n = String(raw ?? '').trim().toLowerCase();
  if (['m', 'male', 'זכר', 'boy', 'בן'].includes(n)) return 'male';
  if (['f', 'female', 'נקבה', 'girl', 'בת'].includes(n)) return 'female';
  return null;
}

function sexAllowed(rule, sex) {
  if (!rule || rule === 'any') return true;
  if (rule === 'female_or_unknown') return sex !== 'male';
  if (rule === 'female') return sex === 'female';
  return true;
}

export function matchGeneticSyndromes(featureSet, { sex = null } = {}) {
  const matched = [];
  for (const s of SYNDROME_CATALOG) {
    if (!sexAllowed(s.sex, sex)) continue;
    const supporting = (s.supports ?? []).filter((k) => featureSet.has(k));
    const refuting = (s.refutes ?? []).filter((k) => featureSet.has(k));
    if (supporting.length < MIN_SUPPORTING_FEATURES) continue;
    if (s.requireAny?.length && !s.requireAny.some((k) => featureSet.has(k))) continue;
    matched.push({
      ...s,
      supporting,
      refuting,
      support_count: supporting.length,
      verification_status: DRAFT,
      evidence_he:
        `תווים תומכים (${supporting.length}): ${supporting.join(', ')}` +
        (refuting.length ? ` · לא-אופייני: ${refuting.join(', ')}` : ''),
    });
  }
  matched.sort((a, b) => b.support_count - a.support_count);
  return matched;
}

function patternToKb(p) {
  const extra = (p.extra_anchors ?? [])
    .map((a) => attachLiteratureCitation({ source_anchor: a }).literature_citation?.display_he)
    .filter(Boolean);
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

function flattenDiff(matched) {
  const out = [];
  for (const p of matched) {
    for (const d of p.differential ?? []) {
      out.push({
        ...d,
        source_anchors: [p.source_anchor, ...(p.extra_anchors ?? [])],
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
  const order = [];
  for (const p of matched) {
    for (const w of p.workup ?? []) order.push({ ...w, from: p.pattern_key });
  }
  const rank = (t) => {
    if (/Karyotype|קריוטיפ/.test(t)) return 0;
    if (/CMA|צ'יפ/.test(t)) return 1;
    if (/WES|פאנל/.test(t)) return 2;
    return 3;
  };
  order.sort((a, b) => rank(a.test_he) - rank(b.test_he));
  for (const w of order) {
    if (seen.has(w.test_he)) continue;
    seen.add(w.test_he);
    out.push({
      test_he: w.test_he,
      source_anchor: w.source_anchor,
      verification_status: DRAFT,
    });
  }
  return out;
}

/**
 * @param {object} params
 * @param {object} [params.patient]
 * @param {Array<string|object>} [params.features]
 * @param {Array<string|object>} [params.findings]
 * @param {string} [params.mode]
 */
export function runGeneticsInterpreter({
  patient = {},
  features = [],
  findings = [],
  mode = 'development',
  locale = 'he',
} = {}) {
  const hasAny = (features ?? []).some(Boolean) || (findings ?? []).some(Boolean);
  if (!hasAny) {
    return finalizeLocale(fail('no_genetics_input', {
      message_he: 'לא סופקו תווי דיסמורפיזם או ממצאים מורפולוגיים.',
    }), locale);
  }

  const ageDays = toAgeDays(patient);
  const sex = normalizeSex(patient.sex ?? patient.gender);
  const { present, unknown_tokens } = normalizeDysmorphicFeatures(features, findings);
  const matched = matchGeneticSyndromes(present, { sex });
  const kbItems = matched.map(patternToKb);

  const workupAnchors = [];
  for (const p of matched) {
    for (const w of p.workup ?? []) {
      if (w.source_anchor) workupAnchors.push(w.source_anchor);
    }
  }
  if (kbItems.length && workupAnchors.length) {
    const extra = new Set([...(kbItems[0].extra_anchors ?? []), ...workupAnchors]);
    kbItems[0] = { ...kbItems[0], extra_anchors: [...extra] };
  }

  const patientData = [
    ...[...present].map((k) => ({ key: `feat_${k}`, label_he: `תו: ${k}`, value: 'present' })),
    ...(sex ? [{ key: 'sex', label_he: 'מין', value: sex }] : []),
    ...(Number.isFinite(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
  ];

  const factBlock = buildFactBlock({ kbItems, deterministic: [], patientData, mode });

  return finalizeLocale({
    ok: true,
    engine: 'genetics_interpreter',
    verification_status: DRAFT,
    age_days: ageDays,
    sex,
    features: [...present],
    matched_patterns: matched.map((p) => p.pattern_key),
    kbItems,
    red_flags: [],
    safety_alerts: [],
    emergency: false,
    differential: flattenDiff(matched),
    recommended_tests: flattenWorkup(matched),
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'הצלבה פנוטיפית בלבד — אינה אבחנה גנטית. Karyotype/CMA/WES לפי כיוון, לא לפי ניחוש גן.',
      'תסמונת טרנר אינה מוצעת בזכר. וויליאמס אינה מוצעת מתווי הפנים הכלליים בלבד.',
    ],
    unknowns_he: [
      ...(matched.length ? [] : ['לא הותאמה תסמונת (≥2 תווים תומכים) — אין משמעות של "תקין".']),
      ...(unknown_tokens.length ? [`תווים לא-קנוניים (לא פוענחו): ${unknown_tokens.join(', ')}`] : []),
    ],
  }, locale);
}
