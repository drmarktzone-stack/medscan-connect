/**
 * ============================================================================
 *  MedScan AI — Radiology Result Builder (PURE, no I/O, unit-testable)
 * ============================================================================
 *  Assembles the UI result from a runRadiologyEngine result + KB cases.
 *  No network / no LLM / no base44 import. The engine already did the
 *  systematic vision read + deterministic measurement evaluation + critical
 *  rule-out; here we only shape + compare-to-KB in code.
 * ============================================================================
 */

import { finalizeLocale } from "../i18n/localize.js";

const isNum = (x) => typeof x === "number" && isFinite(x);
const tok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3);
const STOP = new Set(["with", "and", "the", "acute", "chronic", "left", "right", "wall", "syndrome", "disease", "pediatric", "bilateral"]);

const LIKELIHOOD_CONF = { high: 85, moderate: 60, low: 40 };
function likelihoodToConf(l) {
  return LIKELIHOOD_CONF[String(l || "").toLowerCase()] ?? 50;
}

/** Best KB case for a diagnosis string (token overlap ≥2 on the English diagnosis/title). */
export function matchRadiologyKb(text, cases) {
  const ctArr = tok(text).filter((w) => !STOP.has(w));
  const ct = new Set(ctArr);
  if (ct.size === 0) return null;
  // Radiology diagnoses are often a single specific term ("Pneumothorax",
  // "Appendicitis"). Scale the required overlap with query specificity: a short
  // 1–2-word diagnosis needs 1 strong shared term; longer queries need ≥2.
  const needed = ctArr.length <= 2 ? 1 : 2;
  let best = null;
  for (const cs of cases || []) {
    const dset = [...tok(cs.diagnosis), ...tok(cs.title)].filter((w) => !STOP.has(w));
    const overlap = dset.filter((w) => ct.has(w)).length;
    if (overlap >= needed && (!best || overlap > best.overlap)) best = { cs, overlap };
  }
  return best ? best.cs : null;
}

/** Map engine urgency + abnormalities → the UI's 5-level severity. */
export function mapRadiologySeverity(st) {
  const urg = st?.clinical_urgency;
  if (urg === "Emergency") return { severity: "urgent", urgency: "Emergency" };
  if (urg === "Urgent") return { severity: "severe", urgency: "Urgent" };
  const abn = (st?.key_abnormalities || []).filter((a) => a && a.finding);
  if (abn.length === 0) return { severity: "normal", urgency: "Normal" };
  const anySevere = abn.some((a) => /severe|חמור/i.test(a.severity || ""));
  return { severity: anySevere ? "moderate" : "mild", urgency: "Normal" };
}

export function clampRegions(regions) {
  return (Array.isArray(regions) ? regions : [])
    .map((f) => {
      const x = Math.max(0, Math.min(100, Number(f.x) || 0));
      const y = Math.max(0, Math.min(100, Number(f.y) || 0));
      const width = Math.max(0, Math.min(100 - x, Number(f.width) || 0));
      const height = Math.max(0, Math.min(100 - y, Number(f.height) || 0));
      return { label: String(f.label || "ממצא"), x, y, width, height };
    })
    .filter((f) => f.width > 0 && f.height > 0);
}

/** KB comparison rows: one per top differential (the tool's OWN diagnosis), with a KB reference when found. */
export function buildRadiologyMatches(st, cases) {
  const dds = (st?.differential_diagnoses || []).filter((d) => d && d.diagnosis);
  const rows = [];
  if (dds.length) {
    for (const d of dds.slice(0, 5)) {
      const kb = matchRadiologyKb(d.diagnosis, cases);
      rows.push({
        title: d.diagnosis,
        diagnosis: d.diagnosis,
        confidence: likelihoodToConf(d.likelihood),
        reasoning: d.reasoning || d.rationale || "",
        image_url: kb && kb.image_url ? kb.image_url : undefined,
        kb_reference: kb ? kb.title : undefined,
      });
    }
  } else if (st?.primary_impression) {
    const kb = matchRadiologyKb(st.primary_impression, cases);
    rows.push({
      title: st.primary_impression,
      diagnosis: st.primary_impression,
      confidence: isNum(st.confidence) ? st.confidence : 60,
      reasoning: "",
      image_url: kb && kb.image_url ? kb.image_url : undefined,
      kb_reference: kb ? kb.title : undefined,
    });
  }
  return rows;
}

export function buildRadiologyAnalysisMd(engineResult, matches) {
  const st = engineResult?.structured || {};
  const md = st.image_metadata || {};
  const meas = engineResult?.measurement_eval || [];
  const lines = [];

  lines.push(`## סוג הבדיקה`);
  lines.push(`- **מודליות:** ${md.modality_detected || "—"} | **אזור:** ${md.anatomical_region || "—"} | **איכות:** ${md.technical_quality || "—"}`);
  lines.push("");

  const sys = (st.systematic_findings || []).filter((f) => f && f.anatomical_zone);
  if (sys.length) {
    lines.push(`## סריקה שיטתית`);
    sys.forEach((f) => lines.push(`- **${f.anatomical_zone}** [${f.status || "?"}]: ${f.description || ""}`));
    lines.push("");
  }

  const abn = (st.key_abnormalities || []).filter((a) => a && a.finding);
  lines.push(`## ממצאים עיקריים`);
  if (abn.length === 0) {
    lines.push(`לא זוהה ממצא חריג משמעותי בסריקה השיטתית → **בגבולות הנורמה / ללא ממצא חד-משמעי**.`);
  } else {
    abn.forEach((a) => lines.push(`- **${a.finding}** (${a.severity || "?"}) — ${a.location || ""}${a.characteristics ? ": " + a.characteristics : ""}`));
  }
  lines.push("");

  if (meas.length) {
    lines.push(`## מדידות (מול נורמות-גיל בקוד)`);
    meas.forEach((m) => {
      const v = m.verdict === "above_normal" ? "⚠ מעל הנורמה" : m.verdict === "below_normal" ? "⚠ מתחת לנורמה" : "✓ תקין";
      const rng = `${m.normal?.[0] ?? ""}–${m.normal?.[1] ?? ""}${m.unit || ""}`;
      lines.push(`- **${m.label_he}**: ${m.value}${m.unit || ""} — ${v} (תקין ${rng}${m.age_band ? ", " + m.age_band : ""})`);
    });
    lines.push("");
  }

  const morph = engineResult?.morphology;
  if (morph?.ok) {
    lines.push(`## מאפייני הדמיה (מדידה דטרמיניסטית, יחסית)`);
    lines.push(`- **צפיפויות (שבר פיקסלים):** לוסנטי ${morph.densities?.lucent_like ?? "—"} / בינוני ${morph.densities?.intermediate_like ?? "—"} / צפוף ${morph.densities?.dense_like ?? "—"}`);
    lines.push(`- **מבנה גרמי (רכיבים מחוברים):** ${morph.bone_structure?.connected_components ?? "—"}`);
    lines.push(`- **מרקם לוסנטי (טיוטת תסנין):** ${morph.pulmonary_infiltrate_texture?.elevated ? "מוגבר" : "לא מוגבר"}`);
    if (morph.note_he) lines.push(`- ${morph.note_he}`);
    lines.push("");
  }

  const flags = (st.critical_red_flags || []).filter(Boolean);
  if (flags.length) {
    lines.push(`## 🚩 דגלים אדומים`);
    flags.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  if (matches.length) {
    lines.push(`## השוואה למאגר הידע (אבחנות מבדלות)`);
    matches.slice(0, 5).forEach((m) => lines.push(`- **${m.title}** — ביטחון ${m.confidence}%${m.kb_reference ? ` (דומה במאגר: ${m.kb_reference})` : ""}`));
    lines.push("");
  }

  const steps = (st.recommended_next_steps || []).filter(Boolean);
  if (steps.length) {
    lines.push(`## המלצות המשך`);
    steps.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }

  (engineResult?.warnings || []).forEach((w) => lines.push(`> ⚠ ${w}`));
  lines.push(`> כלי תמיכה בהחלטות קליניות — אינו אבחנה סופית ואינו תחליף לשיקול דעת רדיולוגי.`);
  return lines.join("\n");
}

const UNCERTAINTY_REASON = {
  high: "הראיה אינה חד-משמעית / בקרה נגדית העלתה ספק — מומלץ מתאם קליני והערכת רדיולוג מומחה.",
  medium: "קיימת אי-ודאות בין אבחנות מתחרות — מומלץ בירור משלים.",
};

/** Assemble the full UI result. Pure (no persistence). */
export function assembleRadiologyResult(engineResult, allCases, { fileUrl, locale = "he" } = {}) {
  const st = engineResult?.structured || {};
  const { severity, urgency } = mapRadiologySeverity(st);
  const matches = buildRadiologyMatches(st, allCases);

  const abn = (st.key_abnormalities || []).filter((a) => a && a.finding);
  const summary = st.primary_impression
    || (abn[0] ? `${abn[0].finding}${abn[0].location ? " — " + abn[0].location : ""}` : `${st.image_metadata?.modality_detected || "בדיקה"} · ללא ממצא חריג משמעותי`);

  const guideline = (st.recommended_next_steps || [])[0]
    || (urgency === "Emergency" ? "ממצא דחוף — הערכה/הפניה מיידית." : "המשך מעקב קליני לפי ההקשר.");

  let uncertainty = null;
  if (engineResult?.uncertaintyLevel) {
    uncertainty = { level: engineResult.uncertaintyLevel, reason: UNCERTAINTY_REASON[engineResult.uncertaintyLevel] || UNCERTAINTY_REASON.medium };
  }

  const measurements = (engineResult?.measurement_eval || []).map((m) => ({
    parameter: m.label_he,
    value: `${m.value}${m.unit || ""}${m.verdict && m.verdict !== "normal" ? (m.verdict === "above_normal" ? " (↑)" : " (↓)") : ""}`,
  }));

  return finalizeLocale({
    summary,
    severity,
    analysis: buildRadiologyAnalysisMd(engineResult, matches),
    matchedCases: matches,
    imageUrl: fileUrl,
    findings: clampRegions(st.regions),
    uncertainty,
    guideline,
    measurements,
    ecgInterpretation: null,
    structuredInterpretation: engineResult,
    numericIntegrity: null,
  }, locale);
}
