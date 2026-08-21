/**
 * ============================================================================
 *  MedScan AI — Allergy / Contact Dermatitis module (deterministic, NO LLM)
 * ============================================================================
 *  Rule-based allergen-by-distribution mapping, ICDRG patch-test reading, and
 *  urticaria/angioedema red-flag routing. Every rule carries a source anchor.
 *  All items are decision-support and draft_needs_verification.
 * ============================================================================
 */

/** Distribution → suspected contact allergen(s). Rules are anchored; clinical
 *  relevance of any hit is decided by the physician (actual exposure). */
export const ALLERGEN_BY_SITE = [
  { match: /(אוזן|תנוך|earlobe|טבור|umbilic)/i, allergens: ["ניקל (Nickel)"], anchor: "contact-derm.nickel" },
  { match: /(קרקפת|קו.?שיער|scalp|hairline)/i, allergens: ["PPD (צבע שיער)"], anchor: "contact-derm.ppd" },
  { match: /(עפעפ|פנים|eyelid|face)/i, allergens: ["בישום/מרכיבי קוסמטיקה", "לק ציפורניים (מועבר)"], anchor: "contact-derm.face" },
  { match: /(רגל|כף.?רגל|feet|foot)/i, allergens: ["כרום (עיבוד עור)", "גומי/מאיצים (נעליים)"], anchor: "contact-derm.footwear" },
  { match: /(יד|כף.?יד|hand)/i, allergens: ["גומי/לטקס", "מגירויים תעסוקתיים"], anchor: "contact-derm.hand" },
  { match: /(חשופ.?שמש|photo|פוטו)/i, allergens: ["פוטו-אלרגן (קרם הגנה/תרופה מקומית)"], anchor: "contact-derm.photo" },
];

export function allergensForDistribution(distributionText = "") {
  const t = String(distributionText || "");
  const hits = [];
  for (const r of ALLERGEN_BY_SITE) {
    if (r.match.test(t)) hits.push({ allergens: r.allergens, anchor: r.anchor });
  }
  return hits;
}

/** ICDRG patch-test reading grades (read D2 and D3/D4, +/- D7). */
export const ICDRG = {
  "-": "שלילי",
  "?+": "מפוקפק (אריתמה מקולרית קלה)",
  "+": "חלש (אריתמה + חדירה ± פפולות)",
  "++": "חזק (אריתמה + חדירה + פפולות + וסיקולות)",
  "+++": "קיצוני (אריתמה עזה + וסיקולות/בולות מתלכדות)",
  IR: "תגובת גירוי (irritant)",
  NT: "לא נבדק",
};

export function interpretPatchTest(reading = {}) {
  // reading: { grade, day, allergen }
  const grade = reading.grade;
  const meaning = ICDRG[grade] ?? "דירוג לא מוכר";
  const allergic = ["+", "++", "+++"].includes(grade);
  return {
    grade,
    meaning_he: meaning,
    likely_allergic: allergic,
    note_he: allergic
      ? "תגובה חיובית — יש לקבוע רלוונטיות קלינית מול חשיפה בפועל."
      : grade === "IR"
      ? "תגובת גירוי, לא אלרגית — אין להסיק רגישות."
      : "אין עדות לרגישות בקריאה זו.",
    source: "ICDRG grading",
  };
}

/**
 * Urticaria / angioedema triage. Returns emergency routing when airway/BP at risk.
 * @param {object} p { angioedema, respiratory_distress, hypotension, duration_weeks, single_lesion_over_24h, bruising }
 */
export function urticariaTriage(p = {}) {
  const flags = [];
  if (p.angioedema && (p.respiratory_distress || p.hypotension)) {
    return {
      urgency: "Emergency",
      route_he: "מסלול אנפילקסיס — אדרנלין IM מיידי.",
      flags: ["אנגיואדמה + מצוקה נשימתית/תת-ל\"ד"],
      source: "WAO anaphylaxis",
    };
  }
  if (p.single_lesion_over_24h || p.bruising) {
    flags.push("נגע בודד >24 שעות / משאיר סימן — חשד urticarial vasculitis (שקול ביופסיה).");
  }
  const chronic = Number(p.duration_weeks) >= 6;
  return {
    urgency: flags.length ? "Urgent" : "Normal",
    chronic,
    definition_he: chronic ? "אורטיקריה כרונית (≥6 שבועות)." : "אורטיקריה חריפה.",
    flags,
    source: "EAACI/GA²LEN/EDF/WAO urticaria guideline",
  };
}
