/**
 * ============================================================================
 *  ECG Comparison — "new vs old" change detection
 * ============================================================================
 *  Compares a new ECG against one or more prior ECGs of the same patient to
 *  surface CHANGE — the clinically decisive signal (new ST elevation, new LBBB,
 *  new Q waves, new arrhythmia, QTc prolongation on a new drug, resolution of
 *  a prior finding).
 *
 *  Two layers, same philosophy as the engine:
 *   1. DETERMINISTIC delta — interval/rhythm/axis changes and, above all, the
 *      new-vs-resolved life-threatening patterns, computed in code from the
 *      stored structured readings. These are ground truth, not model opinion.
 *   2. LLM significance pass — looks at the images side by side + the structured
 *      summaries + the deterministic delta, and judges clinical significance.
 *      It may only claim a change supported by the data/images; when a prior
 *      has no structured reading it must say the comparison is limited.
 * ============================================================================
 */

import { DIAGNOSIS_MODEL } from "./aiConfig";
import { CRITICAL_RULE_OUT } from "./ecgEngine";

const langNames = { he: "Hebrew", en: "English", ar: "Arabic" };
const CRIT_LABEL = Object.fromEntries(CRITICAL_RULE_OUT.map((c) => [c.key, c.label]));
const isNum = (x) => typeof x === "number" && isFinite(x);

/** Significance thresholds for interval changes (ms). */
const INTERVAL_RULES = [
  { key: "pr_ms", label: "PR", sig: 40, note: "שינוי בהולכה עלייתי-חדרית" },
  { key: "qrs_ms", label: "QRS", sig: 20, note: "שינוי במשך QRS — שקול חסם צרור חדש" },
  { key: "qt_ms", label: "QT", sig: 40, note: "שינוי במשך QT" },
  { key: "qtc_bazett_ms", label: "QTc(Bazett)", sig: 30, note: "שינוי ב-QTc — סיכון להפרעות קצב" },
];

function criticalMap(structured) {
  const out = {};
  for (const it of structured?.critical_rule_out || []) {
    if (it?.pattern_key) out[it.pattern_key] = it.status;
  }
  return out;
}

/**
 * Deterministic delta between a new and a prior structured reading.
 * @returns {{changes:Array, newCritical:string[], resolvedCritical:string[], significantCount:number, comparable:boolean}}
 */
export function deterministicEcgDelta(newStructured, oldStructured) {
  const nn = newStructured || {};
  const oo = oldStructured || {};
  const comparable = !!(nn.intervals || nn.rhythm_and_rate) && !!(oo.intervals || oo.rhythm_and_rate);
  const changes = [];

  const niv = nn.intervals || {}, oiv = oo.intervals || {};
  for (const r of INTERVAL_RULES) {
    const a = oiv[r.key], b = niv[r.key];
    if (isNum(a) && isNum(b)) {
      const delta = Math.round(b - a);
      if (Math.abs(delta) >= r.sig) {
        changes.push({
          category: "interval", param: r.label, from: a, to: b, delta,
          significance: "significant",
          note_he: `${r.label}: ${a}→${b}ms (${delta > 0 ? "+" : ""}${delta}) — ${r.note}.`,
        });
      }
    }
  }

  // Heart rate (large change noted, not necessarily pathologic)
  const nhr = nn.rhythm_and_rate?.heart_rate_bpm, ohr = oo.rhythm_and_rate?.heart_rate_bpm;
  if (isNum(nhr) && isNum(ohr) && Math.abs(nhr - ohr) >= 25) {
    changes.push({ category: "rate", param: "HR", from: ohr, to: nhr, delta: Math.round(nhr - ohr),
      significance: "minor", note_he: `דופק: ${ohr}→${nhr} bpm.` });
  }

  // Rhythm type change
  const nrt = (nn.rhythm_and_rate?.rhythm_type || "").trim();
  const ort = (oo.rhythm_and_rate?.rhythm_type || "").trim();
  if (nrt && ort && nrt.toLowerCase() !== ort.toLowerCase()) {
    changes.push({ category: "rhythm", param: "קצב", from: ort, to: nrt, significance: "significant",
      note_he: `שינוי קצב: ${ort} → ${nrt}.` });
  }

  // Axis category change
  const nax = (nn.axis?.interpretation || nn.axis?.interpretation_calculated || "").trim();
  const oax = (oo.axis?.interpretation || oo.axis?.interpretation_calculated || "").trim();
  if (nax && oax && nax.toLowerCase() !== oax.toLowerCase()) {
    changes.push({ category: "axis", param: "ציר", from: oax, to: nax, significance: "significant",
      note_he: `שינוי ציר: ${oax} → ${nax}.` });
  }

  // Critical rule-out: new vs resolved life-threatening patterns
  const nm = criticalMap(nn), om = criticalMap(oo);
  const newCritical = [];
  const resolvedCritical = [];
  for (const key of Object.keys(nm)) {
    if (nm[key] === "met" && om[key] !== "met") newCritical.push(CRIT_LABEL[key] || key);
  }
  for (const key of Object.keys(om)) {
    if (om[key] === "met" && nm[key] !== "met") resolvedCritical.push(CRIT_LABEL[key] || key);
  }

  const significantCount =
    changes.filter((c) => c.significance === "significant").length + newCritical.length;

  return { changes, newCritical, resolvedCritical, significantCount, comparable };
}

/* ==========================================================================
 *  LLM significance pass
 * ========================================================================== */

export const ECG_COMPARE_SCHEMA = {
  type: "object",
  properties: {
    comparison_possible: { type: "boolean", description: "האם ניתן להשוות בוודאות (תמונות/נתונים מספקים)" },
    overall_verdict: {
      type: "string",
      enum: ["no_significant_change", "new_significant_changes", "improvement_resolution", "mixed", "uninterpretable"],
    },
    verdict_he: { type: "string", description: "פסק-דין תמציתי במשפט" },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", description: "rhythm / ST / T / Q / conduction / interval / axis / other" },
          from_he: { type: "string" },
          to_he: { type: "string" },
          significance: { type: "string", enum: ["minor", "significant", "critical"] },
          description_he: { type: "string" },
        },
        required: ["description_he", "significance"],
      },
    },
    new_dangerous_findings: { type: "array", items: { type: "string" }, description: "ממצאים מסוכנים חדשים שלא היו קודם" },
    resolved_findings: { type: "array", items: { type: "string" }, description: "ממצאים שהיו וכבר לא" },
    clinical_significance_he: { type: "string" },
    urgency: { type: "string", enum: ["Normal", "Urgent", "Emergency"] },
    recommended_next_steps_he: { type: "array", items: { type: "string" } },
    disclaimer_he: { type: "string" },
  },
  required: ["overall_verdict", "verdict_he", "urgency", "disclaimer_he"],
};

function summarizeReading(s) {
  if (!s) return "(אין נתונים מובנים לתרשים זה — השווה מהתמונה בלבד)";
  const iv = s.intervals || {}, rr = s.rhythm_and_rate || {}, m = s.wave_and_segment_morphology || {};
  const crit = (s.critical_rule_out || []).filter((x) => x.status === "met").map((x) => CRIT_LABEL[x.pattern_key] || x.pattern_key);
  return [
    `קצב ${rr.heart_rate_bpm ?? "?"}bpm ${rr.rhythm_type || ""}`,
    `PR ${iv.pr_ms ?? "?"} QRS ${iv.qrs_ms ?? "?"} QT ${iv.qt_ms ?? "?"} QTc ${iv.qtc_bazett_ms ?? "?"}`,
    `ציר ${s.axis?.interpretation || "?"}`,
    `ST: ${m.st_segment || "—"} | T: ${m.t_waves || "—"} | Q: ${m.q_waves || "—"}`,
    `ממצאים: ${(s.primary_findings || []).join("; ") || "—"}`,
    crit.length ? `דפוסים קטלניים: ${crit.join(", ")}` : "",
  ].filter(Boolean).join(" | ");
}

/**
 * Run the full ECG comparison.
 * @param {Object} opts
 * @param {{structured, image_url, label}} opts.newItem
 * @param {Array<{structured, image_url, label, result}>} opts.priorItems  most-recent first
 * @param {Function} opts.invokeLLM
 * @param {string} opts.language
 */
export async function runEcgComparison({ newItem, priorItems, invokeLLM, language = "he", model = DIAGNOSIS_MODEL }) {
  const outputLang = langNames[language] || "Hebrew";
  const priors = priorItems || [];
  const primary = priors[0];

  // Deterministic delta vs the most-recent prior.
  const delta = primary ? deterministicEcgDelta(newItem.structured, primary.structured) : null;

  const deltaText = delta
    ? [
        delta.changes.length ? delta.changes.map((c) => `- ${c.note_he}`).join("\n") : "- לא זוהו שינויי מרווח/קצב/ציר מובהקים.",
        delta.newCritical.length ? `- ⚠️ דפוסים מסכני-חיים חדשים: ${delta.newCritical.join(", ")}` : "",
        delta.resolvedCritical.length ? `- דפוסים שנעלמו: ${delta.resolvedCritical.join(", ")}` : "",
        delta.comparable ? "" : "- (לתרשים הקודם אין נתונים מובנים — הדלתא הדטרמיניסטי חלקי)",
      ].filter(Boolean).join("\n")
    : "(אין תרשים קודם להשוואה)";

  const priorsBlock = priors
    .map((p, i) => `### תרשים קודם ${i + 1} (${p.label || ""})\n${summarizeReading(p.structured)}`)
    .join("\n\n");

  const prompt = `אתה קרדיולוג בכיר. משימתך: **להשוות** תרשים ECG חדש מול תרשים/ים קודמים של אותו מטופל ולזהות **שינוי** — זהו האות הקליני המכריע (ST חדש, LBBB/RBBB חדש, גלי Q חדשים, הפרעת קצב חדשה, התארכות QTc, פסאודו-נורמליזציה, או היעלמות ממצא).

## התמונות
תמונה 1 = התרשים החדש. תמונות 2+ = התרשימים הקודמים (לפי הסדר, מהחדש לישן).

## התרשים החדש (נתונים מובנים)
${summarizeReading(newItem.structured)}

## התרשימים הקודמים
${priorsBlock || "(ללא)"}

## דלתא דטרמיניסטי שכבר חושב בקוד (התייחס אליו כאמת — אל תסתור אותו)
${deltaText}

## חוקי-ברזל
1. השווה מול התמונות בפועל — טען שינוי רק אם הוא נתמך בתמונות/בנתונים. אל תמציא שינוי.
2. אם לתרשים קודם אין נתונים מובנים או שהתמונה אינה ברורה — ציין שההשוואה מוגבלת (comparison_possible=false) ואל תכריע נחרצות.
3. שינוי מסוכן חדש (למשל ST elevation חדש, LBBB חדש, QTc שקפץ) → urgency גבוה והבלטה ב-new_dangerous_findings.
4. אבחנה סופית אינה תפקידך — אתה מזהה שינוי ומשמעותו לתמיכה בהחלטה.

החזר JSON לפי הסכמה. טקסט ב-${outputLang}. סיים ב-disclaimer_he:
"MedScan הוא כלי תמיכה בהחלטות בלבד. השוואת ECG אינה תחליף לשיקול דעת רפואי ולהשוואה ידנית ע\"י רופא/ה."`;

  const fileUrls = [newItem.image_url, ...priors.map((p) => p.image_url)].filter(Boolean);

  let llm = null;
  try {
    llm = await invokeLLM({
      prompt,
      file_urls: fileUrls,
      response_json_schema: ECG_COMPARE_SCHEMA,
      add_context_from_internet: false,
      model,
    });
  } catch (e) {
    llm = null;
  }

  // Safety-net urgency: a new deterministic killer forces at least Urgent/Emergency.
  const rank = { Normal: 0, Urgent: 1, Emergency: 2 };
  let urgency = llm?.urgency || "Normal";
  if (delta && delta.newCritical.length && rank[urgency] < rank.Emergency) {
    urgency = "Emergency";
  }

  return {
    deterministic: delta,
    llm,
    urgency,
    newImage: newItem.image_url,
    priorImages: priors.map((p) => p.image_url),
  };
}
