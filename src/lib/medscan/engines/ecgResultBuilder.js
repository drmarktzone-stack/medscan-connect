/**
 * ============================================================================
 *  MedScan AI — ECG Result Builder (PURE, no I/O, fully unit-testable)
 * ============================================================================
 *  Given a deterministic `reading` (from runEcgMicroReading) + the KB cases,
 *  assemble the exact result object the ECG UI renders. No network, no LLM,
 *  no base44 import — so it runs in a plain node test and its correctness is
 *  proven before anything reaches a user.
 * ============================================================================
 */

import { finalizeLocale } from "../i18n/localize.js";

const isNum = (x) => typeof x === "number" && isFinite(x);
const tok = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2);
const STOP = new Set(["the", "and", "ecg", "ekg", "pattern", "syndrome", "with", "due", "acute", "type", "wave", "waves", "block", "old", "new", "left", "right"]);

export function qtcStatusFrom(qtc, sex) {
  if (!isNum(qtc)) return null;
  const female = /female|נקבה|אישה|^f/i.test(sex || "");
  const upper = female ? 460 : 450;
  if (qtc < 340) return "Short";
  if (qtc > upper) return "Prolonged";
  if (qtc >= 430) return "Borderline";
  return "Normal";
}

export function measuredBlockText(measured) {
  if (!measured || measured.measurable === false) {
    return 'מדידות דטרמיניסטיות: לא ניתן למדוד (כיול/נקודות-ציון לא זוהו בביטחון). אין להסתמך על ערכי-זמן מהתמונה.';
  }
  const iv = measured.intervals || {}, r = measured.rate || {}, q = measured.qtc || {}, ax = measured.axis || {};
  const parts = [];
  if (isNum(r.hr_bpm)) parts.push(`HR=${r.hr_bpm} bpm`);
  if (isNum(iv.pr_ms)) parts.push(`PR=${iv.pr_ms} ms`);
  if (isNum(iv.qrs_ms)) parts.push(`QRS=${iv.qrs_ms} ms`);
  if (isNum(iv.qt_ms)) parts.push(`QT=${iv.qt_ms} ms`);
  if (isNum(q.bazett)) parts.push(`QTc(Bazett)=${q.bazett} ms`);
  if (isNum(ax.degrees)) parts.push(`ציר=${ax.degrees}° (${ax.label_he || ""})`);
  return `מדידות שחושבו בקוד: ${parts.join(" | ") || "—"}.`;
}

/** Tokens describing a pathology candidate (for finding a KB reference image). */
function candTokens(c) {
  return [...tok(c.name_en), ...tok(c.name_he), ...tok(c.category), ...tok(c.territory)].filter((w) => !STOP.has(w));
}

/**
 * Explicit pathology-key → substrings appearing in the matching KB case's
 * English diagnosis/title. Makes the "compare against the knowledge base"
 * reference image attach to the RIGHT example reliably.
 */
const KB_HINTS = {
  sinus_tachycardia: ["sinus tachycardia"],
  sinus_bradycardia: ["sinus bradycardia"],
  atrial_fibrillation: ["atrial fibrillation"],
  first_degree_av_block: ["av block 1", "first-degree", "first degree av"],
  lbbb: ["lbbb", "left bundle"],
  rbbb: ["rbbb", "right bundle"],
  preexcitation_short_pr: ["wpw", "pre-excit"],
  wpw_preexcitation: ["wpw", "pre-excit"],
  long_qt: ["long qt"],
  short_qt: ["short qt"],
  stemi: ["myocardial infarction", "stemi"],
  stemi_in_lbbb_sgarbossa: ["sgarbossa", "lbbb"],
  pericarditis_pattern: ["pericarditis"],
  ischemia_st_depression: ["nstemi", "ischemi", "posterior"],
  t_inversion: ["t-wave inversion", "wellens", "juvenile"],
  pathological_q: ["old", "infarction", "q-wave"],
  hyperkalemia: ["hyperkalemia"],
  hypokalemia: ["hypokalemia"],
  hypothermia_osborn: ["hypothermia", "osborn"],
  low_voltage_effusion: ["effusion", "low voltage", "tamponade", "amyloid"],
};
const TERRITORY_WORD = { inferior: "inferior", anteroseptal: "anterior", anterior: "anterior", lateral: "lateral", high_lateral: "lateral" };

/** Pick the best KB reference case for a candidate using explicit hints, then token overlap. */
function pickKbCase(c, cases) {
  const hints = [...(KB_HINTS[c.key] || [])];
  if (c.territory && TERRITORY_WORD[c.territory]) hints.push(TERRITORY_WORD[c.territory]);
  let best = null;
  if (hints.length) {
    for (const cs of cases || []) {
      const text = `${cs.diagnosis || ""} ${cs.title || ""}`.toLowerCase();
      const score = hints.reduce((n, h) => n + (text.includes(h) ? 1 : 0), 0);
      if (score >= 1 && (!best || score > best.score)) best = { cs, score };
    }
  }
  if (best) return best.cs;
  // fallback: ≥2 token overlap
  const ct = new Set(candTokens(c));
  let fb = null;
  for (const cs of cases || []) {
    const dset = [...tok(cs.diagnosis), ...tok(cs.title)].filter((w) => !STOP.has(w));
    const overlap = dset.filter((w) => ct.has(w)).length;
    if (overlap >= 2 && (!fb || overlap > fb.overlap)) fb = { cs, overlap };
  }
  return fb ? fb.cs : null;
}

/**
 * Build the matched-cases list. CRITICAL: the displayed title/diagnosis is the
 * tool's OWN deterministic finding — NEVER a fuzzy KB case name (that bug turned
 * "HR 77, normal sinus" into the chip "Bradycardia secondary to Hypothermia").
 * A KB case only contributes a *reference image*, and only on a strong match
 * (≥2 shared tokens). No strong match → no image, but the finding is still shown.
 */
export function matchKbCases(candidates, cases) {
  const out = [];
  for (const c of candidates || []) {
    const kb = pickKbCase(c, cases);
    out.push({
      title: c.name_he,
      diagnosis: c.name_en,
      confidence: Math.round(c.score || 0),
      reasoning: `${(c.criteria || []).map((x) => `${x.ok === false ? "✗" : x.ok === null ? "?" : "✓"} ${x.text}`).join(" · ")}${c.note_he ? " — " + c.note_he : ""}`,
      image_url: kb ? kb.image_url : undefined,
      kb_reference: kb ? kb.title : undefined,
    });
  }
  return out;
}

export function mapSeverity(pathologyMatch) {
  const max = pathologyMatch?.maxSeverity || "normal";
  if (max === "red") return { severity: "urgent", urgency: "Emergency" };
  if (max === "yellow") return { severity: "moderate", urgency: "Normal" };
  return { severity: "normal", urgency: "Normal" };
}

/** ECG_STRUCTURED_SCHEMA-shaped object for the ECGInterpretationCard. */
export function buildStructured(reading, { sex, urgency }) {
  const m = reading.measured || {};
  const iv = m.intervals || {}, rate = m.rate || {}, qtc = m.qtc || {}, axis = m.axis || {};
  const interp = reading.interpretation || {};
  const obs = reading.perception?.morphology || {};
  const cal = reading.perception?.calibration || {};
  const rhythmObs = reading.perception?.rhythm || {};

  const st_deviations = [];
  for (const e of obs.st_elevation_leads || []) if (e?.lead) st_deviations.push({ lead: e.lead, mm: e.mm, direction: "elevation" });
  for (const e of obs.st_depression_leads || []) if (e?.lead) st_deviations.push({ lead: e.lead, mm: e.mm, direction: "depression" });

  const cand = reading.pathologyMatch?.candidates || [];
  const critical_rule_out = cand
    .filter((c) => c.severity === "red")
    .map((c) => ({ pattern_key: c.key, status: "met", evidence: (c.criteria || []).map((x) => x.text).join("; ") }));

  return {
    structured: {
      is_ecg: true,
      interpretable: m.measurable !== false,
      technical_check: {
        quality: reading.perception?.quality?.interpretable === false ? "Poor" : "Good",
        speed_mm_s: cal.paper_speed_mm_s ?? 25,
        calibration_mm_mv: cal.gain_mm_mv ?? 10,
        artifacts: (reading.perception?.quality?.issues_he || []).join(", ") || "ללא",
      },
      rhythm_and_rate: {
        heart_rate_bpm: rate.hr_bpm,
        rhythm_type: interp.rhythm?.rhythm_he || "—",
        regularity: rhythmObs.regular === false ? "Irregular" : "Regular",
        p_wave_present: rhythmObs.p_before_each_qrs !== false,
      },
      axis: { degrees: axis.degrees, interpretation: axis.label_he || "" },
      intervals: {
        pr_ms: iv.pr_ms, qrs_ms: iv.qrs_ms, qt_ms: iv.qt_ms,
        qtc_bazett_ms: qtc.bazett, qtc_fridericia_ms: qtc.fridericia,
        qtc_status: qtcStatusFrom(qtc.bazett, sex),
      },
      st_deviations,
      wave_and_segment_morphology: {
        st_segment: st_deviations.length ? st_deviations.map((d) => `${d.lead} ${d.direction} ${d.mm ?? "?"}mm`).join(", ") : "ללא סטייה משמעותית",
        t_waves: (obs.t_inversion_leads || []).length ? `היפוך ב-${(obs.t_inversion_leads || []).join(", ")}` : (obs.peaked_t_leads || []).length ? `מחודדים ב-${obs.peaked_t_leads.join(", ")}` : "תקינים",
        q_waves: (obs.pathological_q_leads || []).length ? `Q פתולוגי ב-${(obs.pathological_q_leads || []).join(", ")}` : "ללא Q פתולוגי",
      },
      primary_findings: cand.map((c) => c.name_he),
      clinical_urgency: urgency,
      critical_rule_out,
      confidence: m.measurable === false ? 40 : 85,
      reasoning: interp.summary_he || "",
    },
    confidence: m.measurable === false ? 40 : 85,
    warnings: [...(interp.interval_warnings || [])],
    uncertaintyLevel: m.measurable === false ? "high" : null,
  };
}

export function buildAnalysisMd(reading, kbMatches) {
  const m = reading.measured || {};
  const interp = reading.interpretation || {};
  const cand = reading.pathologyMatch?.candidates || [];
  const lines = [];
  lines.push(`## מדידות (מחושבות בקוד)`);
  lines.push(measuredBlockText(m));
  lines.push("");
  lines.push(`## יסודות`);
  if (interp.rhythm?.rhythm_he) lines.push(`- **קצב:** ${interp.rhythm.rhythm_he}`);
  if (interp.conduction?.he) lines.push(`- **הולכה:** ${interp.conduction.he}${interp.conduction.discordance_expected ? " (discordance צפוי — הערך לפי Sgarbossa)" : ""}`);
  if (m.axis?.label_he) lines.push(`- **ציר:** ${m.axis.degrees ?? "?"}° (${m.axis.label_he})`);
  (interp.interval_warnings || []).forEach((w) => lines.push(`- ⚠ ${w}`));
  lines.push("");
  lines.push(`## דפוסים שקריטריוניהם התקיימו (מנוע דטרמיניסטי)`);
  if (cand.length === 0) {
    lines.push(`המדידות בגבולות הנורמה ואף קריטריון פתולוגי מגדיר לא התקיים → **בגבולות הנורמה / ללא ממצא חד-משמעי**.`);
  } else {
    cand.slice(0, 8).forEach((c) => {
      const crit = (c.criteria || []).map((x) => `${x.ok === false ? "✗" : x.ok === null ? "?" : "✓"} ${x.text}`).join("; ");
      lines.push(`- **${c.name_he}** [${c.severity}] — ${crit}. ${c.note_he}`);
    });
  }
  lines.push("");
  if (kbMatches.length > 0) {
    lines.push(`## השוואה למאגר הידע`);
    kbMatches.slice(0, 5).forEach((k) => lines.push(`- **${k.title}** (${k.diagnosis}) — ביטחון ${k.confidence}%`));
    lines.push("");
  }
  lines.push(`> כלי תמיכה בהחלטות קליניות — אינו אבחנה סופית ואינו תחליף לשיקול דעת רפואי.`);
  return lines.join("\n");
}

export function clampFindings(rawFindings) {
  return (Array.isArray(rawFindings) ? rawFindings : [])
    .map((f) => {
      const x = Math.max(0, Math.min(100, Number(f.x) || 0));
      const y = Math.max(0, Math.min(100, Number(f.y) || 0));
      const width = Math.max(0, Math.min(100 - x, Number(f.width) || 0));
      const height = Math.max(0, Math.min(100 - y, Number(f.height) || 0));
      return { label: String(f.label || "ממצא"), x, y, width, height };
    })
    .filter((f) => f.width > 0 && f.height > 0);
}

export function measurementsList(measured) {
  const out = [];
  const iv = measured?.intervals || {}, rate = measured?.rate || {}, qtc = measured?.qtc || {};
  if (isNum(rate.hr_bpm)) out.push({ parameter: "HR", value: `${rate.hr_bpm} bpm` });
  if (isNum(iv.pr_ms)) out.push({ parameter: "PR", value: `${iv.pr_ms} ms` });
  if (isNum(iv.qrs_ms)) out.push({ parameter: "QRS", value: `${iv.qrs_ms} ms` });
  if (isNum(iv.qt_ms)) out.push({ parameter: "QT", value: `${iv.qt_ms} ms` });
  if (isNum(qtc.bazett)) out.push({ parameter: "QTc(Bazett)", value: `${qtc.bazett} ms` });
  return out;
}

/**
 * Assemble the full UI result from a reading + KB cases. Pure (no persistence).
 */
export function assembleEcgResult(reading, allCases, { sex, fileUrl, locale = "he" } = {}) {
  const pathologyMatch = reading.pathologyMatch || { candidates: [], maxSeverity: "normal", mustNotMiss: [] };
  const kbMatches = matchKbCases(pathologyMatch.candidates, allCases);
  const { severity, urgency } = mapSeverity(pathologyMatch);
  const structuredInterpretation = buildStructured(reading, { sex, urgency });

  const top = pathologyMatch.candidates[0];
  let summary;
  if (top) {
    summary = `${top.name_he}${top.territory ? " — " + top.territory : ""}`;
  } else {
    // Normal read — give an informative, confident headline (not just "within normal limits").
    const hr = reading.measured?.rate?.hr_bpm;
    const rhythm = reading.interpretation?.rhythm?.rhythm_he || "קצב סינוס";
    summary = `${rhythm}${isNum(hr) ? ` · HR ${hr}` : ""} · ללא ממצא פתולוגי מגדיר`;
  };

  const guideline = (pathologyMatch.mustNotMiss[0]?.note_he)
    || top?.note_he
    || "אין ממצא מגדיר; המשך מעקב קליני לפי ההקשר.";

  let uncertainty = null;
  if (reading.measured?.measurable === false) {
    uncertainty = { level: "high", reason: "לא ניתן היה לכייל/למדוד את הרשת בביטחון — הערכים אינדיקטיביים בלבד; חזור על תרשים באיכות טובה יותר." };
  }

  return finalizeLocale({
    summary,
    severity,
    analysis: buildAnalysisMd(reading, kbMatches),
    matchedCases: kbMatches,
    imageUrl: fileUrl,
    findings: clampFindings(reading.perception?.findings),
    uncertainty,
    guideline,
    measurements: measurementsList(reading.measured),
    ecgInterpretation: structuredInterpretation,
    structuredInterpretation,
    microReading: reading,
    numericIntegrity: null,
  }, locale);
}
