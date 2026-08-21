/**
 * DoctorPedAI — ממשק קליטת ניתוח ממודלי Medical Vision ייעודיים
 *
 * אין HTTP. הקורא מספק דוח מובנה שכבר הופק ממודל ייעודי (עור / הדמיה).
 * כאן רק אימות מבנה, נרמול ממצאים, והצלבה מול האבחנה המבדלת של המערכת.
 *
 * כישלון → `{ ok:false }`. אין אבחנה מהמודל החיצוני לבדה.
 */

const DRAFT = 'draft_needs_verification';

const tok = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2);

function fail(reason, extra = {}) {
  return { ok: false, reason, verification_status: 'unavailable', ...extra };
}

function asFinding(raw, source) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const label = raw.trim();
    if (!label) return null;
    return { label_he: label, location_he: null, characteristics_he: null, source };
  }
  const label = String(raw.label_he || raw.label || raw.finding || raw.name || '').trim();
  if (!label) return null;
  return {
    label_he: label,
    location_he: raw.location_he || raw.location || null,
    characteristics_he: raw.characteristics_he || raw.characteristics || raw.description || null,
    source,
  };
}

function collectFindings(report) {
  const out = [];
  const push = (item, source) => {
    const f = asFinding(item, source);
    if (f) out.push(f);
  };

  if (Array.isArray(report.findings)) report.findings.forEach((x) => push(x, 'external_finding'));
  if (Array.isArray(report.key_abnormalities)) report.key_abnormalities.forEach((x) => push(x, 'key_abnormality'));
  if (Array.isArray(report.key_findings_summary)) report.key_findings_summary.forEach((x) => push(x, 'key_finding'));

  const d = report.dermatological_descriptors;
  if (d) {
    (d.primary_lesions || []).forEach((x) => push(x, 'primary_lesion'));
    (d.secondary_lesions || []).forEach((x) => push(x, 'secondary_lesion'));
    if (d.color_and_border) push({ label_he: `צבע/גבול: ${d.color_and_border}` }, 'descriptor');
    if (d.distribution_pattern) push({ label_he: `פיזור: ${d.distribution_pattern}` }, 'descriptor');
  }

  const morph = report.morphology || report.features;
  if (morph && typeof morph === 'object') {
    if (morph.borders?.irregular) push('גבולות לא-סדירים (מדידה)', 'cv_border');
    if (morph.color?.variegated) push('גיוון צבע (מדידה)', 'cv_color');
    if ((morph.satellite_lesions?.count ?? 0) > 0) push('רכיבים לווייניים בשדה (מדידה)', 'cv_satellite');
    if (morph.pulmonary_infiltrate_texture?.elevated) push('מרקם לוסנטי מוגבר (טיוטה)', 'cv_infiltrate');
    if (morph.bone_structure && morph.bone_structure.connected_components > 0) {
      push('מבנה גרמי מחובר זוהה (מדידה יחסית)', 'cv_bone');
    }
  }

  return out;
}

function itemText(dd) {
  return [
    dd.diagnosis,
    dd.diagnosis_direction_he,
    dd.title,
    dd.reasoning,
    dd.supporting_features,
    dd.supports_he && Array.isArray(dd.supports_he) ? dd.supports_he.join(' ') : '',
    dd.refutes_he && Array.isArray(dd.refutes_he) ? dd.refutes_he.join(' ') : '',
  ].filter(Boolean).join(' ');
}

function overlapScore(findings, dd) {
  const ft = new Set(findings.flatMap((f) => tok(f.label_he)));
  const dt = tok(itemText(dd)).filter((w) => w.length > 3);
  if (!dt.length || !ft.size) return { overlap: 0, shared: [] };
  const shared = dt.filter((w) => ft.has(w));
  const uniq = [...new Set(shared)];
  return { overlap: uniq.length, shared: uniq };
}

/**
 * הצלבת ממצאי Vision מול אבחנה מבדלת של המערכת.
 * פריט ללא חפיפה נשאר "לא נתמך בממצאי הראייה" — לא נמחק ולא מומצא.
 */
export function crossMatchVisionWithDifferential(findings = [], differential = []) {
  const rows = [];
  for (const dd of differential || []) {
    const diagnosis = dd.diagnosis || dd.diagnosis_direction_he || dd.title;
    if (!diagnosis) continue;
    const { overlap, shared } = overlapScore(findings, dd);
    rows.push({
      diagnosis,
      overlap,
      shared_tokens: shared.slice(0, 8),
      supported_by_vision: overlap >= 1,
      source_anchors: dd.source_anchors ?? (dd.source_anchor ? [dd.source_anchor] : []),
      verification_status: DRAFT,
    });
  }
  rows.sort((a, b) => b.overlap - a.overlap);
  return rows;
}

/**
 * @param {object} report דוח ממודל Medical Vision או ממאפייני CV שלנו
 * @param {object} [opts]
 * @param {object[]} [opts.differential] אבחנה מבדלת של המערכת
 */
export function ingestMedicalVisionReport(report, { differential = [] } = {}) {
  if (!report || typeof report !== 'object') return fail('invalid_report');

  const findings = collectFindings(report);
  if (!findings.length) return fail('no_findings');

  const crosswalk = crossMatchVisionWithDifferential(findings, differential);
  const unmatched = findings.filter((f) => {
    const ft = tok(f.label_he);
    return !crosswalk.some((row) => row.shared_tokens.some((t) => ft.includes(t)));
  });

  const supported = crosswalk.filter((r) => r.supported_by_vision);
  const unsupportedDx = crosswalk.filter((r) => !r.supported_by_vision);

  return {
    ok: true,
    modality: report.modality || report.features?.modality || null,
    findings,
    differential_crosswalk: crosswalk,
    supported_diagnoses: supported.map((r) => r.diagnosis),
    vision_unmatched_findings: unmatched,
    differential_without_vision_support: unsupportedDx.map((r) => r.diagnosis),
    verification_status: DRAFT,
    note_he:
      'הצלבה בין ניתוח Medical Vision לבין האבחנה המבדלת של המערכת. ' +
      'אינה אבחנה ואינה מחליפה קריאה קלינית. ממצאים ללא חפיזה נשמרים כלא-מעוגנים לאבחנה.',
  };
}
