/**
 * DoctorPedAI — מנוע הצלבת טריאדות / פנטדות / קריטריונים קליניים
 *
 * דטרמיניסטי, ללא LLM. מצליב תלונות, מעבדה, ממצאי עור ודימות
 * לטריאדות מעוגנות Nelson. אחוז ההתאמה הוא מילוי קריטריונים — לא
 * הסתברות אבחנה. אינו אבחנה סופית.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
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

function norm(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/["'׳״]/g, '')
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** כינויים קנוניים למאפייני טריאדות. אל תמפה "פריחה" כללית לפורפורה. */
export const FEATURE_ALIASES = Object.freeze({
  bradycardia: ['bradycardia', 'ברדיקרדיה', 'דופק איטי', 'hr low'],
  hypertension: ['hypertension', 'יתר לחץ דם', 'לחץ דם גבוה', 'htn'],
  irregular_respiration: [
    'irregular respiration', 'irregular breathing', 'cheyne stokes',
    'נשימה לא סדירה', 'נשימות לא סדירות',
  ],
  asthma: ['asthma', 'אסתמה', 'asthma diagnosis'],
  aspirin_sensitivity: [
    'aspirin sensitivity', 'nsaid sensitivity', 'aspirin allergy',
    'רגישות לאספירין', 'רגישות ל-nsaid',
  ],
  nasal_polyps: ['nasal polyps', 'nasal polyposis', 'פוליפים באף'],
  ruq_pain: ['ruq pain', 'right upper quadrant', 'כאב רבע ימני עליון', 'כאב בטן ימני עליון', 'biliary pain'],
  jaundice: ['jaundice', 'icterus', 'צהבת'],
  fever: ['fever', 'pyrexia', 'חום'],
  hypotension: ['hypotension', 'לחץ דם נמוך', 'שוק', 'shock'],
  altered_mental: [
    'altered mental', 'confusion', 'encephalopathy', 'lethargy',
    'ירידת הכרה', 'בלבול', 'אפתיות',
  ],
  maha: [
    'maha', 'microangiopathic', 'schistocytes', 'helmet cells', 'hemolysis',
    'אנמיה המוליטית מיקרואנגיופטית', 'סכיסטוציטים',
  ],
  thrombocytopenia: ['thrombocytopenia', 'low platelets', 'טרומבוציטופניה', 'טסיות נמוכות'],
  aki: [
    'aki', 'acute kidney injury', 'acute renal failure', 'oliguria', 'anuria',
    'פגיעה כלייתית חדה', 'אי ספיקת כליות חדה', 'מיעוט שתן',
  ],
  purpura: ['purpura', 'palpable purpura', 'פורפורה', 'פורפורה מישושית'],
  arthralgia: ['arthralgia', 'arthritis', 'joint pain', 'arthralgias', 'כאבי מפרקים', 'דלקת מפרקים'],
  abdominal_pain: ['abdominal pain', 'כאב בטן', 'belly pain'],
  conjunctival_injection: [
    'conjunctival injection', 'nonexudative conjunctivitis', 'bilateral conjunctivitis',
    'אודם לחמית', 'דלקת לחמית',
  ],
  oral_mucosal: [
    'strawberry tongue', 'cracked lips', 'oral mucosal', 'red lips',
    'לשון תות', 'שפתיים סדוקות', 'שינויי ריריות פה',
  ],
  cervical_lymphadenopathy: [
    'cervical lymphadenopathy', 'cervical lymph node',
    'לימפאדנופתיה צווארית', 'בלוטות צוואר',
  ],
  kawasaki_rash: ['polymorphous rash', 'polymorphic rash', 'פריחה פולימורפית'],
  extremity_changes: [
    'extremity changes', 'hand edema', 'foot edema', 'periungual peeling',
    'בצקת גפיים', 'קילוף פריאונגוואלי',
  ],
  chorioretinitis: ['chorioretinitis', 'chorioretinal', 'כוריורטיניטיס'],
  hydrocephalus: ['hydrocephalus', 'ventriculomegaly', 'הידרוצפלוס'],
  intracranial_calcifications: [
    'intracranial calcifications', 'intracranial calcification', 'brain calcifications',
    'הסתיידויות תוך גולגולתיות',
  ],
});

const NELSON_ICP = 'needs_verification.nelson.neurology.raised_icp';
const NELSON_SAMTER = 'needs_verification.nelson.allergy.samter_triad';
const NELSON_CHOL = 'needs_verification.nelson.gi.acute_cholangitis';
const NELSON_HUS = 'needs_verification.nelson.nephrology.hus';
const NELSON_HSP = 'needs_verification.nelson.rheumatology.hsp';
const NELSON_KD = 'needs_verification.nelson.id.kawasaki';
const NELSON_TOXO = 'needs_verification.nelson.id.congenital_toxoplasmosis';

export const SYNDROME_CATALOG = Object.freeze([
  Object.freeze({
    pattern_key: 'triad.cushing',
    title_he: 'Cushing triad — כיוון ללחץ תוך-גולגולתי מוגבר',
    kind: 'triad',
    suspicion: 'red',
    emergency: true,
    source_anchor: NELSON_ICP,
    extra_anchors: ['needs_verification.nelson.critical_care.intracranial_hypertension'],
    required: ['bradycardia', 'hypertension', 'irregular_respiration'],
    min_required: 3,
    differential: [
      { direction_id: 'SYN-CUSH1', diagnosis_direction_he: 'לחץ תוך-גולגולתי מוגבר — כיוון דחוף', vs_he: 'יש לאשר בבדיקה נוירולוגית/דימות; הטריאדה אינה אבחנה' },
      { direction_id: 'SYN-CUSH2', diagnosis_direction_he: 'ברדיקרדיה / יתר לחץ דם מסיבה אחרת', vs_he: 'היעדר שינוי נשימתי מחליש ICP' },
    ],
    workup: [{ test_he: 'הערכה נוירולוגית דחופה ± דימות לפי פרוטוקול מקומי מאומת', source_anchor: NELSON_ICP }],
    action_he: 'Red flag: חשד ל-ICP מוגבר — ייעוץ דחוף / טיפול נמרץ לפי פרוטוקול מקומי. אין מינונים במנוע.',
  }),
  Object.freeze({
    pattern_key: 'triad.samter',
    title_he: "Samter's triad (AERD) — כיוון",
    kind: 'triad',
    suspicion: 'yellow',
    source_anchor: NELSON_SAMTER,
    extra_anchors: ['needs_verification.nelson.allergy.nsaid_exacerbated_respiratory_disease'],
    required: ['asthma', 'aspirin_sensitivity', 'nasal_polyps'],
    min_required: 3,
    differential: [
      { direction_id: 'SYN-SAM1', diagnosis_direction_he: 'AERD / Samter — כיוון', vs_he: 'דורש אנמנזה של תגובה ל-NSAID ואישור פוליפים' },
      { direction_id: 'SYN-SAM2', diagnosis_direction_he: 'אסתמה / סינוסיטיס כרונית ללא AERD', vs_he: 'היעדר רגישות לאספירין' },
    ],
    workup: [{ test_he: 'ייעוץ אלרגיה/אא"ג לפי פרוטוקול מקומי — לא אתגר אספירין מהזיכרון', source_anchor: NELSON_SAMTER }],
  }),
  Object.freeze({
    pattern_key: 'triad.charcot',
    title_he: "Charcot's triad — כיוון לכולנגיטיס חדה",
    kind: 'triad',
    suspicion: 'red',
    emergency: true,
    source_anchor: NELSON_CHOL,
    extra_anchors: ['needs_verification.nelson.gi.biliary_infection'],
    required: ['ruq_pain', 'jaundice', 'fever'],
    min_required: 3,
    differential: [
      { direction_id: 'SYN-CH1', diagnosis_direction_he: 'Acute cholangitis — כיוון דחוף', vs_he: 'יש לאשר בדימות דרכי מרה / מעבדה; הטריאדה אינה תרבית' },
      { direction_id: 'SYN-CH2', diagnosis_direction_he: 'דלקת כיס מרה / הפטיטיס', vs_he: 'היעדר חסימת דרכי מרה' },
    ],
    workup: [{ test_he: 'מעבדת כבד + דימות דרכי מרה לפי פרוטוקול מקומי מאומת', source_anchor: NELSON_CHOL }],
    action_he: 'חשד לכולנגיטיס — הערכה דחופה. אנטיביוטיקה אמפירית לפי פרוטוקול מקומי מאומת בלבד (אין שמות/מינונים).',
  }),
  Object.freeze({
    pattern_key: 'pentad.reynolds',
    title_he: "Reynolds pentad — כולנגיטיס עם שוק / פגיעה בהכרה",
    kind: 'pentad',
    suspicion: 'red',
    emergency: true,
    source_anchor: NELSON_CHOL,
    extra_anchors: ['needs_verification.nelson.gi.biliary_sepsis'],
    required: ['ruq_pain', 'jaundice', 'fever', 'hypotension', 'altered_mental'],
    min_required: 5,
    differential: [
      { direction_id: 'SYN-RP1', diagnosis_direction_he: 'Reynolds pentad / כולנגיטיס חמורה — כיוון', vs_he: 'שוק ממקור אחר עם צהבת מקרית' },
    ],
    workup: [{ test_he: 'החייאה לפי פרוטוקול ספסיס מקומי + דימות דרכי מרה דחוף', source_anchor: NELSON_CHOL }],
    action_he: 'Red flag: כולנגיטיס עם שוק — טיפול נמרץ / פרוטוקול ספסיס מקומי מאומת. אין מינונים במנוע.',
  }),
  Object.freeze({
    pattern_key: 'triad.hus',
    title_he: 'HUS triad — כיוון לתסמונת המוליטית-אורמית',
    kind: 'triad',
    suspicion: 'red',
    emergency: true,
    source_anchor: NELSON_HUS,
    extra_anchors: ['needs_verification.nelson.nephrology.tma'],
    required: ['maha', 'thrombocytopenia', 'aki'],
    min_required: 3,
    differential: [
      { direction_id: 'SYN-HUS1', diagnosis_direction_he: 'HUS / TMA — כיוון דחוף', vs_he: 'יש לאשר בסכיסטוציטים ותפקודי כליה; לא DIC בלבד' },
      { direction_id: 'SYN-HUS2', diagnosis_direction_he: 'ITP / אנמיה מסיבה אחרת / AKI מבודד', vs_he: 'היעדר MAHA שולל את הטריאדה' },
    ],
    workup: [{ test_he: 'משטח דם, ספירה, קריאטינין, ייעוץ נפרולוגי דחוף לפי פרוטוקול מקומי', source_anchor: NELSON_HUS }],
    action_he: 'Red flag: חשד HUS — הערכה דחופה. אין טיפול/מינון במנוע זה.',
  }),
  Object.freeze({
    pattern_key: 'triad.hsp',
    title_he: 'HSP / IgA vasculitis triad — כיוון',
    kind: 'triad',
    suspicion: 'yellow',
    source_anchor: NELSON_HSP,
    extra_anchors: ['needs_verification.nelson.rheumatology.iga_vasculitis'],
    required: ['purpura', 'arthralgia', 'abdominal_pain'],
    min_required: 3,
    differential: [
      { direction_id: 'SYN-HSP1', diagnosis_direction_he: 'Henoch-Schönlein / IgA vasculitis — כיוון', vs_he: 'פורפורה מישושית אופיינית; פריחה כללית אינה מספיקה' },
      { direction_id: 'SYN-HSP2', diagnosis_direction_he: 'ITP / מנינגוקוקמיה / וסקוליטיס אחר', vs_he: 'חולים / חום גבוה / פורפורה מפושטת — אל תרגיעו' },
    ],
    workup: [{ test_he: 'שתן למשקע/חלבון, לחץ דם, מעקב כלייתי לפי פרוטוקול מקומי', source_anchor: NELSON_HSP }],
  }),
  Object.freeze({
    pattern_key: 'criteria.kawasaki',
    title_he: 'Kawasaki — קריטריונים קליניים (חום ≥5 ימים + 4/5)',
    kind: 'criteria',
    special: 'kawasaki',
    suspicion: 'red',
    emergency: true,
    source_anchor: NELSON_KD,
    extra_anchors: ['needs_verification.aap.kawasaki.diagnosis'],
    required: ['conjunctival_injection', 'oral_mucosal', 'cervical_lymphadenopathy', 'kawasaki_rash', 'extremity_changes'],
    min_required: 4,
    fever_days_min: 5,
    differential: [
      { direction_id: 'SYN-KD1', diagnosis_direction_he: 'Kawasaki disease — כיוון לפי קריטריונים', vs_he: 'חום ללא משך מתועד אינו משלים קריטריון; incomplete KD לא מנוחש כאן' },
      { direction_id: 'SYN-KD2', diagnosis_direction_he: 'אדנו-ויראלי / סקרלטינה / תגובת תרופה', vs_he: 'פחות מ-4 מאפיינים עיקריים' },
    ],
    workup: [{ test_he: 'ייעוץ קרדיולוגי / אקו לפי פרוטוקול Kawasaki מקומי מאומת (אין מינון IVIG במנוע)', source_anchor: NELSON_KD }],
    action_he: 'חשד Kawasaki מלא — הערכה דחופה לפי פרוטוקול מחלקתי מאומת. אין מינונים במנוע.',
  }),
  Object.freeze({
    pattern_key: 'triad.congenital_toxoplasmosis',
    title_he: 'Congenital toxoplasmosis triad — כיוון',
    kind: 'triad',
    suspicion: 'yellow',
    source_anchor: NELSON_TOXO,
    extra_anchors: ['needs_verification.nelson.neonatology.congenital_infection'],
    required: ['chorioretinitis', 'hydrocephalus', 'intracranial_calcifications'],
    min_required: 3,
    differential: [
      { direction_id: 'SYN-TX1', diagnosis_direction_he: 'טוקסופלזמוזיס מולד — כיוון', vs_he: 'יש לאשר סרולוגיה; CMV ואחרים נראים דומה' },
      { direction_id: 'SYN-TX2', diagnosis_direction_he: 'TORCH אחר (CMV) / הסתיידויות מסיבה אחרת', vs_he: 'דפוס הסתיידות והקשר יילוד' },
    ],
    workup: [{ test_he: 'סרולוגיה / PCR לפי פרוטוקול TORCH מקומי + ייעוץ עיניים ונויולוגיה', source_anchor: NELSON_TOXO }],
  }),
]);

function pushText(set, channels, raw, channel) {
  const n = norm(raw);
  if (!n) return;
  set.add(n);
  if (!channels.has(n)) channels.set(n, new Set());
  channels.get(n).add(channel);
}

function walkValues(node, acc, channel, depth = 0) {
  if (depth > 6 || node == null) return;
  if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
    if (node === true) return;
    acc(String(node), channel);
    return;
  }
  if (Array.isArray(node)) {
    for (const x of node) walkValues(x, acc, channel, depth + 1);
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (['image', 'samples', 'pixels', 'waveform', 'prompt'].includes(k)) continue;
      // אל תסמוך על אבחנות LLM כערוץ ממצא
      if (['differential_diagnoses', 'primary_impression', 'diagnosis'].includes(k)) continue;
      walkValues(v, acc, channel, depth + 1);
    }
  }
}

function labHits(labs = []) {
  const flags = new Set();
  for (const l of labs ?? []) {
    const names = [l.analyte, l.canonical_key, l.key].map(norm).filter(Boolean);
    const blob = names.join(' ');
    const flag = String(l.flag ?? l.result ?? '').toLowerCase();
    const pos = ['high', 'low', 'positive', 'pos'].includes(flag);
    if (!pos && flag !== 'low' && flag !== 'high') continue;
    if (flag === 'low' && /platelet|plt|טסית|טרומבו/.test(blob)) flags.add('thrombocytopenia');
    if (flag === 'high' && /creat|urea|bun|kreat|קריאטין|אוריאה/.test(blob)) flags.add('aki');
    if (flag === 'low' && /hgb|hb|hemoglobin|hct|המוגלובין/.test(blob)) flags.add('anemia');
    if (flag === 'high' && /ldh/.test(blob)) flags.add('ldh_high');
    if (flag === 'low' && /haptoglobin|הפטוגלובין/.test(blob)) flags.add('haptoglobin_low');
    if ((flag === 'high' || flag === 'positive' || flag === 'pos') && /schist|helmet|smear/.test(blob)) flags.add('maha');
  }
  if (flags.has('anemia') && (flags.has('ldh_high') || flags.has('haptoglobin_low'))) flags.add('maha');
  return flags;
}

function vitalHits(vitals = {}) {
  const flags = new Set();
  const hr = String(vitals.hr_flag ?? vitals.heart_rate_flag ?? '').toLowerCase();
  const bp = String(vitals.bp_flag ?? vitals.blood_pressure_flag ?? '').toLowerCase();
  if (hr === 'low') flags.add('bradycardia');
  if (bp === 'high') flags.add('hypertension');
  if (bp === 'low') flags.add('hypotension');
  if (vitals.irregular_respiration === true) flags.add('irregular_respiration');
  return flags;
}

/**
 * מאחד תלונות/קול, מעבדה, עור ודימות לקבוצת מאפיינים קנונית.
 */
export function collectMultimodalFeatures({
  findings = [],
  complaints = [],
  presentation = null,
  labs = [],
  labInterpreter = null,
  vitals = {},
  skin = null,
  radiology = null,
  audio = null,
  features = {},
} = {}) {
  const textSet = new Set();
  const channels = new Map();
  const add = (raw, channel) => pushText(textSet, channels, raw, channel);

  for (const f of findings ?? []) add(f, 'complaint');
  for (const c of complaints ?? []) add(c, 'complaint');
  if (presentation) add(presentation, 'complaint');

  const labRows = [
    ...(labs ?? []),
    ...((labInterpreter?.normalized) ?? []),
  ];
  walkValues(skin, add, 'skin');
  walkValues(radiology, add, 'radiology');
  if (audio?.findings) walkValues(audio.findings, add, 'audio');
  if (audio?.transcript) add(audio.transcript, 'audio');

  const present = new Set();
  const source = {};

  const blobHas = (aliases) => {
    for (const a of aliases) {
      const n = norm(a);
      if (!n) continue;
      if (textSet.has(n)) return true;
      for (const h of textSet) {
        if (n.length >= 4 && h.includes(n)) return true;
      }
    }
    return false;
  };

  for (const [key, aliases] of Object.entries(FEATURE_ALIASES)) {
    if (blobHas(aliases) || features[key] === true) {
      present.add(key);
      const ch = new Set();
      for (const [txt, set] of channels) {
        if (aliases.some((a) => txt.includes(norm(a)) || (norm(a).length >= 6 && norm(a).includes(txt)))) {
          for (const c of set) ch.add(c);
        }
      }
      if (features[key] === true) ch.add('structured');
      source[key] = [...(ch.size ? ch : ['complaint'])];
    }
  }

  for (const k of labHits(labRows)) {
    present.add(k);
    source[k] = [...new Set([...(source[k] ?? []), 'lab'])];
  }
  for (const k of vitalHits(vitals)) {
    present.add(k);
    source[k] = [...new Set([...(source[k] ?? []), 'vitals'])];
  }

  const fever_days = isNum(Number(features.fever_days))
    ? Number(features.fever_days)
    : (isNum(Number(vitals.fever_days)) ? Number(vitals.fever_days) : null);

  return { present, source, textSet, fever_days, labRows };
}

function featureOn(present, key) {
  return present.has(key);
}

function scoreRecord(s, hits, total, extra = {}) {
  const pct = total ? Math.round((100 * hits.length) / total) : 0;
  return {
    ...s,
    hits,
    miss: (s.required ?? []).filter((k) => !hits.includes(k)),
    criteria_match_pct: pct,
    verification_status: DRAFT,
    evidence_he: `קריטריונים שמיולאו (${hits.length}/${total}): ${hits.join(', ') || '—'}`,
    ...extra,
  };
}

export function matchSyndromes(ctx = {}) {
  const collected = collectMultimodalFeatures(ctx);
  const { present, fever_days } = collected;
  const matched = [];
  const nearMiss = [];

  for (const s of SYNDROME_CATALOG) {
    if (s.special === 'kawasaki') {
      const principalHits = (s.required ?? []).filter((k) => featureOn(present, k));
      const feverOk = isNum(fever_days) && fever_days >= (s.fever_days_min ?? 5);
      const total = 1 + (s.required?.length ?? 0);
      const hits = [...(feverOk ? ['fever_days_ge_5'] : []), ...principalHits];
      const rec = scoreRecord(s, hits, total, {
        fever_days: fever_days,
        fever_criterion: feverOk,
        principal_count: principalHits.length,
      });
      rec.evidence_he = feverOk
        ? `חום ${fever_days} ימים + ${principalHits.length}/5 מאפיינים עיקריים`
        : `מאפיינים עיקריים ${principalHits.length}/5; משך חום מתועד חסר או <5 ימים — לא משלים קריטריון`;
      const complete = feverOk && principalHits.length >= (s.min_required ?? 4);
      if (complete) matched.push(rec);
      else if (principalHits.length > 0 || feverOk) nearMiss.push(rec);
      continue;
    }

    const hits = (s.required ?? []).filter((k) => featureOn(present, k));
    const rec = scoreRecord(s, hits, s.required.length);
    if (hits.length >= (s.min_required ?? s.required.length)) matched.push(rec);
    else if (hits.length > 0) nearMiss.push(rec);
  }

  matched.sort((a, b) => b.criteria_match_pct - a.criteria_match_pct);
  return { matched, nearMiss, collected };
}

function toKb(p) {
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
    criteria_match_pct: p.criteria_match_pct,
  };
}

function flattenDiff(matched) {
  return matched.flatMap((p) => (p.differential ?? []).map((d) => ({
    ...d,
    source_anchors: [p.source_anchor, ...(p.extra_anchors ?? [])],
    supports_he: [p.evidence_he],
    refutes_he: [d.vs_he],
    based_on_patterns: [p.pattern_key],
    verification_status: DRAFT,
  })));
}

function flattenWorkup(matched) {
  const out = [];
  const seen = new Set();
  for (const p of matched) {
    for (const w of p.workup ?? []) {
      if (seen.has(w.test_he)) continue;
      seen.add(w.test_he);
      out.push({ test_he: w.test_he, source_anchor: w.source_anchor || p.source_anchor, verification_status: DRAFT });
    }
  }
  return out;
}

/**
 * מנוע עצמאי + FactBlock. קלט ריק → כישלון סגור.
 */
export function runSyndromeMatcher({
  patient = {},
  findings = [],
  complaints = [],
  presentation = null,
  labs = [],
  labInterpreter = null,
  vitals = {},
  skin = null,
  radiology = null,
  audio = null,
  features = {},
  mode = 'development',
  locale = 'he',
} = {}) {
  const hasAny =
    (findings ?? []).some(Boolean) ||
    (complaints ?? []).some(Boolean) ||
    presentation ||
    (labs ?? []).length ||
    labInterpreter?.normalized?.length ||
    Object.keys(vitals ?? {}).length ||
    skin ||
    radiology ||
    audio ||
    Object.keys(features ?? {}).length;
  if (!hasAny) {
    return finalizeLocale(fail('no_syndrome_input', { message_he: 'לא סופקו תלונות, מעבדה, ממצאי עור/דימות או סימנים חיוניים.' }), locale);
  }

  const { matched, nearMiss, collected } = matchSyndromes({
    findings, complaints, presentation, labs, labInterpreter, vitals, skin, radiology, audio, features,
  });

  const kbItems = matched.map(toKb);
  const workupAnchors = flattenWorkup(matched).map((w) => w.source_anchor).filter(Boolean);
  if (kbItems.length && workupAnchors.length) {
    kbItems[0] = {
      ...kbItems[0],
      extra_anchors: [...new Set([...(kbItems[0].extra_anchors ?? []), ...workupAnchors])],
    };
  }

  const red_flags = matched.filter((p) => p.emergency).map((p) => ({
    flag_key: p.pattern_key,
    label_he: p.title_he,
    severity: 'critical',
    action_he: p.action_he || 'הערכה דחופה לפי פרוטוקול מקומי מאומת.',
    source_anchor: p.source_anchor,
    extra_anchors: p.extra_anchors ?? [],
    verification_status: DRAFT,
  }));

  const deterministic = matched.map((p) => ({
    key: `${p.pattern_key}.criteria_pct`,
    label_he: `מילוי קריטריונים: ${p.title_he}`,
    value: p.criteria_match_pct,
    unit: '%',
    formula_source: 'hits / required_slots * 100 (criteria fulfillment, not diagnostic probability)',
  }));

  const ageDays = toAgeDays(patient);
  const patientData = [
    ...[...collected.present].map((k) => ({
      key: `feat_${k}`,
      label_he: `ממצא: ${k}`,
      value: (collected.source[k] ?? []).join('+') || 'present',
    })),
    ...(isNum(collected.fever_days) ? [{ key: 'fever_days', label_he: 'ימי חום', value: collected.fever_days, unit: 'days' }] : []),
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
  ];

  const factBlock = buildFactBlock({ kbItems, deterministic, patientData, mode });

  return finalizeLocale({
    ok: true,
    engine: 'syndrome_matcher',
    verification_status: DRAFT,
    age_days: ageDays,
    features: [...collected.present],
    feature_channels: collected.source,
    matched_patterns: matched.map((p) => p.pattern_key),
    near_miss_patterns: nearMiss.map((p) => p.pattern_key),
    matched,
    kbItems,
    red_flags,
    safety_alerts: red_flags,
    emergency: matched.some((p) => p.emergency),
    differential: flattenDiff(matched),
    recommended_tests: flattenWorkup(matched),
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'אחוז ההתאמה הוא מילוי קריטריונים, לא הסתברות אבחנה.',
      'פריחה כללית אינה פורפורה. משך חום לא מתועד אינו משלים Kawasaki.',
    ],
    unknowns_he: matched.length ? [] : ['לא הותאמה טריאדה/קריטריון מלא — אין משמעות של "שלילה".'],
  }, locale);
}
