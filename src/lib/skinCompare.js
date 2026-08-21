/**
 * ============================================================================
 *  MedScan AI — Skin Lesion Tracking / Change Detection (deterministic)
 * ============================================================================
 *  Change over time is the core of melanoma detection. Mirrors the ECG-compare
 *  pattern: takes two morphometry snapshots (from skinMorphometry) of the SAME
 *  lesion and reports significant change; a significant change forces higher
 *  urgency + referral. Also supports "ugly duckling" (a lesion that deviates
 *  from the patient's other lesions). Pure code — no LLM.
 * ============================================================================
 */

// Significance thresholds (relative). draft_needs_verification.
const SIG = {
  diameter_mm: 2, // mm growth
  diameter_rel: 0.2, // or 20% relative growth when mm unavailable
  asymmetry: 0.1,
  border: 0.3,
  color_clusters: 1, // a newly appeared colour
};

/**
 * @param {object} now   morphometry result (skinMorphometry.measureLesionFromImage)
 * @param {object} prior morphometry result of the same lesion, earlier
 */
export function deterministicLesionDelta(now, prior) {
  if (!now?.ok || !prior?.ok) return { comparable: false, reason_he: "אחת המדידות אינה זמינה/אמינה." };
  const changes = [];

  if (now.diameter_mm != null && prior.diameter_mm != null) {
    const d = round2(now.diameter_mm - prior.diameter_mm);
    if (d >= SIG.diameter_mm) changes.push({ key: "diameter", detail_he: `גדילת קוטר +${d} מ"מ`, significant: true });
  } else if (now.diameter_px && prior.diameter_px) {
    const rel = (now.diameter_px - prior.diameter_px) / prior.diameter_px;
    if (rel >= SIG.diameter_rel) changes.push({ key: "diameter", detail_he: `גדילת קוטר יחסית +${Math.round(rel * 100)}%`, significant: true });
  }
  if (delta(now.asymmetry_index, prior.asymmetry_index) >= SIG.asymmetry)
    changes.push({ key: "asymmetry", detail_he: "עלייה באי-סימטריה", significant: true });
  if (delta(now.border_irregularity, prior.border_irregularity) >= SIG.border)
    changes.push({ key: "border", detail_he: "עלייה באי-סדירות הגבול", significant: true });
  if ((now.color_clusters ?? 0) - (prior.color_clusters ?? 0) >= SIG.color_clusters)
    changes.push({ key: "color", detail_he: "הופעת גוון/אשכול-צבע חדש", significant: true });

  const significant = changes.some((c) => c.significant);
  return {
    comparable: true,
    changes,
    significant_change: significant,
    forced_urgency: significant ? "Urgent" : null,
    recommendation_he: significant
      ? "שינוי מהותי בנגע — הפניה/הערכת מומחה; שקול דרמוסקופיה וביופסיה."
      : "אין שינוי מהותי מדיד. המשך מעקב שגרתי.",
  };
}

/**
 * "Ugly duckling": flag a lesion whose metrics deviate markedly from the median
 * of the patient's other lesions.
 * @param {object} target morphometry result
 * @param {object[]} others morphometry results of the patient's other lesions
 */
export function uglyDuckling(target, others = []) {
  const valid = others.filter((o) => o?.ok);
  if (!target?.ok || valid.length < 2) return { flagged: false, reason_he: "אין מספיק נגעים להשוואה." };
  const med = (arr) => { const s = arr.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const medAsym = med(valid.map((o) => o.asymmetry_index));
  const medBorder = med(valid.map((o) => o.border_irregularity));
  const medColors = med(valid.map((o) => o.color_clusters));
  const dev = [];
  if (medAsym != null && target.asymmetry_index - medAsym >= 0.15) dev.push("אי-סימטריה חריגה");
  if (medBorder != null && target.border_irregularity - medBorder >= 0.4) dev.push("גבול חריג");
  if (medColors != null && (target.color_clusters ?? 0) - medColors >= 2) dev.push("ריבוי צבעים חריג");
  return {
    flagged: dev.length >= 2,
    deviations: dev,
    recommendation_he: dev.length >= 2 ? "נגע 'ברווזון מכוער' — בולט מול השאר; הערכת מומחה." : "אינו חריג מובהק מול שאר הנגעים.",
  };
}

const delta = (a, b) => (a == null || b == null ? -Infinity : a - b);
const round2 = (x) => Math.round(x * 100) / 100;
