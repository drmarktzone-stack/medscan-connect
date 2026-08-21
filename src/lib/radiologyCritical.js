/**
 * ============================================================================
 *  MedScan AI — Radiology Critical Rule-Out (deterministic escalation)
 * ============================================================================
 *  Mirrors the ECG critical-rule-out design: a fixed catalogue of can't-miss
 *  radiology findings. The model reports each as met / indeterminate / not_met;
 *  the URGENCY ESCALATION is enforced in code — a met life-threat forces
 *  Emergency regardless of what the narrative said, and an indeterminate one is
 *  surfaced. This closes the gap where a dangerous finding is described but the
 *  urgency is left low.
 * ============================================================================
 */

export const RADIOLOGY_CRITICAL = [
  { key: "tension_pneumothorax", label: "פנאומוטורקס במתח", level: "emergency", look_for: "קריסת ריאה + הסטת מדיאסטינום/קנה לצד הנגדי, השטחת סרעפת" },
  { key: "pneumoperitoneum", label: "אוויר חופשי תוך-צפקי", level: "emergency", look_for: "אוויר מתחת לסרעפת / סימן Rigler — חשד לניקוב" },
  { key: "malpositioned_tube_line", label: "מיקום שגוי של טובוס/צנתר", level: "urgent", look_for: "ETT בסמפון ראשי/גבוה מדי, CVC בעלייה/חדר, NGT בקנה/ריאה" },
  { key: "midline_shift_herniation", label: "הסטת קו-אמצע / הרניאציה", level: "emergency", look_for: "הסטת מבני אמצע, מחיקת ציסטרנות, אפקט מסה" },
  { key: "intracranial_hemorrhage", label: "דימום תוך-גולגולתי", level: "emergency", look_for: "היפר-דנסיות חדה חוץ/תוך-צירית (epidural/subdural/SAH/parenchymal)" },
  { key: "bowel_obstruction_perforation", label: "חסימת מעי / ניקוב", level: "urgent", look_for: "לולאות מורחבות + מפלסי אוויר-נוזל, אוויר בדופן/חופשי" },
  { key: "unstable_or_physeal_fracture", label: "שבר לא-יציב / פיזיאלי (ילדים)", level: "urgent", look_for: "שבר עם תזוזה/ריסוק, מעורבות לוחית-גדילה (Salter-Harris)" },
  { key: "joint_dislocation", label: "פריקת מפרק", level: "urgent", look_for: "אובדן קונגרואנטיות מפרקית" },
  { key: "widened_mediastinum", label: "מדיאסטינום מורחב", level: "emergency", look_for: "הרחבה >8ס\"מ/יחס — חשד לדיסקציה/חבלה אאורטלית" },
  { key: "pneumomediastinum", label: "פנאומומדיאסטינום", level: "urgent", look_for: "פסי אוויר לאורך מבני המדיאסטינום" },
  { key: "airway_foreign_body", label: "גוף זר בדרכי אוויר", level: "emergency", look_for: "לכידת אוויר/אטלקטזיס א-סימטרי, גוף זר רדיו-אופקי" },
  { key: "free_air_retroperitoneal", label: "אוויר רטרופריטונאלי", level: "urgent", look_for: "אוויר סביב כליה/פסואס — חשד לניקוב תריסריון/מעי" },
];

export const RADIOLOGY_CRITICAL_LEVEL = Object.fromEntries(RADIOLOGY_CRITICAL.map((c) => [c.key, c.level]));
export const RADIOLOGY_CRITICAL_LABEL = Object.fromEntries(RADIOLOGY_CRITICAL.map((c) => [c.key, c.label]));

export const RADIOLOGY_CRITICAL_PROMPT = `## שלילת ממצאים מסכני-חיים (חובה)
עבור כל דפוס ברשימה, קבע status: "met" (זוהה), "indeterminate" (לא ניתן לשלול), או "not_met" (נשלל). החזר תחת critical_rule_out כמערך של { pattern_key, status, evidence }.
דפוסים: ${RADIOLOGY_CRITICAL.map((c) => `${c.key} (${c.label} — ${c.look_for})`).join(" · ")}.
אל תכריז "met" ללא ממצא תומך נראה.`;

/**
 * Deterministic escalation from the model-reported critical_rule_out.
 * @returns {{ forcedUrgency:string|null, warnings:string[], met:string[], indeterminate:string[] }}
 */
export function applyRadiologyCritical(structured) {
  const cro = (structured?.critical_rule_out || []).filter((x) => x && x.pattern_key);
  const met = cro.filter((x) => x.status === "met");
  const indet = cro.filter((x) => x.status === "indeterminate");
  const warnings = [];
  let forcedUrgency = null;

  for (const m of met) {
    const level = RADIOLOGY_CRITICAL_LEVEL[m.pattern_key];
    const label = RADIOLOGY_CRITICAL_LABEL[m.pattern_key] || m.pattern_key;
    if (level === "emergency") forcedUrgency = "Emergency";
    else if (level === "urgent" && forcedUrgency !== "Emergency") forcedUrgency = "Urgent";
    warnings.push(`דפוס מסכן-חיים זוהה: ${label}${m.evidence ? ` — ${m.evidence}` : ""}.`);
  }
  for (const i of indet) {
    warnings.push(`לא ניתן לשלול: ${RADIOLOGY_CRITICAL_LABEL[i.pattern_key] || i.pattern_key} — שקול הדמיה/ייעוץ.`);
  }
  return { forcedUrgency, warnings, met: met.map((x) => x.pattern_key), indeterminate: indet.map((x) => x.pattern_key) };
}
