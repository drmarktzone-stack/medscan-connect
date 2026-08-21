/**
 * ============================================================================
 *  MedScan AI — ECG Validation Harness (deterministic scoring, NO LLM)
 * ============================================================================
 *  Turns "zero hallucinations" from a claim into a measured number. Runs the
 *  engine over LABELED ECG cases and computes, in plain JS (no model in the
 *  scoring loop):
 *    - per critical-pattern: sensitivity, specificity, PPV, NPV
 *    - HALLUCINATION RATE — the engine asserting a critical finding that is NOT
 *      in ground truth (the metric that matters most here)
 *    - interval accuracy — MAE of HR/PR/QRS/QTc vs labeled measurements
 *    - abstain rate + appropriateness
 *
 *  Ground-truth case shape:
 *    { case_id, image_url?, age_years?, sex?, uninterpretable?,
 *      true_intervals:{hr,pr,qrs,qtc}, true_critical_patterns:[key...],
 *      true_normal?, source }
 *
 *  Real labeled data is supplied by the physician or from an open set (e.g.
 *  PTB-XL). The built-in SMOKE_CASES are clearly synthetic and only prove the
 *  scoring pipeline — they must never be read as real performance.
 * ============================================================================
 */

import { CRITICAL_RULE_OUT } from "./ecgEngine";

const CRIT_KEYS = CRITICAL_RULE_OUT.map((c) => c.key);

/** met critical-pattern keys the engine asserted for a case. */
function assertedCriticals(engineOutput) {
  const cro = engineOutput?.structured?.critical_rule_out || [];
  return cro.filter((x) => x && x.status === "met" && x.pattern_key).map((x) => x.pattern_key);
}

function intervalsOf(engineOutput) {
  const iv = engineOutput?.structured?.intervals || {};
  const rr = engineOutput?.structured?.rhythm_and_rate || {};
  return {
    hr: num(rr.heart_rate_bpm),
    pr: num(iv.pr_ms),
    qrs: num(iv.qrs_ms),
    qtc: num(iv.qtc_bazett_ms),
  };
}

function num(v) {
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

/**
 * Score one case against ground truth. Pure and deterministic.
 * @returns per-case record with confusion contributions + interval errors.
 */
export function scoreCase(engineOutput, truth) {
  const abstained = engineOutput?.abstain === true;
  const asserted = new Set(abstained ? [] : assertedCriticals(engineOutput));
  const actual = new Set(truth?.true_critical_patterns || []);

  // Per-pattern confusion across the whole catalog.
  const perPattern = {};
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const key of CRIT_KEYS) {
    const pred = asserted.has(key);
    const real = actual.has(key);
    const cell = pred && real ? "tp" : pred && !real ? "fp" : !pred && real ? "fn" : "tn";
    perPattern[key] = cell;
    if (cell === "tp") tp++;
    else if (cell === "fp") fp++;
    else if (cell === "fn") fn++;
    else tn++;
  }

  // Hallucinated critical assertions = asserted but not in truth.
  const hallucinated = [...asserted].filter((k) => !actual.has(k));
  const missed = [...actual].filter((k) => !asserted.has(k));

  // Interval absolute errors (only where both sides present).
  const est = intervalsOf(engineOutput);
  const tru = truth?.true_intervals || {};
  const intervalErrors = {};
  for (const k of ["hr", "pr", "qrs", "qtc"]) {
    const a = est[k];
    const b = num(tru[k]);
    if (a != null && b != null) intervalErrors[k] = Math.abs(a - b);
  }

  const abstainAppropriate = abstained ? truth?.uninterpretable === true : null;

  return {
    case_id: truth?.case_id ?? null,
    source: truth?.source ?? null,
    abstained,
    abstain_appropriate: abstainAppropriate,
    perPattern,
    tp, fp, fn, tn,
    hallucinated,          // critical patterns invented on THIS case
    missed,                // real critical patterns missed on THIS case
    intervalErrors,
  };
}

/**
 * Run the engine over labeled cases and score each.
 * @param {object[]} cases      ground-truth cases (may embed `engineOutput` for offline scoring)
 * @param {Function} [runEngine] async (case) => engineOutput. If omitted, uses case.engineOutput.
 */
export async function runValidationSuite({ cases = [], runEngine = null } = {}) {
  const results = [];
  for (const c of cases) {
    let out = c.engineOutput || null;
    if (!out && typeof runEngine === "function") {
      try {
        out = await runEngine(c);
      } catch (e) {
        out = { abstain: true, structured: null, _error: String(e?.message || e) };
      }
    }
    results.push(scoreCase(out || { abstain: true, structured: null }, c));
  }
  return results;
}

/** Aggregate per-case scores into headline metrics. Deterministic. */
export function aggregate(results = []) {
  const n = results.length || 0;
  let TP = 0, FP = 0, FN = 0, TN = 0;
  let casesWithHallucination = 0;
  let totalAssertions = 0, hallucinatedAssertions = 0;
  let abstained = 0, abstainAppropriate = 0, abstainInappropriate = 0;
  const err = { hr: [], pr: [], qrs: [], qtc: [] };

  for (const r of results) {
    TP += r.tp; FP += r.fp; FN += r.fn; TN += r.tn;
    if (r.hallucinated.length) casesWithHallucination++;
    totalAssertions += r.tp + r.fp;
    hallucinatedAssertions += r.fp;
    if (r.abstained) {
      abstained++;
      if (r.abstain_appropriate === true) abstainAppropriate++;
      else if (r.abstain_appropriate === false) abstainInappropriate++;
    }
    for (const k of Object.keys(err)) if (r.intervalErrors[k] != null) err[k].push(r.intervalErrors[k]);
  }

  const safeDiv = (a, b) => (b > 0 ? a / b : null);
  const mae = {};
  for (const k of Object.keys(err)) mae[k] = err[k].length ? round(err[k].reduce((s, x) => s + x, 0) / err[k].length) : null;

  return {
    n_cases: n,
    critical_patterns: {
      sensitivity: pct(safeDiv(TP, TP + FN)),
      specificity: pct(safeDiv(TN, TN + FP)),
      ppv: pct(safeDiv(TP, TP + FP)),
      npv: pct(safeDiv(TN, TN + FN)),
      confusion: { TP, FP, FN, TN },
    },
    hallucination: {
      case_rate: pct(safeDiv(casesWithHallucination, n)),           // % of cases with an invented critical finding
      assertion_rate: pct(safeDiv(hallucinatedAssertions, totalAssertions)), // % of critical assertions that were false
      cases_with_hallucination: casesWithHallucination,
    },
    interval_mae: mae,
    abstain: {
      rate: pct(safeDiv(abstained, n)),
      appropriate: abstainAppropriate,
      inappropriate: abstainInappropriate,
    },
  };
}

function pct(x) {
  return x == null ? null : round(x * 100);
}
function round(x) {
  return Math.round(x * 10) / 10;
}

/* ---------------------------------------------------------------------------
 *  Synthetic smoke-test cases (SCORING pipeline only — NOT real performance).
 *  Each pairs a fabricated engine output with its ground truth so the harness
 *  can be exercised with no LLM. Uses REAL critical-pattern keys from the
 *  catalog so scoring is exercised end-to-end.
 * ------------------------------------------------------------------------- */
const K0 = CRIT_KEYS[0] || "unknown_0";
const K1 = CRIT_KEYS[1] || "unknown_1";

export const SMOKE_CASES = [
  {
    case_id: "smoke_true_positive",
    source: "synthetic_smoke_test",
    true_intervals: { hr: 78, pr: 160, qrs: 90, qtc: 420 },
    true_critical_patterns: [K0],
    engineOutput: {
      abstain: false,
      structured: {
        rhythm_and_rate: { heart_rate_bpm: 80 },
        intervals: { pr_ms: 158, qrs_ms: 92, qtc_bazett_ms: 425 },
        critical_rule_out: [{ pattern_key: K0, status: "met" }],
      },
    },
  },
  {
    case_id: "smoke_true_negative",
    source: "synthetic_smoke_test",
    true_normal: true,
    true_intervals: { hr: 70, pr: 150, qrs: 88, qtc: 410 },
    true_critical_patterns: [],
    engineOutput: {
      abstain: false,
      structured: {
        rhythm_and_rate: { heart_rate_bpm: 72 },
        intervals: { pr_ms: 152, qrs_ms: 86, qtc_bazett_ms: 405 },
        critical_rule_out: CRIT_KEYS.map((k) => ({ pattern_key: k, status: "not_met" })),
      },
    },
  },
  {
    case_id: "smoke_hallucination",
    source: "synthetic_smoke_test",
    true_intervals: { hr: 65, pr: 140, qrs: 84, qtc: 400 },
    true_critical_patterns: [], // truth: nothing critical
    engineOutput: {
      abstain: false,
      structured: {
        rhythm_and_rate: { heart_rate_bpm: 66 },
        intervals: { pr_ms: 145, qrs_ms: 88, qtc_bazett_ms: 402 },
        critical_rule_out: [{ pattern_key: K1, status: "met" }], // engine INVENTED K1 → hallucination
      },
    },
  },
];
