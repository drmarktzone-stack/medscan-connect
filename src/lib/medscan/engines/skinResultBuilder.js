/**
 * ============================================================================
 *  MedScan AI — Skin Result Builder (PURE, no I/O, unit-testable)
 * ============================================================================
 *  Assembles the UI result from a runSkinEngine result + KB cases. The engine
 *  already did the systematic morphology read + deterministic dermoscopy scoring
 *  (7-point/ABCD/chaos) + allergen mapping; here we only shape + compare-to-KB.
 * ============================================================================
 */

import { finalizeLocale } from "../i18n/localize.js";

const isNum = (x) => typeof x === "number" && isFinite(x);
const tok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 3);
const STOP = new Set(["with", "and", "the", "acute", "chronic", "skin", "lesion", "rash", "disease", "syndrome", "pediatric"]);
const LIKELIHOOD_CONF = { high: 85, moderate: 60, low: 40 };
const likelihoodToConf = (l) => LIKELIHOOD_CONF[String(l || "").toLowerCase()] ?? 50;

export function matchSkinKb(text, cases) {
  const ctArr = tok(text).filter((w) => !STOP.has(w));
  const ct = new Set(ctArr);
  if (ct.size === 0) return null;
  const needed = ctArr.length <= 2 ? 1 : 2;
  let best = null;
  for (const cs of cases || []) {
    const dset = [...tok(cs.diagnosis), ...tok(cs.title)].filter((w) => !STOP.has(w));
    const overlap = dset.filter((w) => ct.has(w)).length;
    if (overlap >= needed && (!best || overlap > best.overlap)) best = { cs, overlap };
  }
  return best ? best.cs : null;
}

export function mapSkinSeverity(engineResult) {
  const st = engineResult?.structured || {};
  const urg = st.clinical_urgency;
  if (urg === "Emergency") return { severity: "urgent", urgency: "Emergency" };
  if (urg === "Urgent") return { severity: "severe", urgency: "Urgent" };
  const risk = engineResult?.dermoscopy?.risk?.level;
  const flags = (st.critical_red_flags || []).filter(Boolean);
  if (risk === "high") return { severity: "severe", urgency: "Urgent" };
  if (flags.length || risk === "moderate") return { severity: "moderate", urgency: "Normal" };
  if ((st.differential_diagnoses || []).length) return { severity: "mild", urgency: "Normal" };
  return { severity: "normal", urgency: "Normal" };
}

export function buildSkinMatches(st, cases) {
  const dds = (st?.differential_diagnoses || []).filter((d) => d && d.diagnosis);
  return dds.slice(0, 5).map((d) => {
    const kb = matchSkinKb(d.diagnosis, cases);
    return {
      title: d.diagnosis,
      diagnosis: d.diagnosis,
      confidence: likelihoodToConf(d.likelihood),
      reasoning: [d.supporting_features, d.refuting_features ? `(שולל: ${d.refuting_features})` : ""].filter(Boolean).join(" "),
      image_url: kb && kb.image_url ? kb.image_url : undefined,
      kb_reference: kb ? kb.title : undefined,
    };
  });
}

export function buildSkinAnalysisMd(engineResult, matches) {
  const st = engineResult?.structured || {};
  const d = st.dermatological_descriptors || {};
  const dermo = engineResult?.dermoscopy;
  const allergens = engineResult?.suspected_allergens || [];
  const lines = [];

  lines.push(`## תיאור מורפולוגי`);
  lines.push(`- **נגעים ראשוניים:** ${(d.primary_lesions || []).join(", ") || "—"} | **משניים:** ${(d.secondary_lesions || []).join(", ") || "—"}`);
  lines.push(`- **תצורה/פיזור:** ${d.configuration || "—"} / ${d.distribution_pattern || "—"}${d.color_and_border ? ` | **צבע/גבול:** ${d.color_and_border}` : ""}`);
  lines.push("");

  if (dermo && dermo.risk) {
    lines.push(`## ניקוד דרמוסקופי (מחושב בקוד)`);
    lines.push(`- **רמת סיכון:** ${dermo.risk.level}${dermo.risk.reasons?.length ? ` — ${dermo.risk.reasons.join(", ")}` : ""}`);
    if (dermo.risk.referral_he) lines.push(`- ${dermo.risk.referral_he}`);
    lines.push("");
  }

  const morph = engineResult?.morphology;
  if (morph?.ok) {
    lines.push(`## מאפיינים מורפולוגיים (מדידה דטרמיניסטית)`);
    lines.push(`- **גבולות (compactness):** ${morph.borders?.compactness ?? "—"}`);
    lines.push(`- **צבע (אשכולות):** ${morph.color?.cluster_count ?? "—"}`);
    lines.push(`- **פיזור בשדה:** ${morph.distribution?.pattern_he ?? "—"}`);
    lines.push(`- **רכיבים לווייניים:** ${morph.satellite_lesions?.count ?? 0}`);
    if (morph.note_he) lines.push(`- ${morph.note_he}`);
    lines.push("");
  }

  lines.push(`## אבחנה מבדלת`);
  if (matches.length === 0) {
    lines.push(`לא זוהתה אבחנה מבדלת חד-משמעית — נדרש מתאם קליני.`);
  } else {
    matches.forEach((m) => lines.push(`- **${m.title}** — ביטחון ${m.confidence}%${m.reasoning ? `: ${m.reasoning}` : ""}${m.kb_reference ? ` (דומה במאגר: ${m.kb_reference})` : ""}`));
  }
  lines.push("");

  const flags = (st.critical_red_flags || []).filter(Boolean);
  if (flags.length) {
    lines.push(`## 🚩 דגלים אדומים`);
    flags.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  }

  if (allergens.length) {
    lines.push(`## אלרגנים אפשריים לפי פיזור`);
    lines.push(allergens.map((a) => (typeof a === "string" ? a : a.allergen || a.name || "")).filter(Boolean).join(", "));
    lines.push("");
  }

  const steps = (st.recommended_next_steps || []).filter(Boolean);
  if (steps.length) {
    lines.push(`## המלצות המשך`);
    steps.forEach((s) => lines.push(`- ${s}`));
    lines.push("");
  }

  (engineResult?.warnings || []).forEach((w) => lines.push(`> ⚠ ${w}`));
  lines.push(`> כלי תמיכה בהחלטות קליניות — אינו אבחנה סופית ואינו תחליף לבדיקת רופא/ה.`);
  return lines.join("\n");
}

const UNCERTAINTY_REASON = {
  high: "הראיה אינה חד-משמעית / בקרה נגדית העלתה ספק — מומלץ הערכת רופא/ת עור.",
  medium: "אבחנות מתחרות עם ביטחון דומה — מומלץ בירור/מעקב.",
};

export function assembleSkinResult(engineResult, allCases, { fileUrl, locale = "he" } = {}) {
  const st = engineResult?.structured || {};
  const { severity, urgency } = mapSkinSeverity(engineResult);
  const matches = buildSkinMatches(st, allCases);

  const summary = st.primary_impression
    || (matches[0] ? matches[0].diagnosis : "ללא ממצא חד-משמעי — נדרש מתאם קליני");

  const guideline = (st.recommended_next_steps || [])[0]
    || (urgency === "Emergency" ? "ממצא דחוף — הפניה מיידית." : "מעקב/הפניה לרופא/ת עור לפי ההקשר.");

  let uncertainty = null;
  if (engineResult?.uncertaintyLevel) {
    uncertainty = { level: engineResult.uncertaintyLevel, reason: UNCERTAINTY_REASON[engineResult.uncertaintyLevel] || UNCERTAINTY_REASON.medium };
  }

  return finalizeLocale({
    summary,
    severity,
    analysis: buildSkinAnalysisMd(engineResult, matches),
    matchedCases: matches,
    imageUrl: fileUrl,
    findings: [],
    uncertainty,
    guideline,
    measurements: [],
    ecgInterpretation: null,
    structuredInterpretation: engineResult,
    numericIntegrity: null,
  }, locale);
}
