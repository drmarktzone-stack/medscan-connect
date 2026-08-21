/**
 * ============================================================================
 *  MedScan AI — Skin Validation Harness (deterministic, NO LLM)
 * ============================================================================
 *  Measures the dermatology engine against LABELED cases, with the key metric
 *  most derm-AI tools hide: performance BROKEN DOWN BY FITZPATRICK SKIN TONE
 *  (I-VI). A large gap between light and dark skin is a fairness failure that
 *  must be fixed, not averaged away.
 *
 *  Also measures melanoma sensitivity/specificity and the hallucination rate
 *  (engine asserting malignant/critical when truth says benign). All scoring is
 *  pure code. Real labeled data (physician set, ISIC, PAD-UFES, DDI,
 *  Fitzpatrick17k) plugs into runSkinValidation(). Built-in cases are synthetic.
 *
 *  Ground-truth case: { case_id, fitzpatrick(1..6), malignant(bool),
 *    uninterpretable?, true_diagnosis?, source }
 *  Engine output: { abstain?, structured:{ clinical_urgency, primary_impression,
 *    differential_diagnoses:[{diagnosis,likelihood}], critical_red_flags:[] } }
 * ============================================================================
 */

const MALIGNANT_HINTS = /melanoma|מלנומה|carcinoma|קרצינומה|malignant|ממאיר|scc|bcc|sarcoma/i;

/** Did the engine assert malignancy / an emergency for this case? */
function assertedMalignant(out) {
  if (!out || out.abstain) return false;
  const st = out.structured || {};
  if ((st.critical_red_flags || []).length) return true;
  if (st.clinical_urgency === "Emergency") return true;
  const dx = [st.primary_impression, ...(st.differential_diagnoses || []).map((d) => d.diagnosis)]
    .filter(Boolean)
    .join(" ");
  // Count as "asserted malignant" only if a malignant dx is High/primary.
  const top = (st.differential_diagnoses || [])[0];
  const topMal = top && MALIGNANT_HINTS.test(top.diagnosis || "") && /high|גבוה/i.test(top.likelihood || "");
  return topMal || MALIGNANT_HINTS.test(st.primary_impression || "");
}

export function scoreCaseSkin(out, truth) {
  const abstained = out?.abstain === true;
  const pred = assertedMalignant(out);
  const real = truth?.malignant === true;
  const cell = pred && real ? "tp" : pred && !real ? "fp" : !pred && real ? "fn" : "tn";
  return {
    case_id: truth?.case_id ?? null,
    fitzpatrick: truth?.fitzpatrick ?? null,
    source: truth?.source ?? null,
    abstained,
    abstain_appropriate: abstained ? truth?.uninterpretable === true : null,
    predMalignant: pred,
    realMalignant: real,
    cell,
    hallucinated: cell === "fp", // asserted malignant when truth is benign
    missed: cell === "fn", // missed a real malignancy
  };
}

export async function runSkinValidation({ cases = [], runEngine = null } = {}) {
  const results = [];
  for (const c of cases) {
    let out = c.engineOutput || null;
    if (!out && typeof runEngine === "function") {
      try { out = await runEngine(c); } catch (e) { out = { abstain: true, structured: null, _error: String(e?.message || e) }; }
    }
    results.push(scoreCaseSkin(out || { abstain: true }, c));
  }
  return results;
}

function confusionMetrics(list) {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const r of list) {
    if (r.cell === "tp") tp++; else if (r.cell === "fp") fp++; else if (r.cell === "fn") fn++; else tn++;
  }
  const d = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  return {
    n: list.length,
    sensitivity: d(tp, tp + fn),
    specificity: d(tn, tn + fp),
    ppv: d(tp, tp + fp),
    npv: d(tn, tn + fn),
    hallucination_rate: d(fp, list.length),
    confusion: { tp, fp, fn, tn },
  };
}

/** Aggregate overall + a per-Fitzpatrick fairness table. */
export function aggregateSkin(results = []) {
  const overall = confusionMetrics(results);
  const byFitz = {};
  for (let f = 1; f <= 6; f++) {
    const sub = results.filter((r) => r.fitzpatrick === f);
    if (sub.length) byFitz[f] = confusionMetrics(sub);
  }
  // Fairness gap: max-min sensitivity across populated Fitzpatrick bands.
  const sens = Object.values(byFitz).map((m) => m.sensitivity).filter((x) => x != null);
  const fairness_gap = sens.length >= 2 ? Math.round((Math.max(...sens) - Math.min(...sens)) * 10) / 10 : null;
  return { overall, by_fitzpatrick: byFitz, fairness_gap_sensitivity: fairness_gap };
}

/* Synthetic smoke cases (scoring pipeline only — NOT real performance). */
export const SKIN_SMOKE_CASES = [
  { case_id: "skin_tp_I", fitzpatrick: 1, malignant: true, source: "synthetic_smoke_test",
    engineOutput: { structured: { clinical_urgency: "Urgent", primary_impression: "חשד למלנומה", differential_diagnoses: [{ diagnosis: "Melanoma", likelihood: "High" }], critical_red_flags: ["ABCDE חיובי"] } } },
  { case_id: "skin_tn_III", fitzpatrick: 3, malignant: false, source: "synthetic_smoke_test",
    engineOutput: { structured: { clinical_urgency: "Normal", primary_impression: "נבוס שפיר", differential_diagnoses: [{ diagnosis: "Benign nevus", likelihood: "High" }], critical_red_flags: [] } } },
  { case_id: "skin_fn_VI", fitzpatrick: 6, malignant: true, source: "synthetic_smoke_test",
    engineOutput: { structured: { clinical_urgency: "Normal", primary_impression: "נראה שפיר", differential_diagnoses: [{ diagnosis: "Benign", likelihood: "High" }], critical_red_flags: [] } } },
];
