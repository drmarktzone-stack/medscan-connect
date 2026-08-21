/**
 * DoctorPedAI — מנוע מחלות מטבוליות וסקר ילודים (IEM)
 *
 * דטרמיניסטי, ללא LLM. פענוח סקר ילודים, חומצות אורגניות בשתן ואמינוגרם
 * לפי דגלים שכבר סומנו (high/low/positive) — בלי להמציא ספי אבחנה.
 * דגלי משבר מטבולי בילוד → מיון/טיפול נמרץ ילדים.
 *
 * עיגון: Nelson / OMIM / Orphanet. אינו אבחנה.
 */

import { toAgeDays } from '../deterministic/labNormalize.js';
import { runCalculators } from '../deterministic/calculators.js';
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

const ANALYTE_ALIASES = {
  phe: ['phe', 'phenylalanine', 'פנילאלנין', 'phe_nbs'],
  tyr: ['tyr', 'tyrosine', 'טירוזין'],
  leu: ['leu', 'leucine', 'לויצין'],
  ile: ['ile', 'isoleucine', 'איזולויצין'],
  val: ['val', 'valine', 'ואלין'],
  alloisoleucine: ['alloisoleucine', 'allo-ile'],
  cit: ['cit', 'citrulline', 'ציטרולין'],
  arg: ['arg', 'arginine', 'ארגינין'],
  gln: ['gln', 'glutamine', 'גלוטמין'],
  ala: ['ala', 'alanine', 'אלנין'],
  ammonia: ['ammonia', 'nh3', 'nh4', 'אמוניה'],
  glucose: ['glucose', 'glu', 'גלוקוז'],
  hco3: ['hco3', 'bicarbonate', 'ביקרבונט', 'tco2'],
  na: ['na', 'sodium', 'נתרן'],
  cl: ['cl', 'chloride', 'כלוריד'],
  anion_gap: ['anion_gap', 'ag', 'anion gap'],
  c8: ['c8', 'octanoylcarnitine', 'c8-carnitine'],
  c3: ['c3', 'propionylcarnitine', 'c3-carnitine'],
  mma: ['mma', 'methylmalonic', 'methylmalonate'],
  pa: ['propionic', 'propionylglycine'],
  orotic: ['orotic', 'orotate'],
};

export const METABOLIC_PATTERN_CATALOG = Object.freeze([
  Object.freeze({
    pattern_key: 'iem.pku',
    title_he: 'דפוס PKU (פנילקטונוריה) — סקר/אמינוגרם',
    suspicion: 'yellow',
    crisis: false,
    source_anchor: 'needs_verification.nelson.metabolism.pku',
    extra_anchors: ['needs_verification.omim.261600.pku', 'needs_verification.orphanet.716.pku'],
    need: ['phe_high'],
    differential: [
      { direction_id: 'IEM-P1', diagnosis_direction_he: 'PKU / פגם ב-PAH — כיוון', vs_he: 'יש לאשר באמינוגרם ובדיקה גנטית לפי פרוטוקול מקומי' },
      { direction_id: 'IEM-P2', diagnosis_direction_he: 'פגם במטבוליזם BH4 / דגימה לא-תקינה', vs_he: 'טירוזין נמוך מאוד, או תינוק לא-בצום / TPN' },
    ],
    workup: [
      { test_he: 'אמינוגרם פלזמה מאשר (אם טרם בוצע)', source_anchor: 'needs_verification.nelson.metabolism.pku' },
      { test_he: 'ייעוץ מטבולי / גנטיקה', source_anchor: 'needs_verification.omim.261600.pku' },
    ],
  }),
  Object.freeze({
    pattern_key: 'iem.msud',
    title_he: 'דפוס Maple Syrup Urine Disease (MSUD)',
    suspicion: 'red',
    crisis: true,
    source_anchor: 'needs_verification.nelson.metabolism.msud',
    extra_anchors: ['needs_verification.omim.248600.msud', 'needs_verification.orphanet.511.msud'],
    needAny: [['leu_high', 'ile_high', 'val_high', 'alloisoleucine_high']],
    minHits: 2,
    differential: [
      { direction_id: 'IEM-M1', diagnosis_direction_he: 'MSUD — כיוון', vs_he: 'שרשראות מסועפות מוגברות; אלואיזולויצין תומך אם קיים' },
      { direction_id: 'IEM-M2', diagnosis_direction_he: 'צום / הזנה לא-תקינה / פגם אחר בשרשראות מסועפות', vs_he: 'הקשר קליני וחזרה על דגימה' },
    ],
    workup: [
      { test_he: 'ייעוץ מטבולי דחוף', source_anchor: 'needs_verification.nelson.metabolism.msud' },
      { test_he: 'אמינוגרם פלזמה + חומצות אורגניות בשתן', source_anchor: 'needs_verification.omim.248600.msud' },
    ],
    route_he: 'חשד MSUD בילוד סימפטומטי — מיון / טיפול נמרץ ילדים לפי פרוטוקול מקומי.',
  }),
  Object.freeze({
    pattern_key: 'iem.mcad',
    title_he: 'דפוס MCAD deficiency (סקר / אצילקרניטינים)',
    suspicion: 'yellow',
    crisis: false,
    source_anchor: 'needs_verification.nelson.metabolism.mcad',
    extra_anchors: ['needs_verification.omim.201450.mcad', 'needs_verification.orphanet.42.mcad'],
    need: ['c8_high'],
    differential: [
      { direction_id: 'IEM-C1', diagnosis_direction_he: 'MCAD deficiency — כיוון', vs_he: 'C8 מוגבר בסקר; דורש פרופיל אצילקרניטינים מאשר' },
      { direction_id: 'IEM-C2', diagnosis_direction_he: 'פגם אחר בחמצון חומצות שומן / דגימת סקר לא-תקינה', vs_he: 'יחס C8/C10, מצב קליני' },
    ],
    workup: [
      { test_he: 'פרופיל אצילקרניטינים מאשר + ייעוץ מטבולי', source_anchor: 'needs_verification.nelson.metabolism.mcad' },
    ],
  }),
  Object.freeze({
    pattern_key: 'iem.organic_acidemia',
    title_he: 'דפוס Organic Acidemia (MMA / PA)',
    suspicion: 'red',
    crisis: true,
    source_anchor: 'needs_verification.nelson.metabolism.organic_acidemias',
    extra_anchors: [
      'needs_verification.omim.251000.mma',
      'needs_verification.omim.606054.propionic_acidemia',
      'needs_verification.orphanet.26.mma',
    ],
    needAny: [['c3_high', 'mma_high', 'pa_high']],
    differential: [
      { direction_id: 'IEM-O1', diagnosis_direction_he: 'Methylmalonic acidemia — כיוון', vs_he: 'MMA בשתן/דם' },
      { direction_id: 'IEM-O2', diagnosis_direction_he: 'Propionic acidemia — כיוון', vs_he: 'חומצה פרופיונית / פרופיונילגליצין' },
      { direction_id: 'IEM-O3', diagnosis_direction_he: 'חסר B12 / דגינת סקר C3 מבודדת', vs_he: 'ללא חומצות אורגניות תומכות' },
    ],
    workup: [
      { test_he: 'חומצות אורגניות בשתן + אצילקרניטינים + ייעוץ מטבולי דחוף', source_anchor: 'needs_verification.nelson.metabolism.organic_acidemias' },
    ],
    route_he: 'חשד לאצידמיה אורגנית סימפטומטית — מיון / טיפול נמרץ ילדים.',
  }),
  Object.freeze({
    pattern_key: 'iem.ucd',
    title_he: 'דפוס הפרעת מעגל האוריאה (UCD)',
    suspicion: 'red',
    crisis: true,
    source_anchor: 'needs_verification.nelson.metabolism.urea_cycle',
    extra_anchors: ['needs_verification.omim.311250.otc', 'needs_verification.orphanet.664.ucd'],
    needAny: [['ammonia_high']],
    plusAny: ['gln_high', 'cit_low', 'orotic_high', 'finding_lethargy'],
    differential: [
      { direction_id: 'IEM-U1', diagnosis_direction_he: 'הפרעת מעגל האוריאה (למשל OTC) — כיוון', vs_he: 'היפראמונמיה + גלוטמין גבוה ± ציטרולין נמוך / אורוטט גבוה' },
      { direction_id: 'IEM-U2', diagnosis_direction_he: 'כשל כבדי / ספסיס / פגם אורגני אחר עם אמוניה מוגברת', vs_he: 'אנזימי כבד, תרבית, חומצות אורגניות' },
    ],
    workup: [
      { test_he: 'אמוניה חוזרת דחופה + אמינוגרם + אורוטט בשתן', source_anchor: 'needs_verification.nelson.metabolism.urea_cycle' },
      { test_he: 'ייעוץ מטבולי / טיפול נמרץ ילדים — פרוטוקול היפראמונמיה מקומי מאומת', source_anchor: 'needs_verification.omim.311250.otc' },
    ],
    route_he: 'היפראמונמיה בילוד/תינוק — התרעה דחופה לטיפול נמרץ ילדים. אין להשלים מינון מהזיכרון.',
  }),
]);

function normKey(s) {
  return String(s ?? '').trim().toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/g, '');
}

function canonicalAnalyte(raw) {
  const n = normKey(raw);
  if (!n) return null;
  for (const [canon, aliases] of Object.entries(ANALYTE_ALIASES)) {
    if (n === canon) return canon;
    if (aliases.some((a) => n === normKey(a))) return canon;
  }
  return null;
}

function flagOf(item) {
  const f = String(item?.flag ?? item?.result ?? '').toLowerCase();
  if (['high', 'elevated', 'positive', 'out_of_range', 'pos'].includes(f)) return 'high';
  if (['low', 'decreased', 'negative', 'neg'].includes(f)) return 'low';
  return null;
}

/**
 * מאחד NBS + אמינוגרם + חומצות אורגניות + מעבדה כללית לדגלים קנוניים.
 * ערך מספרי בלי דגל אינו "גבוה" — לא מנחשים סף.
 */
export function collectMetabolicFlags({ labs = [], nbs = [], organic_acids = [], amino_acids = [], findings = [] } = {}) {
  const flags = new Set();
  const rows = [];

  const ingest = (list, source) => {
    for (const item of list ?? []) {
      const canon = canonicalAnalyte(item.analyte ?? item.marker ?? item.key ?? item.name);
      const flag = flagOf(item);
      const row = {
        source,
        analyte: canon || item.analyte || item.marker || item.key,
        canonical: canon,
        flag,
        value: isNum(Number(item.value)) ? Number(item.value) : item.value ?? null,
        unit: item.unit ?? null,
      };
      rows.push(row);
      if (!canon || !flag) continue;
      flags.add(`${canon}_${flag}`);
    }
  };

  ingest(labs, 'lab');
  ingest(nbs, 'nbs');
  ingest(organic_acids, 'organic_acids');
  ingest(amino_acids, 'amino_acids');

  const findingText = (findings ?? []).map((f) => String(f).toLowerCase()).join(' | ');
  if (/letharg|אפתי|ישנוני|ירידת הכרה|אנצפלופת/.test(findingText)) flags.add('finding_lethargy');
  if (/hypoglyc|היפוגליק/.test(findingText)) flags.add('glucose_low');
  if (/hyperammon|היפראמונ/.test(findingText)) flags.add('ammonia_high');
  if (/anion\s*gap|פער אניוני/.test(findingText)) flags.add('anion_gap_high');
  if (/acidosis|חמצת/.test(findingText)) flags.add('acidosis');

  return { flags, rows };
}

function hasAll(flags, keys) {
  return (keys ?? []).every((k) => flags.has(k));
}

function countHits(flags, keys) {
  return (keys ?? []).filter((k) => flags.has(k)).length;
}

export function matchMetabolicPatterns(flagSet) {
  const matched = [];
  for (const p of METABOLIC_PATTERN_CATALOG) {
    if (p.need && !hasAll(flagSet, p.need)) continue;
    if (p.needAny) {
      let groupsOk = true;
      for (const group of p.needAny) {
        const min = p.minHits ?? 1;
        if (countHits(flagSet, group) < min) groupsOk = false;
      }
      if (!groupsOk) continue;
    }
    if (p.plusAny?.length && !p.plusAny.some((k) => flagSet.has(k))) {
      // היפראמונמיה לבדה עדיין מכווינה ל-UCD כסריקה; תמיכה מחזקת.
      if (p.pattern_key !== 'iem.ucd') continue;
    }
    const evidenceKeys = [
      ...(p.need ?? []),
      ...((p.needAny ?? []).flat()),
      ...(p.plusAny ?? []),
    ].filter((k) => flagSet.has(k));
    matched.push({
      ...p,
      verification_status: DRAFT,
      evidence_he: `דגלים שהותאמו: ${evidenceKeys.join(', ')}`,
    });
  }
  return matched;
}

function isNeonate(ageDays) {
  return isNum(ageDays) && ageDays <= 28;
}

/**
 * משבר מטבולי אקוטי בילוד — ממצאים שנמדדו/סומנו, לא ספי מומצאים.
 */
export function metabolicCrisisFlags({ flags, ageDays }) {
  const neonate = isNeonate(ageDays) || ageDays == null; // אם הגיל חסר — לא מרגיעים
  const hypo = flags.has('glucose_low');
  const hyperNH3 = flags.has('ammonia_high');
  const acidosisGap = flags.has('hco3_low') && (flags.has('anion_gap_high') || flags.has('acidosis'));
  const lethargy = flags.has('finding_lethargy');
  const crisisLabs = hypo || hyperNH3 || acidosisGap || lethargy;
  const alerts = [];

  if (hypo) {
    alerts.push({
      flag_key: 'metabolic.hypoglycemia',
      label_he: 'היפוגליקמיה',
      severity: 'critical',
      action_he: 'טיפול בהיפוגליקמיה לפי פרוטוקול מקומי מאומת — לא להשלים מינון מהזיכרון. שקול משבר IEM.',
      source_anchor: 'needs_verification.nelson.metabolism.hypoglycemia',
      verification_status: DRAFT,
    });
  }
  if (hyperNH3) {
    alerts.push({
      flag_key: 'metabolic.hyperammonemia',
      label_he: 'היפראמונמיה',
      severity: 'critical',
      action_he: 'הפניה דחופה לטיפול נמרץ ילדים. ניהול היפראמונמיה לפי פרוטוקול מחלקתי מאומת בלבד.',
      source_anchor: 'needs_verification.nelson.metabolism.urea_cycle',
      extra_anchors: ['needs_verification.omim.311250.otc'],
      verification_status: DRAFT,
    });
  }
  if (acidosisGap) {
    alerts.push({
      flag_key: 'metabolic.anion_gap_acidosis',
      label_he: 'חמצת מטבולית עם Anion Gap מוגבר',
      severity: 'critical',
      action_he: 'חשד למשבר מטבולי / אצידמיה אורגנית — מיון / טיפול נמרץ ילדים.',
      source_anchor: 'needs_verification.nelson.metabolism.organic_acidemias',
      verification_status: DRAFT,
    });
  }
  if (lethargy && (neonate || crisisLabs)) {
    alerts.push({
      flag_key: 'metabolic.neonatal_lethargy',
      label_he: 'אפתיות / ירידת הכרה בהקשר מטבולי',
      severity: 'critical',
      action_he: 'בילוד/תינוק — התרעה דחופה לחדר מיון / טיפול נמרץ ילדים. אל תייחס ל"תינוק ישנוני" בלבד.',
      source_anchor: 'needs_verification.nelson.metabolism.neonatal_crisis',
      verification_status: DRAFT,
    });
  }

  const emergency = alerts.length > 0 && (neonate || crisisLabs);
  return { alerts, emergency, neonate_window: isNeonate(ageDays) };
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
  for (const p of matched) {
    for (const w of p.workup ?? []) {
      if (seen.has(w.test_he)) continue;
      seen.add(w.test_he);
      out.push({ test_he: w.test_he, source_anchor: w.source_anchor || p.source_anchor, verification_status: DRAFT });
    }
  }
  return out;
}

function rowsToFacts(rows) {
  return rows.map((r, i) => ({
    key: `met_${r.canonical || r.analyte || i}`,
    label_he: `${r.source}: ${r.analyte}`,
    value: r.value ?? r.flag ?? '—',
    unit: r.unit,
    flag: r.flag,
  }));
}

/**
 * @param {object} params
 * @param {object} [params.patient]
 * @param {object[]} [params.labs]
 * @param {object[]} [params.nbs]
 * @param {object[]} [params.organic_acids]
 * @param {object[]} [params.amino_acids]
 * @param {string[]} [params.findings]
 * @param {string} [params.mode]
 */
export function runMetabolicInterpreter({
  patient = {},
  labs = [],
  nbs = [],
  organic_acids = [],
  amino_acids = [],
  findings = [],
  mode = 'development',
  locale = 'he',
} = {}) {
  const ageDays = toAgeDays(patient);
  const hasAny = [...labs, ...nbs, ...organic_acids, ...amino_acids].length || (findings ?? []).some(Boolean);
  if (!hasAny) {
    return finalizeLocale(fail('no_metabolic_input', { message_he: 'לא סופקו סקר ילודים, אמינוגרם, חומצות אורגניות, מעבדה או ממצאים.' }), locale);
  }

  const { flags, rows } = collectMetabolicFlags({ labs, nbs, organic_acids, amino_acids, findings });

  const calcRequests = [];
  const num = (canon) => {
    const row = rows.find((r) => r.canonical === canon && isNum(Number(r.value)));
    return row ? Number(row.value) : null;
  };
  const na = num('na');
  const cl = num('cl');
  const hco3 = num('hco3');
  if (na != null && cl != null && hco3 != null) {
    calcRequests.push({ type: 'anion_gap', params: { na, cl, hco3 } });
  }
  const { deterministic, refusals } = runCalculators(calcRequests);

  const matched = matchMetabolicPatterns(flags);
  const crisis = metabolicCrisisFlags({ flags, ageDays });
  const kbItems = matched.map(patternToKb);
  const patternRed = matched.filter((p) => p.crisis).map((p) => ({
    flag_key: p.pattern_key,
    label_he: p.title_he,
    severity: 'critical',
    action_he: p.route_he || 'ייעוץ מטבולי דחוף / מיון ילדים',
    source_anchor: p.source_anchor,
    extra_anchors: p.extra_anchors ?? [],
    verification_status: DRAFT,
  }));
  const red_flags = [...crisis.alerts, ...patternRed];
  const seen = new Set();
  const uniqFlags = [];
  for (const f of red_flags) {
    if (seen.has(f.flag_key)) continue;
    seen.add(f.flag_key);
    uniqFlags.push(f);
  }

  const patientData = [
    ...rowsToFacts(rows),
    ...(isNum(ageDays) ? [{ key: 'age_days', label_he: 'גיל (ימים)', value: ageDays, unit: 'days' }] : []),
  ];

  const factBlock = buildFactBlock({ kbItems, deterministic, patientData, mode });

  return finalizeLocale({
    ok: true,
    engine: 'metabolic_interpreter',
    verification_status: DRAFT,
    age_days: ageDays,
    flags: [...flags],
    matched_patterns: matched.map((p) => p.pattern_key),
    kbItems,
    red_flags: uniqFlags,
    safety_alerts: uniqFlags,
    emergency: crisis.emergency || matched.some((p) => p.crisis && isNeonate(ageDays)),
    differential: flattenDiff(matched),
    recommended_tests: flattenWorkup(matched),
    calculators: deterministic,
    calculator_refusals: refusals,
    factBlock,
    disclaimer_he: DISCLAIMER_HE,
    notes_he: [
      'דפוסים מותאמים רק מדגלים שסומנו (high/low/positive) — ערך בלי דגל אינו אבחנה.',
      'אין מינונים במנוע זה. ניהול משבר לפי פרוטוקול מחלקתי מאומת.',
    ],
    unknowns_he: matched.length ? [] : ['לא הותאם דפוס IEM מהדגלים שסופקו — אין משמעות של "סקר תקין" אם הדגלים חלקיים.'],
  }, locale);
}
