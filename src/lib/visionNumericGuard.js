/**
 * ============================================================================
 *  MedScan AI — Vision Numeric Guard (anti-hallucination for image engines)
 * ============================================================================
 *  Extends the deterministic-vs-LLM firewall to the ECG / radiology engines.
 *  The dangerous hallucination isn't a wrong narrative — it's a wrong NUMBER
 *  (an interval, a measurement) that reads as fact. Every code-computed value
 *  is "grounded"; any number in the model's PROSE that isn't grounded — in a
 *  clinically-meaningful context — is flagged for verification.
 *
 *  Reuses the battle-tested `numericGuard` from the grounded-engine stack: we
 *  build the "allowed numbers" set from the code-authoritative values, then let
 *  it scan the structured output's prose. We surface only block/warn_high
 *  contexts (dose/threshold/percentile/age/time) to avoid noise from casual
 *  numbers like lead names (V4, V6).
 * ============================================================================
 */

import { numericGuard } from "./medscan/antihallucination/numericGuard.js";
import { formatNumber } from "./medscan/antihallucination/factBlock.js";

function collectNums(...vals) {
  const out = [];
  for (const v of vals) {
    if (v == null) continue;
    if (Array.isArray(v)) out.push(...collectNums(...v));
    else if (typeof v === "object") out.push(...collectNums(...Object.values(v)));
    else if (Number.isFinite(Number(v))) out.push(Number(v));
  }
  return out;
}

/** Code-authoritative numbers from an ECG structured reading. */
export function groundedEcgNumbers(structured = {}) {
  const iv = structured.intervals || {};
  const rr = structured.rhythm_and_rate || {};
  const ax = structured.axis || {};
  const st = (structured.st_deviations || []).map((d) => d && d.mm);
  return collectNums(
    iv.pr_ms, iv.qrs_ms, iv.qt_ms, iv.rr_ms, iv.qtc_bazett_ms, iv.qtc_fridericia_ms,
    rr.heart_rate_bpm, ax.degrees, st, structured.grid_measurements
  );
}

/** Code-authoritative numbers from a radiology reading (measured + norms + age). */
export function groundedRadiologyNumbers(structured = {}, measurementEval = []) {
  const m = (measurementEval || []).flatMap((x) => [x.value, ...(x.normal || [])]);
  return collectNums(structured.patient_age_months, m);
}

/**
 * Run the guard. Returns warnings (deduped, capped) for ungrounded numbers in
 * clinically-meaningful context. Never blocks — vision output is decision
 * support — but surfaces every suspicious number for the physician.
 */
export function runVisionNumericGuard(structured, groundedNumbers = []) {
  if (!structured) return { warnings: [], violations: [] };
  const allowedNumbers = [...new Set(groundedNumbers.map((n) => formatNumber(Number(n))))];
  let res;
  try {
    res = numericGuard(structured, { allowedNumbers });
  } catch {
    return { warnings: [], violations: [] };
  }
  const meaningful = (res.violations || []).filter(
    (v) => v.severity === "block" || v.severity === "warn_high"
  );
  const seen = new Set();
  const warnings = [];
  for (const v of meaningful) {
    if (seen.has(v.number)) continue;
    seen.add(v.number);
    warnings.push(
      `המספר "${v.raw}" מופיע בנרטיב אך אינו נובע ממדידה של המנוע — אל תסתמך עליו ללא אימות.`
    );
    if (warnings.length >= 3) break;
  }
  return { warnings, violations: meaningful };
}
