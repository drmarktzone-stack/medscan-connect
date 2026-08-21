/**
 * ============================================================================
 *  MedScan AI — Radiology FAST Pipeline (single vision pass)
 * ============================================================================
 *  ONE systematic vision read (runRadiologyEngine, fast model) → pure-code
 *  assembly (radiologyResultBuilder). Replaces the old multi-call pipeline
 *  (Stage-1 KB match + Stage-1.5 engine + Stage-2 diagnosis + grounded pass).
 *
 *  The engine already encodes the fundamentals — modality physics, ABCDE search
 *  patterns, per-finding characterization, deterministic measurement evaluation
 *  vs age norms, and the critical rule-out. Running it ONCE and assembling in
 *  code gives the systematic read the user asked for, fast, and keeps the shown
 *  result identical to what the engine actually determined.
 * ============================================================================
 */

import { base44 } from "@/api/base44Client";
import { downscaleImageFile } from "@/lib/imageOptimize";
import { createVisionInvokeLLM } from "@/lib/medscan/llmAdapter";
import { runRadiologyEngine } from "@/lib/radiologyEngine";
import { assembleRadiologyResult } from "./radiologyResultBuilder.js";

const abstainErrors = {
  he: (r) => `לא ניתן להפיק פענוח אמין: ${r} נא להעלות בדיקת הדמיה חדה וברורה.`,
  en: (r) => `Cannot produce a reliable reading: ${r} Please upload a sharp, clear imaging study.`,
  ar: (r) => `تعذّر إنتاج قراءة موثوقة: ${r} يرجى رفع صورة تصوير واضحة.`,
};

export async function runRadiologyFastAnalysis({
  files,
  preUploadedUrls,
  clinicalContext,
  language = "he",
  pediatric = false,
  patientRef,
  onStage,
  invokeLLM,
}) {
  onStage?.("uploading");
  const [fileUrls, allCases] = await Promise.all([
    preUploadedUrls && preUploadedUrls.length > 0
      ? Promise.resolve(preUploadedUrls)
      : Promise.all((files || []).map(async (f) => {
          const optimized = await downscaleImageFile(f);
          const r = await base44.integrations.Core.UploadFile({ file: optimized });
          return r.file_url;
        })),
    base44.entities.RadiologyCase.list("-created_date", 1000).catch(() => []),
  ]);
  const file_url = fileUrls[0];

  // ---- THE single systematic vision read (fast model, deterministic backbone) ----
  onStage?.("interpreting");
  const invoke = invokeLLM || createVisionInvokeLLM({ purpose: "radiology_fast" });
  const engineResult = await runRadiologyEngine({
    fileUrls,
    clinicalContext,
    language,
    pediatric,
    invokeLLM: invoke,
    onStage,
  });

  if (!engineResult || engineResult.abstain) {
    const build = abstainErrors[language] || abstainErrors.he;
    throw new Error(build(engineResult?.abstain_reason || ""));
  }

  // ---- deterministic assembly (pure, unit-tested) ----
  onStage?.("verifying");
  const result = assembleRadiologyResult(engineResult, allCases, { fileUrl: file_url, locale: language });

  // ---- persist (non-fatal; awaited so analysisId is ready for export + feedback) ----
  try {
    const rec = await base44.entities.Analysis.create({
      type: "radiology",
      image_url: file_url,
      result: result.analysis,
      severity: result.severity,
      summary: result.summary,
      structured_json: JSON.stringify({ structured: engineResult.structured, confidence: engineResult.confidence, warnings: engineResult.warnings }),
      patient_ref: patientRef || undefined,
    });
    result.analysisId = rec?.id;
  } catch { /* non-fatal */ }

  onStage?.("");
  return result;
}
