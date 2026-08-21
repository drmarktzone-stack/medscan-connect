/**
 * ============================================================================
 *  MedScan AI — Dermoscopy Scoring (deterministic, NO LLM)
 * ============================================================================
 *  The LLM (or the clinician) reports WHICH dermoscopic structures are present;
 *  the SCORES are computed here in code, so a melanoma-risk number is never a
 *  model guess. Implements three validated algorithms:
 *    - 7-point checklist (Argenziano 1998)
 *    - ABCD rule / Total Dermoscopy Score (Stolz 1994)
 *    - Chaos & Clues (Rosendahl 2012)
 *  plus a combined malignancy-risk band.
 *
 *  ⚠️ A low score NEVER rules out melanoma. Dermoscopy is not histology.
 *  All thresholds are draft_needs_verification against the cited sources.
 * ============================================================================
 */

/**
 * 7-point checklist. majors = 2 pts each, minors = 1 pt each; total >= 3 → excise/refer.
 * @param {object} f booleans: atypical_network, blue_white_veil, atypical_vascular,
 *                    irregular_streaks, irregular_dots_globules, irregular_blotches, regression
 */
export function sevenPointScore(f = {}) {
  const majors = [
    ["atypical_network", "רשת פיגמנט אטיפית"],
    ["blue_white_veil", "רעלה כחולה-לבנה"],
    ["atypical_vascular", "דפוס כלי-דם אטיפי"],
  ];
  const minors = [
    ["irregular_streaks", "פסים לא-סדירים"],
    ["irregular_dots_globules", "נקודות/גלובולות לא-סדירות"],
    ["irregular_blotches", "כתמי פיגמנט לא-סדירים"],
    ["regression", "מבני רגרסיה"],
  ];
  const present = [];
  let score = 0;
  for (const [k, label] of majors) if (f[k]) { score += 2; present.push({ label, weight: 2 }); }
  for (const [k, label] of minors) if (f[k]) { score += 1; present.push({ label, weight: 1 }); }
  return { score, flagged: score >= 3, present, threshold: 3, source: "Argenziano 1998 (7-point checklist)" };
}

/**
 * ABCD rule — Total Dermoscopy Score. TDS = 1.3A + 0.1B + 0.5C + 0.5D.
 * @param {object} p  asymmetry 0-2, border_segments 0-8, colors 1-6, structures 1-5
 */
export function abcdTds({ asymmetry = 0, border_segments = 0, colors = 1, structures = 1 } = {}) {
  const A = clamp(asymmetry, 0, 2);
  const B = clamp(border_segments, 0, 8);
  const C = clamp(colors, 1, 6);
  const D = clamp(structures, 1, 5);
  const tds = round2(1.3 * A + 0.1 * B + 0.5 * C + 0.5 * D);
  let band = "benign";
  if (tds > 5.45) band = "high_suspicion";
  else if (tds >= 4.75) band = "suspicious";
  return { tds, band, inputs: { A, B, C, D }, thresholds: { benign: "<4.75", suspicious: "4.75-5.45", high: ">5.45" }, source: "Stolz 1994 (ABCD/TDS)" };
}

/**
 * Chaos & Clues (Rosendahl). chaos (asymmetry of structure/colour) + >=1 clue → excise.
 * @param {boolean} chaos
 * @param {string[]} clues  e.g. grey/blue structures, eccentric structureless area, thick lines,
 *                          peripheral black dots/clods, segmental radial lines/pseudopods, white lines,
 *                          polymorphous vessels, parallel-ridge (acral)
 */
export function chaosAndClues(chaos = false, clues = []) {
  const list = (clues || []).filter(Boolean);
  const excise = !!chaos && list.length >= 1;
  return { chaos: !!chaos, clues: list, excise, source: "Rosendahl 2012 (Chaos & Clues)" };
}

/**
 * Combined malignancy-risk band from the three algorithms + clinical red flags.
 * Deterministic and conservative: any single algorithm flagging raises the band,
 * and a low combined score is explicitly NOT a rule-out.
 */
export function malignancyRisk({ sevenPoint, tds, chaos, redFlags = [] } = {}) {
  let level = "low";
  const reasons = [];
  if (sevenPoint?.flagged) { level = "high"; reasons.push(`7-point ${sevenPoint.score}≥3`); }
  if (tds?.band === "high_suspicion") { level = "high"; reasons.push(`TDS ${tds.tds}>5.45`); }
  else if (tds?.band === "suspicious" && level !== "high") { level = "intermediate"; reasons.push(`TDS ${tds.tds} 4.75-5.45`); }
  if (chaos?.excise) { level = "high"; reasons.push("Chaos&Clues → excise"); }
  if ((redFlags || []).length) { level = "high"; reasons.push(...redFlags); }
  return {
    level,
    reasons,
    referral_he:
      level === "high"
        ? "הפניה דחופה לדרמטולוג/שקילת ביופסיה."
        : level === "intermediate"
        ? "מעקב קצר-מועד/הערכת מומחה."
        : "מעקב שגרתי.",
    disclaimer_he: "ניקוד נמוך אינו שולל מלנומה. דרמוסקופיה אינה מחליפה ביופסיה/היסטולוגיה.",
  };
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+x) ? +x : lo));
const round2 = (x) => Math.round(x * 100) / 100;
