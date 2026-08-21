/**
 * ============================================================================
 *  MedScan AI — Confidence Calibration (deterministic, NO LLM)
 * ============================================================================
 *  Answers "is the confidence % the tool shows actually trustworthy?" by
 *  cross-checking predicted confidence against real correctness (from the
 *  validation harness / gold-standard runs). A tool that says 90% but is right
 *  60% of the time is dangerously overconfident — this measures exactly that.
 *
 *  Metrics: reliability bins, Expected Calibration Error (ECE), Maximum
 *  Calibration Error (MCE), Brier score, and an over/under-confidence verdict.
 * ============================================================================
 */

/**
 * @param {{confidence:number, correct:boolean}[]} samples  confidence 0-100
 * @param {number} [bins=10]
 */
export function computeCalibration(samples = [], bins = 10) {
  const clean = (samples || []).filter(
    (s) => Number.isFinite(Number(s.confidence)) && typeof s.correct === "boolean"
  );
  const n = clean.length;
  if (!n) return { n: 0, note_he: "אין דגימות (confidence + נכונות) לחישוב כיול." };

  const pts = clean.map((s) => ({ p: Math.min(1, Math.max(0, Number(s.confidence) / 100)), y: s.correct ? 1 : 0 }));

  const binArr = Array.from({ length: bins }, (_, i) => ({
    lo: i / bins, hi: (i + 1) / bins, count: 0, sumConf: 0, sumCorrect: 0,
  }));
  for (const { p, y } of pts) {
    const idx = Math.min(bins - 1, Math.floor(p * bins));
    binArr[idx].count++; binArr[idx].sumConf += p; binArr[idx].sumCorrect += y;
  }

  let ece = 0, mce = 0;
  const reliability = binArr
    .filter((b) => b.count > 0)
    .map((b) => {
      const conf = b.sumConf / b.count;
      const acc = b.sumCorrect / b.count;
      const gap = Math.abs(acc - conf);
      ece += (b.count / n) * gap;
      mce = Math.max(mce, gap);
      return {
        range: `${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}%`,
        count: b.count,
        avg_confidence: round1(conf * 100),
        accuracy: round1(acc * 100),
        gap: round1(gap * 100),
      };
    });

  const brier = pts.reduce((s, { p, y }) => s + (p - y) * (p - y), 0) / n;
  const avgConf = pts.reduce((s, { p }) => s + p, 0) / n;
  const acc = pts.reduce((s, { y }) => s + y, 0) / n;
  let verdict = "well_calibrated";
  if (avgConf > acc + 0.05) verdict = "overconfident";
  else if (avgConf < acc - 0.05) verdict = "underconfident";

  return {
    n,
    reliability,
    ece: round1(ece * 100),
    mce: round1(mce * 100),
    brier: Math.round(brier * 1000) / 1000,
    avg_confidence: round1(avgConf * 100),
    accuracy: round1(acc * 100),
    verdict,
    verdict_he:
      verdict === "overconfident"
        ? "ביטחון-יתר: המערכת מציגה % גבוה מהדיוק בפועל — יש לכייל כלפי מטה."
        : verdict === "underconfident"
        ? "ביטחון-חסר: המערכת שמרנית מדי מול הדיוק בפועל."
        : "מכויל היטב: ה-% תואם לדיוק בפועל.",
  };
}

/** Build calibration samples from gold-standard eval results. */
export function samplesFromEval(results = []) {
  return (results || [])
    .filter((r) => Number.isFinite(Number(r.confidence)) && typeof r.isCorrect === "boolean")
    .map((r) => ({ confidence: Number(r.confidence), correct: r.isCorrect }));
}

function round1(x) {
  return Math.round(x * 10) / 10;
}
