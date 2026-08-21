/**
 * ============================================================================
 *  Central AI model configuration
 * ============================================================================
 *  All diagnostic reasoning and content-generation calls route their `model`
 *  through here, so switching the underlying vision/reasoning model is a
 *  ONE-LINE change instead of hunting through every engine.
 *
 *  The model string is passed to Base44's `Core.InvokeLLM({ model })`. Only
 *  identifiers your Base44 project actually provisions will work — verify a
 *  model is available before switching, or every AI call will fail.
 *
 *  To move to Claude (as the engine specs request), set DIAGNOSIS_MODEL to the
 *  Claude identifier exposed by your Base44 workspace, e.g. something like
 *  "claude_3_5_sonnet" / "claude_3_opus" (confirm the exact string in Base44).
 * ============================================================================
 */

// High-precision vision + reasoning model used for image interpretation,
// the structured engines, criteria verification and adversarial checks.
// Claude Opus 4.8 — the top-tier reasoning/vision model, chosen for maximum
// diagnostic precision and the strongest anti-hallucination behavior.
export const DIAGNOSIS_MODEL = "claude_opus_4_8";

// ╔═══════════════════════════════════════════════════════════════╗
// ║  VISION_MODEL — המודל שקורא את התמונה (ECG / רדיולוגיה / עור / מעבדה)  ║
// ╠═══════════════════════════════════════════════════════════════╣
// מופרד ממודל-ההיגיון בכוונה: הקונפיגורציה החזקה ביותר היא היברידית:
//   · קריאת-התמונה (perception) ← מודל-ראייה חזק (Gemini 3.1 Pro).
//   · ההיגיון הקליני + אנטי-הזיה + אבחנה מבדלת ← DIAGNOSIS_MODEL (Opus 4.8).
// להחלפת מודל-הראייה — שנה שורה אחת בלבד. אפשרויות זמינות ב-Base44:
//   "gemini_3_1_pro" (מומלץ לראייה) | "claude_opus_4_8" | "gpt_5_5" | "gemini_3_flash" (מהיר).
// הערה: המספרים הקריטיים (מרווחי ECG וכו') מחושבים בקוד ולא תלויים במודל.
export const VISION_MODEL = "gemini_3_1_pro";

// Faster model for heavy-but-non-critical diagnostic sub-steps: knowledge-base
// matching over the full case library, and the adversarial verifier. Keeps the
// critical structured interpretation + final diagnosis on Opus while cutting
// latency/cost on the surrounding steps.
// Claude Sonnet 4.6.
export const FAST_MODEL = "claude_sonnet_4_6";

// Model used for bulk content generation / evaluation matching (throughput).
// Claude Sonnet 4.6 — faster/cheaper, fine for non-diagnostic bulk work.
export const GENERATION_MODEL = "claude_sonnet_4_6";

// Base44-provisioned model identifiers available in this workspace:
//   claude_opus_4_8, claude_opus_4_7, claude_opus_4_6, claude_sonnet_4_6,
//   gpt_5_5, gpt_5_4, gpt_5_mini, gemini_3_1_pro, gemini_3_flash
// To change the model used everywhere, edit the two constants above.
export const AVAILABLE_MODELS = [
  "claude_opus_4_8",
  "claude_opus_4_7",
  "claude_opus_4_6",
  "claude_sonnet_4_6",
];
