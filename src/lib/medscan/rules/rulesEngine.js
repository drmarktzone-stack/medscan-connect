/**
 * MedScan — Deterministic Rules / Patterns / Red Flags Engine
 *
 * זהו ה"שלד": התאמת ידע לנתוני המטופל נעשית **בקוד**, לא ע"י מודל שפה.
 * המודל מקבל רק את מה שהותאם — וזה מה שהופך את ה-grounding לאמיתי.
 *
 * סדר ההרצה קבוע ומחייב:
 *   1. Red Flags  (בטיחות-גיל תחילה — לפני כל שיקול אבחוני)
 *   2. LabPatterns
 *   3. ClinicalRules
 *   4. Associations
 *   5. Pediatric Pathways (ניתוב מסלול קהילה — מעל protocolTree)
 *   6. Clinical triads / pentads (syndromeMatcher — רב-ערוצי)
 */

import { matchSyndromes } from '../engines/syndromeMatcher.js';

import {
  matchPediatricPathway,
  pathwayToKbItem,
} from '../engines/pediatricPathways.js';

/* ═══════════════════════════════════════════════════════════════════════
 * 1. RED FLAGS — קדימות מוחלטת
 * ═══════════════════════════════════════════════════════════════════════ */

export function computeRedFlags({ redFlagKb = [], patient = {}, findings = [], labs = [], mode = 'clinical' }) {
  const ageDays = Number(patient.age_days);
  const present = new Set(findings.map(normalizeText));

  // ממצאי מעבדה חריגים נחשבים גם הם ל"ממצא נוכח"
  for (const l of labs) {
    if (l.flag === 'high' || l.flag === 'low') {
      present.add(normalizeText(`${l.analyte} ${l.flag}`));
      present.add(normalizeText(l.analyte));
    }
  }

  const triggered = [];
  const skipped = [];

  for (const rf of redFlagKb) {
    const status = rf.verification_status ?? 'draft_needs_verification';
    if (status === 'flagged') { skipped.push({ flag_key: rf.flag_key, why: 'flagged' }); continue; }

    // בדיקת חלון-גיל
    if (Number.isFinite(ageDays)) {
      if (Number.isFinite(rf.age_min_days) && ageDays < rf.age_min_days) continue;
      if (Number.isFinite(rf.age_max_days) && ageDays > rf.age_max_days) continue;
    } else if (Number.isFinite(rf.age_min_days) || Number.isFinite(rf.age_max_days)) {
      // דגל תלוי-גיל בלי גיל ידוע: לא מדלגים בשקט — מדווחים
      skipped.push({
        flag_key: rf.flag_key,
        why: 'unknown_age',
        message_he: `הדגל "${rf.label_he}" תלוי-גיל ולא ניתן היה להעריכו ללא גיל המטופל.`,
      });
      continue;
    }

    const triggerFindings = rf.trigger?.findings ?? [];
    const logic = rf.trigger?.logic ?? 'all';
    const matched = triggerFindings.filter((f) => matchesAny(f, present));

    const fires = logic === 'any' ? matched.length > 0 : matched.length === triggerFindings.length;
    if (!fires || !triggerFindings.length) continue;

    triggered.push({
      flag_key: rf.flag_key,
      label_he: rf.label_he,
      reason_he: rf.reason_he ?? null,
      action_he: rf.action_he,
      severity: rf.severity ?? 'red',
      source_anchor: rf.source_anchor ?? null,
      verification_status: status,
      matched_findings: matched,
      is_draft: status !== 'verified',
    });
  }

  // מסכני-חיים ראשונים
  triggered.sort((a, b) => (a.severity === 'critical' ? -1 : 0) - (b.severity === 'critical' ? -1 : 0));

  // במצב קליני, דגל טיוטה עדיין מוצג — בטיחות אינה מסוננת החוצה — אך מסומן.
  const forDisplay = mode === 'clinical'
    ? triggered.map((t) => t.is_draft ? { ...t, draft_notice_he: 'דגל זה מבוסס ידע שטרם אומת מול נלסון.' } : t)
    : triggered;

  return { redFlags: forDisplay, skipped };
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2. LAB PATTERNS
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * מתאים דפוסי מעבדה. דפוס נחשב מותאם אם התקיימו לפחות `min_components` רכיבים.
 * מדדים ללא טווח ייחוס מאומת (`unknown_range`) **אינם משתתפים** — הם לא
 * יכולים לתמוך בדפוס ולא לשלול אותו.
 */
export function matchLabPatterns({ patternKb = [], labs = [], patient = {}, mode = 'clinical' }) {
  // אינדקס כפול: גם לפי השם שהוזן וגם לפי המפתח הקנוני.
  // בלי הקנוני, דפוס שדורש hemoglobin לא יופעל על ערך שהוזן כ-"Hb".
  const byAnalyte = new Map();
  for (const l of labs) {
    byAnalyte.set(normalizeText(l.analyte), l);
    if (l.canonical_key) byAnalyte.set(normalizeText(l.canonical_key), l);
  }

  const matched = [];
  const partial = [];

  for (const p of patternKb) {
    const status = p.verification_status ?? 'draft_needs_verification';
    if (status === 'flagged') continue;
    if (mode === 'clinical' && status !== 'verified') {
      // נשמר לתצוגת-פערים, לא נכנס ל-grounding הקליני
      partial.push({ pattern_key: p.pattern_key, why: 'unverified', title_he: p.title_he });
      continue;
    }
    if (!ageScopeMatches(p.age_scope, patient.age_days)) continue;

    const components = p.components ?? [];
    const hits = [];
    const misses = [];
    let unavailable = 0;

    for (const c of components) {
      const candidates = String(c.analyte).split('/').map(normalizeText);
      const found = candidates.map((k) => byAnalyte.get(k)).find(Boolean);

      if (!found || found.flag === 'unknown_range' || found.flag == null) {
        unavailable += 1;
        continue;
      }
      if (directionMatches(c.direction, found.flag)) {
        hits.push({
          analyte: found.analyte, direction: c.direction,
          value: found.value, unit: found.unit, flag: found.flag,
          // הרכיב נשען על טווח ייחוס שטרם אומת
          from_draft_range: Boolean(found.flagged_by_draft_range),
        });
      } else {
        misses.push({ analyte: found.analyte, expected: c.direction, actual: found.flag });
      }
    }

    const need = Number.isFinite(p.min_components) ? p.min_components : 2;
    const record = {
      pattern_key: p.pattern_key,
      title_he: p.title_he,
      direction_he: p.direction_he,
      suspicion: p.suspicion,
      clinical_reasoning_he: p.clinical_reasoning_he ?? null,
      confirm_with_he: p.confirm_with_he ?? [],
      source_anchor: p.source_anchor ?? null,
      verification_status: status,
      contributing: hits.map((h) => h.analyte),
      hits,
      misses,
      unavailable_components: unavailable,
      matched_count: hits.length,
      required_count: need,
      total_components: components.length,
      matched_ratio: components.length ? hits.length / components.length : 0,
      // אם ולו רכיב אחד נשען על טווח לא-מאומת, הדפוס כולו
      // נשען על בסיס שלא אומת. הכיול מגביל בהתאם.
      relies_on_draft_range: hits.some((h) => h.from_draft_range),
    };

    if (hits.length >= need) matched.push(record);
    else if (hits.length > 0) partial.push({ ...record, why: 'below_min_components' });
  }

  matched.sort((a, b) => b.matched_ratio - a.matched_ratio);
  return { matched, partial };
}

/* ═══════════════════════════════════════════════════════════════════════
 * 3. CLINICAL RULES
 * ═══════════════════════════════════════════════════════════════════════ */

export function evaluateRules({ ruleKb = [], patient = {}, labs = [], findings = [], mode = 'clinical' }) {
  const ctx = buildContext({ patient, labs, findings });
  const fired = [];
  const nearMiss = [];

  for (const rule of ruleKb) {
    const status = rule.verification_status ?? 'draft_needs_verification';
    if (status === 'flagged') continue;
    if (mode === 'clinical' && status !== 'verified') continue;

    const conditions = rule.conditions ?? [];
    if (!conditions.length) continue;

    const results = conditions.map((c) => ({ condition: c, met: evaluateCondition(c, ctx) }));
    const metCount = results.filter((r) => r.met === true).length;
    const undetermined = results.filter((r) => r.met === null).length;

    const logic = rule.logic ?? 'all';
    let fires = false;
    if (logic === 'all') fires = metCount === conditions.length;
    else if (logic === 'any') fires = metCount > 0;
    else if (logic === 'min_count') fires = metCount >= (rule.min_count ?? 1);

    const record = {
      rule_key: rule.rule_key,
      title_he: rule.title_he,
      category: rule.category ?? null,
      domain: rule.domain ?? null,
      conclusion_he: rule.conclusion_he,
      suspicion: rule.suspicion,
      clinical_reasoning_he: rule.clinical_reasoning_he ?? null,
      recommended_workup_he: rule.recommended_workup_he ?? [],
      source_anchor: rule.source_anchor ?? null,
      verification_status: status,
      matched_count: metCount,
      total_conditions: conditions.length,
      undetermined_count: undetermined,
      matched_ratio: conditions.length ? metCount / conditions.length : 0,
      unmet: results.filter((r) => r.met !== true).map((r) => describeCondition(r.condition)),
    };

    if (fires) fired.push(record);
    else if (metCount > 0) {
      // "כמעט התקיים" הוא מידע קליני חשוב — במיוחד בקריטריונים כמו קוואסאקי
      nearMiss.push({ ...record, why: `${metCount}/${conditions.length} תנאים התקיימו` });
    }
  }

  fired.sort((a, b) => b.matched_ratio - a.matched_ratio);
  nearMiss.sort((a, b) => b.matched_ratio - a.matched_ratio);
  return { fired, nearMiss };
}

/* ═══════════════════════════════════════════════════════════════════════
 * 4. ASSOCIATIONS
 * ═══════════════════════════════════════════════════════════════════════ */

export function matchAssociations({ assocKb = [], findings = [], labs = [], patient = {}, mode = 'clinical' }) {
  const present = new Set(findings.map(normalizeText));
  for (const l of labs) {
    if (l.flag === 'high' || l.flag === 'low') present.add(normalizeText(l.analyte));
  }

  const matched = [];
  for (const a of assocKb) {
    const status = a.verification_status ?? 'draft_needs_verification';
    if (status === 'flagged') continue;
    if (mode === 'clinical' && status !== 'verified') continue;
    if (!ageScopeMatches(a.age_scope, patient.age_days)) continue;

    if (!matchesAny(a.anchor_finding_he, present)) continue;

    const co = a.co_findings ?? [];
    const coHits = co.filter((c) => matchesAny(c, present));

    matched.push({
      assoc_key: a.assoc_key,
      anchor_finding_he: a.anchor_finding_he,
      implies_he: a.implies_he,
      suspicion: a.suspicion,
      mechanism_he: a.mechanism_he ?? null,
      action_he: a.action_he ?? null,
      source_anchor: a.source_anchor ?? null,
      verification_status: status,
      co_findings_present: coHits,
      co_findings_absent: co.filter((c) => !coHits.includes(c)),
      matched_ratio: co.length ? coHits.length / co.length : 1,
    });
  }

  matched.sort((a, b) => b.matched_ratio - a.matched_ratio);
  return { matched };
}

/* ═══════════════════════════════════════════════════════════════════════
 * הרצה משולבת — הסדר הוא חלק מהבטיחות
 * ═══════════════════════════════════════════════════════════════════════ */

export function runRulesEngine({
  kb = {},
  patient = {},
  labs = [],
  findings = [],
  mode = 'clinical',
  query = null,
  pathwayCategory = null,
  currentPathwayStepId = null,
  vitals = {},
  skin = null,
  radiology = null,
  complaints = [],
  presentation = null,
  audio = null,
  labInterpreter = null,
  features = {},
} = {}) {
  const redFlagsResult = computeRedFlags({
    redFlagKb: kb.redFlags ?? [], patient, findings, labs, mode,
  });
  const patternsResult = matchLabPatterns({ patternKb: kb.labPatterns ?? [], labs, patient, mode });
  const rulesResult = evaluateRules({ ruleKb: kb.rules ?? [], patient, labs, findings, mode });
  const assocResult = matchAssociations({ assocKb: kb.associations ?? [], findings, labs, patient, mode });

  const pathwayQuery = buildPathwayQuery({ query, findings });
  const pathwayMatch = matchPediatricPathway({
    query: pathwayQuery,
    age_days: patient.age_days,
    category: pathwayCategory,
    currentStepId: currentPathwayStepId,
    catalog: kb.pathways,
  });

  const syndromeResult = matchSyndromes({
    findings,
    complaints,
    presentation,
    labs,
    labInterpreter,
    vitals,
    skin,
    radiology,
    audio,
    features,
  });
  const syndromeDraft = (s) => (s.verification_status ?? 'draft_needs_verification') !== 'verified';
  const syndromesForKb = (syndromeResult.matched ?? []).filter((s) => {
    if (s.verification_status === 'flagged') return false;
    if (mode === 'clinical' && syndromeDraft(s)) return false;
    return true;
  });

  // פריטי ה-KB שיזינו את ה-FACT BLOCK — רק מה שהותאם בפועל.
  // מסלול טיוטה נדחף ל-kbItems רק במצב development; במצב clinical
  // הסינון זהה לכללי/דפוסים — FactBlock/AnchorGuard לא רואים אותו.
  const kbItems = [
    ...patternsResult.matched.map((p) => ({ ...p, verification_status: p.verification_status })),
    ...rulesResult.fired,
    ...assocResult.matched,
    ...syndromesForKb.map((s) => ({
      pattern_key: s.pattern_key,
      title_he: s.title_he,
      direction_he: s.differential?.[0]?.diagnosis_direction_he ?? s.title_he,
      suspicion: s.suspicion,
      clinical_reasoning_he: s.evidence_he,
      source_anchor: s.source_anchor,
      extra_anchors: s.extra_anchors ?? [],
      verification_status: s.verification_status,
      criteria_match_pct: s.criteria_match_pct,
    })),
  ];

  const pathwayItem = pathwayToKbItem(pathwayMatch);
  if (pathwayItem) {
    const status = pathwayItem.verification_status ?? 'draft_needs_verification';
    if (status !== 'flagged' && (mode !== 'clinical' || status === 'verified')) {
      kbItems.push(pathwayItem);
    }
  }

  return {
    redFlags: redFlagsResult.redFlags,
    redFlagsSkipped: redFlagsResult.skipped,
    matchedPatterns: patternsResult.matched,
    partialPatterns: patternsResult.partial,
    firedRules: rulesResult.fired,
    nearMissRules: rulesResult.nearMiss,
    associations: assocResult.matched,
    matchedPathway: pathwayMatch.matched,
    activePathwayStep: pathwayMatch.active_step,
    pathwayCandidates: pathwayMatch.candidates,
    pathwaySkipped: pathwayMatch.skipped,
    pathwayError_he: pathwayMatch.error_he,
    matchedSyndromes: syndromeResult.matched,
    nearMissSyndromes: syndromeResult.nearMiss,
    kbItems,
    isEmpty: kbItems.length === 0 && redFlagsResult.redFlags.length === 0,
  };
}

function buildPathwayQuery({ query, findings = [] }) {
  const explicit = String(query ?? '').trim();
  if (explicit) return explicit;
  return (findings ?? []).filter(Boolean).join(' ');
}

/* ═══════════════════════════════════════════════════════════════════════
 * עזרים
 * ═══════════════════════════════════════════════════════════════════════ */

function buildContext({ patient, labs, findings }) {
  const labMap = new Map();
  for (const l of labs) labMap.set(normalizeText(l.analyte), l);

  const findingSet = new Set(findings.map(normalizeText));

  return {
    age_days: Number(patient.age_days),
    sex: patient.sex ?? null,
    weight_kg: Number(patient.weight_kg),
    background: new Set([
      ...(patient.chronic_conditions ?? []),
      ...(patient.medications ?? []),
    ].map(normalizeText)),
    labMap,
    findingSet,
    duration_days: Number(patient.symptom_duration_days),
  };
}

/**
 * מעריך תנאי בודד.
 * @returns {boolean|null} null = לא ניתן להכריע (אין נתון) — לא נחשב "לא התקיים"
 */
function evaluateCondition(cond, ctx) {
  const { type, key, op, value } = cond;

  if (type === 'finding' || type === 'symptom') {
    const present = matchesAny(key, ctx.findingSet);
    if (op === 'present') return present;
    if (op === 'absent') return !present;
    return present;
  }

  if (type === 'background') {
    const present = matchesAny(key, ctx.background);
    return op === 'absent' ? !present : present;
  }

  if (type === 'age') return compare(ctx.age_days, op, value);
  if (type === 'duration') return compare(ctx.duration_days, op, value);

  if (type === 'lab') {
    const lab = ctx.labMap.get(normalizeText(key));
    if (!lab) return null;
    if (op === 'present') return true;
    if (op === 'absent') return false;
    if (op === 'high' || op === 'low') return lab.flag === op;
    if (lab.flag === 'unknown_range') return null;
    return compare(Number(lab.value), op, value);
  }

  return null;
}

/**
 * מפרש גבולות טווח מכל הצורות שבהן הם מגיעים בפועל.
 *
 * ⚠ הגרסה הקודמת דרשה Array.isArray בלבד, ולכן אופרטור range
 * היה **מת לחלוטין בפרודקשן**: שכבת האחסון של הישויות שומרת
 * את condition.value כמחרוזת, ומערך כלל אינו נשמר. התוצאה: כל
 * כלל עם טווח החזיר null ולעולם לא נורה — בלי שגיאה, בלי אזהרה,
 * ובלי שדבר יראה שבור. זהו בדיוק הכשל השקט שהמערכת אמורה למנוע.
 */
function parseRange(expected) {
  if (Array.isArray(expected) && expected.length >= 2) {
    const lo = Number(expected[0]);
    const hi = Number(expected[1]);
    return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
  }
  if (typeof expected === 'string') {
    // "29-90" · "[29,90]" · "29,90" · "29 – 90". מספר שלילי אינו צפוי בהקשר
    // קליני (גיל, משך, ערך מעבדה), ולכן מקף נקרא כמפריד.
    const nums = expected.match(/\d+(?:\.\d+)?/g);
    if (nums?.length >= 2) return [Number(nums[0]), Number(nums[1])];
  }
  return null;
}

function compare(actual, op, expected) {
  if (!Number.isFinite(actual)) return null;

  if (op === 'range') {
    const bounds = parseRange(expected);
    if (!bounds) return null;
    const [lo, hi] = bounds;
    return actual >= lo && actual <= hi;
  }

  const e = Number(expected);
  // סף שאינו מספר אינו "לא מתקיים" — הוא "לא ניתן להערכה".
  // החזרת false היתה מציגה שלילה ודאית במקום חוסר ידיעה.
  if (!Number.isFinite(e)) return null;

  switch (op) {
    case '>':  return actual > e;
    case '>=': return actual >= e;
    case '<':  return actual < e;
    case '<=': return actual <= e;
    case '==': return actual === e;
    default: return null;
  }
}

function describeCondition(c) {
  return `${c.type}:${c.key} ${c.op}${c.value !== undefined ? ` ${JSON.stringify(c.value)}` : ''}`;
}

function directionMatches(expected, actualFlag) {
  if (expected === 'high') return actualFlag === 'high';
  if (expected === 'low') return actualFlag === 'low';
  if (expected === 'present') return actualFlag === 'high' || actualFlag === 'low' || actualFlag === 'normal';
  if (expected === 'absent') return actualFlag === 'normal';
  return false;
}

function ageScopeMatches(scope, ageDays) {
  if (!scope || scope === 'all') return true;
  if (!Number.isFinite(Number(ageDays))) return true; // בלי גיל לא מסננים החוצה
  const d = Number(ageDays);
  switch (scope) {
    case 'neonate':    return d <= 28;
    case 'infant':     return d <= 365;
    case 'child':      return d > 365 && d <= 4383;   // עד ~12 שנים
    case 'adolescent': return d > 4383;
    default: return true;
  }
}

export function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/["'׳״]/g, '')
    .replace(/\s+/g, ' ');
}

/** התאמה גמישה: הכלה דו-כיוונית אחרי נרמול. */
function matchesAny(needle, haystackSet) {
  const n = normalizeText(needle);
  if (!n) return false;
  if (haystackSet.has(n)) return true;
  for (const h of haystackSet) {
    if (h.includes(n) || n.includes(h)) return true;
  }
  return false;
}
