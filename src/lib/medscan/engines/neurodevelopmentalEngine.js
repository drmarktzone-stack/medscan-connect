/**
 * DoctorPedAI — מנוע סינון נוירו-התפתחותי (ASD / ADHD)
 *
 * דטרמיניסטי. סופר קריטריונים שסומנו (DSM-5-TR) וציוני שאלונים שסופקו
 * (M-CHAT-R/F, Vanderbilt). אינו אבחנה. הפניה להערכה התפתחותית/נוירולוגית.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { buildFactBlock } from '../antihallucination/factBlock.js';
import { attachLiteratureCitation } from '../knowledge/approvedLiterature.js';
import { DISCLAIMER_HE } from '../schemas/output.schemas.js';
import { finalizeLocale } from '../i18n/localize.js';

export const DRAFT = 'draft_needs_verification';

const NELSON_ASD = 'needs_verification.nelson.developmental.asd';
const DSM_ASD = 'needs_verification.dsm.neurodevelopmental.asd';
const AAP_ASD = 'needs_verification.aap.autism.screening';
const NELSON_ADHD = 'needs_verification.nelson.developmental.adhd';
const DSM_ADHD = 'needs_verification.dsm.neurodevelopmental.adhd';
const AAP_ADHD = 'needs_verification.aap.adhd.guidelines';

const fail = (reason, extra = {}) => ({
  ok: false,
  reason,
  verification_status: 'unavailable',
  disclaimer_he: DISCLAIMER_HE,
  ...extra,
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

function norm(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/g, '');
}

const ASD_A = Object.freeze({
  social_emotional_reciprocity: ['social emotional', 'reciprocity', 'no back and forth', 'גומלין חברתי', 'לא משתף'],
  nonverbal_communication: ['nonverbal', 'eye contact', 'no eye contact', 'קשר עין', 'תקשורת לא מילולית'],
  relationships: ['peer relationships', 'no friends', 'doesnt play', 'קשרים חברתיים', 'לא משחק עם בני גיל'],
});

const ASD_B = Object.freeze({
  stereotyped_motor: ['stereotypy', 'hand flapping', 'echolalia', 'סטריאוטיפיה', 'נפנוף ידיים', 'אקולליה'],
  insistence_sameness: ['sameness', 'rituals', 'inflexible', 'התעקשות על זהות', 'טקסים'],
  restricted_interests: ['restricted interests', 'intense interest', 'עניין מצומצם'],
  sensory: ['sensory', 'hyperreactivity', 'hyporeactivity', 'תחושתי', 'רגישות חושית'],
});

const ADHD_INATT = Object.freeze({
  careless_mistakes: ['careless mistakes', 'טעויות רשלניות'],
  sustained_attention: ['sustained attention', 'לא מתמיד בקשב'],
  not_listen: ['does not listen', 'לא מקשיב'],
  follow_through: ['follow through', 'לא מסיים מטלות'],
  organization: ['disorganized', 'ארגון'],
  avoids_mental: ['avoids mental', 'נמנע ממשימות'],
  loses_things: ['loses things', 'מאבד חפצים'],
  distracted: ['easily distracted', 'מוסח'],
  forgetful: ['forgetful', 'שכחן'],
});

const ADHD_HYP = Object.freeze({
  fidgets: ['fidgets', 'מתנועע'],
  leaves_seat: ['leaves seat', 'קם מהכיסא'],
  runs_climbs: ['runs climbs', 'רץ מטפס'],
  unable_quiet: ['unable quiet', 'לא משחק בשקט'],
  on_the_go: ['on the go', 'כמו מנוע'],
  talks_excess: ['talks excessively', 'מדבר הרבה'],
  blurts: ['blurts', 'פולט תשובות'],
  waiting: ['difficulty waiting', 'מתקשה לחכות'],
  interrupts: ['interrupts', 'מפריע'],
});

function hitMap(dict, tokens) {
  const hits = [];
  for (const [key, aliases] of Object.entries(dict)) {
    const on = tokens.has(key) || aliases.some((a) => {
      const n = norm(a);
      if (!n) return false;
      if (tokens.has(n)) return true;
      return [...tokens].some((t) => n.length >= 5 && t.includes(n));
    });
    if (on) hits.push(key);
  }
  return hits;
}

function tokenSet(list = []) {
  const s = new Set();
  for (const x of list ?? []) {
    if (typeof x === 'object') {
      const name = x.name ?? x.key ?? x.item;
      if (x.present === false) continue;
      if (name) s.add(norm(name));
      continue;
    }
    s.add(norm(x));
  }
  return s;
}

/** M-CHAT-R: 0–2 נמוך, 3–7 בינוני, 8–20 גבוה — ניקוד המכשיר (טיוטה לאימות). */
export function scoreMchat(total) {
  if (!isNum(total) || total < 0 || total > 20) return { ok: false, reason: 'invalid_mchat' };
  let band = 'low';
  if (total >= 8) band = 'high';
  else if (total >= 3) band = 'medium';
  return {
    ok: true,
    total,
    band,
    label_he: band === 'high' ? 'M-CHAT-R סיכון גבוה' : band === 'medium' ? 'M-CHAT-R סיכון בינוני — Follow-up' : 'M-CHAT-R סיכון נמוך',
    source_anchor: AAP_ASD,
    verification_status: DRAFT,
  };
}

export function matchAsdCriteria({ findings = [], features = {}, mchat_total = null, ageDays = null } = {}) {
  const tokens = tokenSet([
    ...findings,
    ...Object.entries(features).filter(([, v]) => v === true).map(([k]) => k),
  ]);
  const aHits = hitMap(ASD_A, tokens);
  const bHits = hitMap(ASD_B, tokens);
  const aMet = aHits.length >= 3;
  const bMet = bHits.length >= 2;
  const mchat = isNum(mchat_total) ? scoreMchat(mchat_total) : { ok: false };
  const ageMonths = isNum(ageDays) ? ageDays / 30.4375 : null;
  const mchatAgeOk = !isNum(ageMonths) || (ageMonths >= 16 && ageMonths <= 30);

  return {
    aHits,
    bHits,
    aMet,
    bMet,
    screens_positive: aMet && bMet,
    mchat: mchat.ok ? { ...mchat, age_window_ok: mchatAgeOk } : null,
    verification_status: DRAFT,
  };
}

export function matchAdhdCriteria({
  findings = [],
  features = {},
  vanderbilt = {},
  settings = [],
  ageDays = null,
  onset_before_12 = null,
  impairment = null,
} = {}) {
  const tokens = tokenSet([
    ...findings,
    ...Object.entries(features).filter(([, v]) => v === true).map(([k]) => k),
  ]);
  let inatt = hitMap(ADHD_INATT, tokens);
  let hyp = hitMap(ADHD_HYP, tokens);

  const vIn = Number(vanderbilt.inattention_positives);
  const vHy = Number(vanderbilt.hyperactivity_positives);
  if (isNum(vIn)) inatt = Array.from({ length: Math.min(9, Math.max(0, Math.round(vIn))) }, (_, i) => inatt[i] || `vanderbilt_inatt_${i + 1}`);
  if (isNum(vHy)) hyp = Array.from({ length: Math.min(9, Math.max(0, Math.round(vHy))) }, (_, i) => hyp[i] || `vanderbilt_hyp_${i + 1}`);

  const ageYears = isNum(ageDays) ? ageDays / 365.25 : null;
  const threshold = isNum(ageYears) && ageYears >= 17 ? 5 : 6;
  const inattMet = inatt.length >= threshold;
  const hypMet = hyp.length >= threshold;
  const settingList = [...new Set((settings?.length ? settings : vanderbilt.settings || []).map((x) => String(x).toLowerCase()))];
  const twoSettings = settingList.length >= 2;
  const ageOk = !isNum(ageYears) || ageYears >= 4;

  return {
    inattention_count: inatt.length,
    hyperactivity_count: hyp.length,
    threshold,
    inattMet,
    hypMet,
    settings: settingList,
    twoSettings,
    onset_before_12,
    impairment,
    ageOk,
    screens_positive: ageOk && (inattMet || hypMet) && twoSettings && onset_before_12 !== false && impairment !== false,
    verification_status: DRAFT,
  };
}

function kbItem({ key, title_he, source_anchor, extra_anchors, evidence_he, workup, differential, suspicion = 'yellow' }) {
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

export function runNeurodevelopmentalEngine({
  patient = {},
  findings = [],
  features = {},
  mchat_total = null,
  vanderbilt = {},
  settings = [],
  onset_before_12 = null,
  impairment = null,
  mode = 'development',
  locale = 'he',
} = {}) {
  const ageDays = toAgeDays(patient);
  const hasAny =
    (findings ?? []).some(Boolean) ||
    Object.values(features ?? {}).some(Boolean) ||
    isNum(mchat_total) ||
    isNum(Number(vanderbilt.inattention_positives)) ||
    isNum(Number(vanderbilt.hyperactivity_positives)) ||
    (settings ?? []).length;
  if (!hasAny) {
    return finalizeLocale(fail('no_neurodev_input', { message_he: 'לא סופקו קריטריונים, M-CHAT או Vanderbilt.' }), locale);
  }

  const asd = matchAsdCriteria({ findings, features, mchat_total, ageDays });
  const adhd = matchAdhdCriteria({
    findings, features, vanderbilt, settings, ageDays, onset_before_12, impairment,
  });

  const matched = [];
  if (asd.screens_positive) {
    matched.push(kbItem({
      key: 'neurodev.asd_screen',
      title_he: 'סקר ASD לפי מילוי קריטריוני DSM-5-TR (לא אבחנה)',
      source_anchor: NELSON_ASD,
      extra_anchors: [DSM_ASD, AAP_ASD],
      evidence_he: `תחום A ${asd.aHits.length}/3, תחום B ${asd.bHits.length}/4`,
      differential: [
        { direction_id: 'ND-ASD1', diagnosis_direction_he: 'כיוון לאוטיזם — דורש הערכה אבחונית', vs_he: 'עיכוב שפה / חרדה חברתית / חסר שמיעה' },
        { direction_id: 'ND-ASD2', diagnosis_direction_he: 'פרופיל התפתחותי אחר', vs_he: 'קריטריונים חלקיים אינם אבחנה' },
      ],
      workup: [
        { test_he: 'הפניה לאבחון התפתחותי רב-מקצועי לפי פרוטוקול מקומי', source_anchor: AAP_ASD },
        { test_he: 'סקר שמיעה וראייה', source_anchor: NELSON_ASD },
      ],
    }));
  }
  if (asd.mchat && (asd.mchat.band === 'high' || asd.mchat.band === 'medium')) {
    matched.push(kbItem({
      key: `neurodev.mchat_${asd.mchat.band}`,
      title_he: asd.mchat.label_he,
      source_anchor: AAP_ASD,
      extra_anchors: [NELSON_ASD],
      evidence_he: `M-CHAT-R total=${asd.mchat.total}` + (asd.mchat.age_window_ok ? '' : ' (חלון גיל 16–30 חודשים — לאימות)'),
      differential: [
        { direction_id: 'ND-MC1', diagnosis_direction_he: 'סקר M-CHAT-R חיובי — לא אבחנת ASD', vs_he: 'שאלונים אינם מחליפים הערכה קלינית' },
      ],
      workup: [
        { test_he: asd.mchat.band === 'medium' ? 'M-CHAT-R/F Follow-up ואז הפניה לפי תוצאה' : 'הפניה דחופה להערכה התפתחותית', source_anchor: AAP_ASD },
      ],
    }));
  }
  if (adhd.screens_positive) {
    matched.push(kbItem({
      key: 'neurodev.adhd_screen',
      title_he: 'סקר ADHD לפי מילוי קריטריוני DSM-5-TR (לא אבחנה)',
      source_anchor: NELSON_ADHD,
      extra_anchors: [DSM_ADHD, AAP_ADHD],
      evidence_he: `חוסר קשב ${adhd.inattention_count}/9, היפר/אימפולסיביות ${adhd.hyperactivity_count}/9, הקשרים: ${adhd.settings.join(', ') || '—'}`,
      differential: [
        { direction_id: 'ND-AD1', diagnosis_direction_he: 'כיוון ADHD — דורש הערכה קלינית בשני הקשרים', vs_he: 'חרדה, שינה, לקויות למידה, חסר ראייה/שמיעה' },
        { direction_id: 'ND-AD2', diagnosis_direction_he: 'תסמינים בהקשר יחיד / גיל צעיר מדי לסקר שגרתי', vs_he: 'ללא שני הקשרים אין סקר חיובי' },
      ],
      workup: [
        { test_he: 'שאלוני Vanderbilt (הורה + מורה) אם טרם הושלמו', source_anchor: AAP_ADHD },
        { test_he: 'סקר ראייה ושמיעה + בירור שינה/מצב רוח', source_anchor: NELSON_ADHD },
      ],
    }));
  }

  const kbItems = matched;
  if (kbItems[0]) {
    const extras = matched.flatMap((m) => [m.source_anchor, ...(m.extra_anchors ?? []), ...(m.workup ?? []).map((w) => w.source_anchor)]);
    kbItems[0] = { ...kbItems[0], extra_anchors: [...new Set(extras.filter(Boolean))] };
  }

  const deterministic = [];
  if (asd.mchat?.ok) {
    deterministic.push({
      key: 'mchat_total',
      label_he: 'M-CHAT-R total',
      value: asd.mchat.total,
      formula_source: 'instrument score 0-20 (draft cutoff bands 3 and 8)',
    });
  }
  deterministic.push({
    key: 'asd_a_count',
    label_he: 'DSM-5-TR ASD תחום A',
    value: asd.aHits.length,
    formula_source: 'count of annotated A criteria (need 3/3)',
  });
  deterministic.push({
    key: 'adhd_inatt_count',
    label_he: 'DSM-5-TR ADHD חוסר קשב',
    value: adhd.inattention_count,
    formula_source: 'count of annotated inattention items',
  });

  const patientData = [
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
    { key: 'asd_b_count', label_he: 'ASD תחום B', value: asd.bHits.length },
    { key: 'adhd_hyp_count', label_he: 'ADHD היפר', value: adhd.hyperactivity_count },
  ];

  const factBlock = buildFactBlock({ kbItems, deterministic, patientData, mode });

  return finalizeLocale({
    ok: true,
    engine: 'neurodevelopmental',
    verification_status: DRAFT,
    age_days: ageDays,
    asd,
    adhd,
    matched_patterns: matched.map((m) => m.pattern_key),
    kbItems,
    red_flags: [],
    safety_alerts: [],
    emergency: false,
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
      'סקר בלבד — DSM-5-TR/M-CHAT/Vanderbilt אינם אבחנה.',
      'אין המלצת תרופות או מינונים במנוע זה.',
    ],
    unknowns_he: matched.length ? [] : ['לא מולאו די קריטריונים לסקר חיובי — אין משמעות של "שלילת ASD/ADHD".'],
  }, locale);
}
