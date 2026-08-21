/**
 * ============================================================================
 *  MedScan AI — Skin FAST Pipeline (single vision pass)
 * ============================================================================
 *  ONE morphology read (runSkinEngine, fast model) → pure-code assembly
 *  (skinResultBuilder). Replaces the old multi-call pipeline. The engine already
 *  does the systematic read + deterministic dermoscopy scoring (7-point/ABCD/
 *  chaos) + allergen mapping; running it once and assembling in code keeps the
 *  shown result identical to what the engine determined, in seconds.
 * ============================================================================
 */

import { base44 } from "@/api/base44Client";
import { downscaleImageFile } from "@/lib/imageOptimize";
import { createVisionInvokeLLM } from "@/lib/medscan/llmAdapter";
import { runSkinEngine } from "@/lib/skinEngine";
import { assembleSkinResult } from "./skinResultBuilder.js";

const abstainErrors = {
  he: (r) => `לא ניתן להפיק פענוח אמין: ${r} נא להעלות תצלום עור חד וברור.`,
  en: (r) => `Cannot produce a reliable reading: ${r} Please upload a sharp, clear skin photo.`,
  ar: (r) => `تعذّر إنتاج قراءة موثوقة: ${r} يرجى رفع صورة جلد واضحة.`,
};

export async function runSkinFastAnalysis({
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
    base44.entities.SkinCase.list("-created_date", 1000).catch(() => []),
  ]);
  const file_url = fileUrls[0];

  onStage?.("interpreting");
  const invoke = invokeLLM || createVisionInvokeLLM({ purpose: "skin_fast" });
  const engineResult = await runSkinEngine({
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

  onStage?.("verifying");
  const result = assembleSkinResult(engineResult, allCases, { fileUrl: file_url, locale: language });

  try {
    const rec = await base44.entities.Analysis.create({
      type: "skin",
      image_url: file_url,
      result: result.analysis,
      severity: result.severity,
      summary: result.summary,
      structured_json: JSON.stringify({ structured: engineResult.structured, confidence: engineResult.confidence, warnings: engineResult.warnings, dermoscopy: engineResult.dermoscopy }),
      patient_ref: patientRef || undefined,
    });
    result.analysisId = rec?.id;
  } catch { /* non-fatal */ }

  onStage?.("");
  return result;
}
