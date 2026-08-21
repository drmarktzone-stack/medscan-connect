/**
 * MedScan — Vision Observation Extraction (כל המודליות)
 *
 * מרחיב את `observations.js` לשלושת מודולי ה-Vision: רדיולוגיה, ECG, עור.
 * לוגיקה טהורה, ללא I/O — ולכן ההפרדה תפיסה/פרשנות ניתנת לבדיקה.
 *
 * ## ההפרדה, שוב
 *   תפיסה   — מה נראה. קריאת המודל. לא מעוגנת ב-KB ולא מתיימרת.
 *   פרשנות  — למה זה מרמז. עוברת grounding מלא.
 *
 * ## מה ייחודי ל-ECG
 * ב-ECG התפיסה כוללת **מדידות מספריות** (PR, QRS, QT, QTc). אלה שונות
 * מממצא מילולי: הן מספרים שהמודל קרא מהתרשים, והן חייבות להיכנס
 * ל-FACT BLOCK כערכים מדודים — אחרת `numericGuard` יחסום כל ציטוט
 * לגיטימי שלהן, והפלט ייראה כאילו המודל המציא את המרווחים.
 *
 * הבחנה חשובה: מדידה שהמודל קרא מהתרשים אינה "ערך דטרמיניסטי" (D#).
 * היא תצפית (P#) — עם כל אי-הוודאות שבקריאה ויזואלית.
 */

/* ═══════════════════════════════════════════════════════════════════════
 * רדיולוגיה
 * ═══════════════════════════════════════════════════════════════════════ */

export function extractRadiologyObservations(structured) {
  const out = [];

  for (const abn of structured?.key_abnormalities ?? []) {
    if (!abn?.finding) continue;
    out.push({
      finding_he: abn.finding,
      location_he: abn.location ?? null,
      severity: abn.severity ?? null,
      characteristics_he: abn.characteristics ?? null,
      source: 'key_abnormality',
    });
  }

  for (const f of structured?.systematic_findings ?? []) {
    if (!f?.anatomical_zone) continue;
    if (!/abnormal|חריג/i.test(f.status ?? '')) continue;
    out.push({
      finding_he: f.description || f.anatomical_zone,
      location_he: f.anatomical_zone,
      severity: null,
      characteristics_he: null,
      source: 'systematic_finding',
    });
  }

  return [...out, ...modelReportedFlags(structured)];
}

/* ═══════════════════════════════════════════════════════════════════════
 * ECG
 * ═══════════════════════════════════════════════════════════════════════ */

export function extractEcgObservations(structured) {
  const out = [];

  // finding_evidence הוא המקור הטוב ביותר: ממצא + הראיה המדידה שלו
  for (const fe of structured?.finding_evidence ?? []) {
    if (!fe?.finding) continue;
    out.push({
      finding_he: fe.finding,
      location_he: fe.leads ?? null,
      severity: null,
      characteristics_he: fe.evidence ?? null,
      source: 'finding_evidence',
    });
  }

  // ממצאים עיקריים שאין להם רשומת-ראיה — נכנסים, ומסומנים ככאלה
  const covered = new Set(out.map((o) => o.finding_he));
  for (const pf of structured?.primary_findings ?? []) {
    if (!pf || covered.has(pf)) continue;
    out.push({
      finding_he: pf,
      location_he: null,
      severity: null,
      characteristics_he: null,
      source: 'primary_finding_without_evidence',
    });
  }

  // מורפולוגיה — רק כשיש בה תוכן מהותי
  const morph = structured?.wave_and_segment_morphology;
  for (const [key, label] of [
    ['st_segment', 'מקטע ST'],
    ['t_waves', 'גלי T'],
    ['q_waves', 'גלי Q'],
  ]) {
    const v = morph?.[key];
    if (!v || /normal|תקין|ללא/i.test(v)) continue;
    out.push({
      finding_he: `${label}: ${v}`,
      location_he: null, severity: null, characteristics_he: null,
      source: 'morphology',
    });
  }

  const hyp = structured?.hypertrophy_and_enlargement;
  if (hyp?.lvh_present) out.push({ finding_he: 'היפרטרופיה של חדר שמאל (LVH)', source: 'hypertrophy' });
  if (hyp?.rvh_present) out.push({ finding_he: 'היפרטרופיה של חדר ימין (RVH)', source: 'hypertrophy' });
  if (hyp?.atrial_enlargement && !/none/i.test(hyp.atrial_enlargement)) {
    out.push({ finding_he: `הגדלה פרוזדורית: ${hyp.atrial_enlargement}`, source: 'hypertrophy' });
  }

  return [...out, ...modelReportedFlags(structured)];
}

/**
 * מדידות ECG כפריטי P#.
 *
 * ⚠ אלה **תצפיות**, לא ערכים דטרמיניסטיים. המודל קרא אותן מהתרשים,
 * ולכן הן נושאות את אי-הוודאות של קריאה ויזואלית. הן נכנסות כ-P#
 * (ולא כ-D#) בדיוק מהסיבה הזו — וגם כדי ש-numericGuard יכיר בהן
 * כמספרים לגיטימיים במקום לחסום אותן.
 */
export function extractEcgMeasurements(structured) {
  const iv = structured?.intervals;
  if (!iv) return [];

  const fields = [
    ['pr_ms', 'מרווח PR', 'ms'],
    ['qrs_ms', 'משך QRS', 'ms'],
    ['qt_ms', 'מרווח QT', 'ms'],
    ['rr_ms', 'מרווח RR', 'ms'],
    ['qtc_bazett_ms', 'QTc (Bazett)', 'ms'],
    ['qtc_fridericia_ms', 'QTc (Fridericia)', 'ms'],
  ];

  const out = [];
  for (const [key, label, unit] of fields) {
    const v = Number(iv[key]);
    if (!Number.isFinite(v)) continue;
    out.push({
      key: `ecg_${key}`,
      label_he: `${label} (נמדד מהתרשים)`,
      value: v,
      unit,
      flag: null,
    });
  }

  if (iv.qtc_status) {
    out.push({ key: 'ecg_qtc_status', label_he: 'סיווג QTc', value: iv.qtc_status });
  }

  const rr = structured?.rhythm_and_rate;
  if (rr) {
    if (Number.isFinite(Number(rr.rate_bpm))) {
      out.push({ key: 'ecg_rate', label_he: 'קצב (נמדד)', value: Number(rr.rate_bpm), unit: 'bpm' });
    }
    if (rr.rhythm) out.push({ key: 'ecg_rhythm', label_he: 'קצב/מקצב', value: rr.rhythm });
  }

  return out;
}

/* ═══════════════════════════════════════════════════════════════════════
 * עור
 * ═══════════════════════════════════════════════════════════════════════ */

export function extractSkinObservations(structured) {
  const out = [];
  const d = structured?.dermatological_descriptors;

  for (const l of d?.primary_lesions ?? []) {
    if (l) out.push({ finding_he: `נגע ראשוני: ${l}`, source: 'primary_lesion' });
  }
  for (const l of d?.secondary_lesions ?? []) {
    if (l) out.push({ finding_he: `נגע משני: ${l}`, source: 'secondary_lesion' });
  }
  for (const [key, label] of [
    ['configuration', 'תצורה'],
    ['distribution_pattern', 'דפוס פיזור'],
    ['color_and_border', 'צבע וגבולות'],
  ]) {
    const v = d?.[key];
    if (v) out.push({ finding_he: `${label}: ${v}`, source: 'descriptor' });
  }

  for (const k of structured?.key_findings_summary ?? []) {
    if (k) out.push({ finding_he: k, source: 'key_finding' });
  }

  const loc = structured?.image_metadata?.anatomical_location;
  if (loc) {
    for (const o of out) if (!o.location_he) o.location_he = loc;
  }

  return [...out, ...modelReportedFlags(structured)];
}

/* ═══════════════════════════════════════════════════════════════════════
 * משותף
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * דגלים שהמודל דיווח נכנסים כ**ממצאים**, לא כדגלי מערכת.
 * דגל מערכת מגיע אך ורק ממנוע ה-RedFlag הדטרמיניסטי.
 */
function modelReportedFlags(structured) {
  return (structured?.critical_red_flags ?? [])
    .filter(Boolean)
    .map((rf) => ({
      finding_he: rf,
      location_he: null,
      severity: 'reported_red_flag',
      characteristics_he: null,
      source: 'model_reported_flag',
    }));
}

const EXTRACTORS = {
  radiology: extractRadiologyObservations,
  ecg: extractEcgObservations,
  skin: extractSkinObservations,
};

export function extractObservationsFor(modality, structured) {
  const fn = EXTRACTORS[modality];
  if (!fn) throw new Error(`Unknown vision modality: ${modality}`);
  return fn(structured);
}

/** ממצאים → מחרוזות עבור מנוע ה-Rules. */
export function toFindingStrings(observations = []) {
  const out = new Set();
  for (const o of observations) {
    if (o.finding_he) out.add(o.finding_he);
    if (o.finding_he && o.location_he) out.add(`${o.finding_he} ${o.location_he}`);
  }
  return [...out];
}

/** ממצאים → פריטי P#. תצפית, לא ידע. */
export function toPatientFacts(observations = [], structured = null, modality = null) {
  const facts = observations.map((o, i) => ({
    key: `obs_${i + 1}`,
    label_he: `ממצא נצפה${o.location_he ? ` (${o.location_he})` : ''}`,
    value: [o.finding_he, o.characteristics_he].filter(Boolean).join(' — '),
    unit: null,
    flag: null,
  }));

  const md = structured?.image_metadata;
  if (md) {
    const parts = [
      md.modality_detected, md.anatomical_region, md.anatomical_location,
      md.estimated_fitzpatrick_type ? `Fitzpatrick ${md.estimated_fitzpatrick_type}` : null,
      md.technical_quality ? `איכות: ${md.technical_quality}` : null,
    ].filter(Boolean);
    if (parts.length) {
      facts.push({ key: 'image_meta', label_he: 'מאפייני התמונה', value: parts.join(' / ') });
    }
  }

  if (modality === 'ecg') facts.push(...extractEcgMeasurements(structured));

  return facts;
}

/** אזורים שלא ניתן היה להעריך. "לא הוערך" אינו "תקין". */
export function extractIndeterminateZones(structured) {
  return (structured?.systematic_findings ?? [])
    .filter((f) => /indeterminate|לא ניתן|לא הוערך/i.test(f.status ?? ''))
    .map((f) => f.anatomical_zone)
    .filter(Boolean);
}
