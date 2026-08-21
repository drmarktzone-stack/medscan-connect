/**
 * ============================================================================
 *  MedScan AI — Feedback Flywheel (physician feedback → ground truth → eval)
 * ============================================================================
 *  The missing link that makes the tool improve over time. Capture (Feedback)
 *  and the evaluation set (GoldStandardCase) already exist; this connects them:
 *  every physician confirmation/correction is promoted into a labeled
 *  GoldStandardCase, which then feeds the validation harnesses. More usage →
 *  more labeled truth → measured, improving accuracy. Also solves the
 *  data-scarcity problem for validation.
 *
 *  Pure builders are unit-testable; the promoter uses the Base44 SDK.
 *  Everything enters as decision-support data for the physician-run evaluation.
 * ============================================================================
 */

import { base44 } from "@/api/base44Client";

const MALIGNANT = /melanoma|מלנומה|carcinoma|קרצינומה|malignant|ממאיר|\bscc\b|\bbcc\b|sarcoma/i;
const URGENT = /urgent|severe|emergency/i;

/**
 * Build a GoldStandardCase draft from a feedback event + its analysis. Pure.
 * @returns {object|null} gold-case fields, or null if not promotable.
 */
export function buildGoldCaseFromFeedback({ analysis, feedback } = {}) {
  const type = feedback?.analysis_type || analysis?.type;
  const image_url = analysis?.image_url || "";
  const dx = feedback?.is_correct
    ? String(analysis?.summary || analysis?.result || "").trim()
    : String(feedback?.corrected_diagnosis || "").trim();
  // image + a diagnosis label are both required for image-based evaluation.
  if (!type || !image_url || !dx) return null;
  return {
    type,
    title: `${type.toUpperCase()} — ${dx}`.slice(0, 120),
    correct_diagnosis: dx.slice(0, 300),
    category: "",
    image_url,
    description: (feedback?.notes || analysis?.summary || (feedback?.is_correct ? "אושר ע\"י רופא/ה" : "תוקן ע\"י רופא/ה")).slice(0, 1000),
    urgent: URGENT.test(String(analysis?.severity || "")),
  };
}

/**
 * Map GoldStandardCase rows to the shape the validation harnesses consume.
 * Best-effort: derives what's inferable (skin malignancy from the diagnosis
 * text); leaves fields it cannot know (e.g. exact critical patterns) empty.
 */
export function mapGoldToGroundTruth(goldCases = []) {
  return (goldCases || []).map((g, i) => {
    const base = {
      case_id: g.id || `gold_${i}`,
      image_url: g.image_url || null,
      true_diagnosis: g.correct_diagnosis || null,
      source: "gold_standard",
    };
    if (g.type === "skin") {
      return { ...base, fitzpatrick: null, malignant: MALIGNANT.test(g.correct_diagnosis || "") };
    }
    if (g.type === "ecg") {
      return { ...base, true_critical_patterns: [], true_intervals: {} };
    }
    return base; // radiology / other
  });
}

/**
 * Promote a just-submitted feedback event into a GoldStandardCase (draft).
 * Fire-and-forget from the UI: wrapped so it never blocks feedback submission.
 * Dedupes by image_url so repeated feedback on the same case doesn't pile up.
 * @returns {Promise<{promoted:boolean, reason?:string, id?:string}>}
 */
export async function promoteFeedbackToGold({ analysisId, feedback } = {}) {
  try {
    if (!analysisId || !feedback) return { promoted: false, reason: "missing_input" };
    let analysis = null;
    try {
      analysis = base44.entities.Analysis.get
        ? await base44.entities.Analysis.get(analysisId)
        : (await base44.entities.Analysis.filter({ id: analysisId }))?.[0];
    } catch {
      analysis = null;
    }
    if (!analysis) return { promoted: false, reason: "analysis_not_found" };

    const gold = buildGoldCaseFromFeedback({ analysis, feedback });
    if (!gold) return { promoted: false, reason: "not_promotable" };

    // Dedup by image_url.
    try {
      const existing = await base44.entities.GoldStandardCase.filter({ image_url: gold.image_url });
      if (existing && existing.length) return { promoted: false, reason: "already_exists" };
    } catch {
      /* filtering may be unsupported; proceed to create */
    }

    const created = await base44.entities.GoldStandardCase.create(gold);
    return { promoted: true, id: created?.id };
  } catch (e) {
    return { promoted: false, reason: String(e?.message || e) };
  }
}
