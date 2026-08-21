/**
 * ============================================================================
 *  MedScan AI — ECG FAST Pipeline (single vision pass, deterministic core)
 * ============================================================================
 *  ONE vision perception call (fast model) → pure-code interpretation
 *  (ecgResultBuilder). Replaces the old 3–4 serial Opus-vision path (~5 min).
 *
 *  Why one FAST call is enough: the model's ONLY job is perception — report
 *  pixel geometry + morphology flags. It never diagnoses and never states a
 *  millisecond. All measurements (HR/PR/QRS/QT/QTc/axis), rhythm/conduction,
 *  pathology matching (criteria-gated) and KB comparison run in code
 *  (ecgMicroMeasure → ecgFundamentals → ecgPathologies → ecgResultBuilder),
 *  which is unit-tested. Moving intelligence to code is exactly what lets us
 *  use the fast model without losing diagnostic accuracy — and keeps the whole
 *  read to roughly a single Sonnet call (well under a minute).
 * ============================================================================
 */

import { base44 } from "@/api/base44Client";
import { downscaleImageFile } from "@/lib/imageOptimize";
import { VISION_MODEL } from "@/lib/aiConfig";
import { createVisionInvokeLLM } from "@/lib/medscan/llmAdapter";
import { runEcgMicroReading } from "./ecgPerception.js";
import { assembleEcgResult } from "./ecgResultBuilder.js";

const abstainErrors = {
  he: (r) => `לא ניתן להפיק פענוח אמין: ${r} נא להעלות תמונה מתאימה, חדה וברורה.`,
  en: (r) => `Cannot produce a reliable reading: ${r} Please upload a suitable, sharp, clear image.`,
  ar: (r) => `تعذّر إنتاج قراءة موثوقة: ${r} يرجى رفع صورة مناسبة وواضحة.`,
};

/**
 * Run the fast, single-pass ECG analysis.
 * Returns the same result shape ECGAnalysis/AnalysisResult already consume.
 */
export async function runEcgFastAnalysis({
  files,
  preUploadedUrls,
  language = "he",
  patientAgeYears,
  patientSex,
  patientRef,
  onStage,
  invokeLLM,           // optional override (tests)
  model = VISION_MODEL,  // קריאת-התמונה על מודל-הראייה (Gemini) — המספרים מחושבים בקוד
}) {
  onStage?.("uploading");
  const [fileUrls, allCases] = await Promise.all([
    preUploadedUrls && preUploadedUrls.length > 0
      ? Promise.resolve(preUploadedUrls)
      : Promise.all((files || []).map(async (f) => {
          const optimized = await downscaleImageFile(f, { autoLandscape: true });
          const r = await base44.integrations.Core.UploadFile({ file: optimized });
          return r.file_url;
        })),
    base44.entities.ECGCase.list("-created_date", 1000).catch(() => []),
  ]);
  const file_url = fileUrls[0];

  // ---- THE single vision pass (perception only) ----
  onStage?.("interpreting");
  const invoke = invokeLLM || createVisionInvokeLLM({ purpose: "ecg_fast_perception" });
  const reading = await runEcgMicroReading({
    fileUrls,
    invokeLLM: invoke,
    model,
    ageYears: patientAgeYears,
    sex: patientSex,
  });

  if (reading.abstain) {
    const build = abstainErrors[language] || abstainErrors.he;
    throw new Error(build(reading.abstain_reason_he || ""));
  }

  // ---- deterministic assembly (pure, unit-tested) ----
  onStage?.("verifying");
  const result = assembleEcgResult(reading, allCases, { sex: patientSex, fileUrl: file_url, locale: language });

  // ---- persist (non-fatal; kept awaited so analysisId is ready for PDF export + feedback) ----
  // This is a fast round-trip and never the bottleneck — the single vision call is.
  try {
    const rec = await base44.entities.Analysis.create({
      type: "ecg",
      image_url: file_url,
      result: result.analysis,
      severity: result.severity,
      summary: result.summary,
      structured_json: JSON.stringify({ structured: result.structuredInterpretation.structured, pathologyMatch: reading.pathologyMatch }),
      patient_ref: patientRef || undefined,
    });
    result.analysisId = rec?.id;
  } catch { /* persistence is non-fatal */ }

  onStage?.("");
  return result;
}
