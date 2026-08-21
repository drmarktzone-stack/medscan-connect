/**
 * ============================================================================
 *  MedScan AI — Pediatric Radiology Normal Measurements (deterministic)
 * ============================================================================
 *  Normal reference values are compared in CODE, never guessed by the model.
 *  The model reports a measured value (+ its best age estimate); this library
 *  returns the age-appropriate normal range from the textbook and the verdict.
 *
 *  SOURCE ANCHOR: Caffey's Pediatric Diagnostic Imaging (Elsevier, 13e) — the
 *  gold-standard pediatric radiology reference. Numeric values compiled from
 *  the OHSU "Pediatric Radiology Normal Measurements" tables. Every entry is
 *  verification_status: draft_needs_verification until Dr. Samer confirms it
 *  against the book / local practice.
 *
 *  Ranges: [lo, hi]. Use null for an open bound (e.g. [null, 6] = "≤6").
 * ============================================================================
 */

export const RADIOLOGY_NORMALS_SOURCE =
  "Caffey's Pediatric Diagnostic Imaging (13e) — anchor; values via OHSU Pediatric Radiology Normal Measurements";

export const RADIOLOGY_NORMALS = {
  cardiothoracic_ratio: {
    label_he: "יחס לב-חזה (CTR)", region: "chest", unit: "ratio", view: "צילום חזה זקוף",
    bands: [
      { age_max_months: 1, normal: [0.45, 0.65], label: "0–3 שבועות" },
      { age_max_months: 2, normal: [0.46, 0.70], label: "4–7 שבועות" },
      { age_max_months: 12, normal: [0.45, 0.61], label: "עד שנה" },
      { age_max_months: 24, normal: [0.39, 0.60], label: "1–2 שנים" },
      { age_max_months: 72, normal: [0.40, 0.52], label: "2–6 שנים" },
      { age_max_months: 3000, normal: [0.40, 0.50], label: "≥7 שנים" },
    ],
    note_he: "יילודים/תינוקות: לב יחסית גדול תקין. AP/שכיבה מגדילים מדומה.",
  },
  retropharyngeal_soft_tissue: {
    label_he: "רקמה רכה רטרו-פרינגיאלית (טרום-חולייתית, C5)", region: "neck_spine", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 7], label: "כלל ה-7 (≤7מ\"מ)" }],
    note_he: "עלייה → חשד למורסה/דלקת רטרו-פרינגיאלית. תלוי-גיל כיחס ל-C5; כלל-7 מעשי.",
  },
  retrotracheal_soft_tissue: {
    label_he: "רקמה רכה רטרו-טרכאלית (C5)", region: "neck_spine", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 14], label: "כלל ה-7 (≤14מ\"מ)" }],
  },
  appendix_diameter_us: {
    label_he: "קוטר תוספתן (US)", region: "abdomen", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 6], label: "≤6מ\"מ (בר-דחיסה)" }],
    note_he: ">6מ\"מ לא-דחיס + עובי דופן — חשד לאפנדיציטיס.",
  },
  pylorus_muscle_thickness: {
    label_he: "עובי שריר פילורוס (US)", region: "abdomen", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 3], label: "<3מ\"מ" }],
    note_he: "≥3מ\"מ (עם אורך תעלה >17מ\"מ) — היצרות פילורוס היפרטרופית (HPS).",
  },
  pylorus_channel_length: {
    label_he: "אורך תעלת פילורוס (US)", region: "abdomen", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 17], label: "<17מ\"מ" }],
  },
  spleen_length_us: {
    label_he: "אורך טחול (US)", region: "abdomen", unit: "cm",
    bands: [
      { age_max_months: 3, normal: [null, 6.0], label: "0–3ח'" },
      { age_max_months: 6, normal: [null, 6.5], label: "3–6ח'" },
      { age_max_months: 12, normal: [null, 7.0], label: "6–12ח'" },
      { age_max_months: 24, normal: [null, 8.0], label: "1–2ש'" },
      { age_max_months: 48, normal: [null, 9.0], label: "2–4ש'" },
      { age_max_months: 72, normal: [null, 9.5], label: "4–6ש'" },
      { age_max_months: 96, normal: [null, 10.0], label: "6–8ש'" },
      { age_max_months: 120, normal: [null, 11.0], label: "8–10ש'" },
      { age_max_months: 144, normal: [null, 11.5], label: "10–12ש'" },
      { age_max_months: 3000, normal: [null, 12.0], label: "12–15ש' (זכר עד 13)" },
    ],
  },
  bladder_wall_thickness_full: {
    label_he: "עובי דופן שלפוחית (מלאה)", region: "genitourinary", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 3], label: "1–3מ\"מ" }],
  },
  neonatal_frontal_horn: {
    label_he: "קרן קדמית חדר לרוחב (יילוד, US)", region: "neuro", unit: "mm",
    bands: [{ age_max_months: 1, normal: [null, 3], label: "≤3מ\"מ" }],
  },
  neonatal_third_ventricle: {
    label_he: "חדר שלישי (יילוד, US)", region: "neuro", unit: "mm",
    bands: [{ age_max_months: 1, normal: [null, 4], label: "<4מ\"מ" }],
  },
  small_bowel_diameter: {
    label_he: "קוטר מעי דק (כלל 3/6/9)", region: "abdomen", unit: "cm",
    bands: [{ age_max_months: 3000, normal: [null, 3], label: "<3ס\"מ" }],
    note_he: ">3ס\"מ — חשד לחסימת מעי דק.",
  },
  large_bowel_diameter: {
    label_he: "קוטר מעי גס (כלל 3/6/9)", region: "abdomen", unit: "cm",
    bands: [{ age_max_months: 3000, normal: [null, 6], label: "<6ס\"מ" }],
  },
  cecum_diameter: {
    label_he: "קוטר צקום (כלל 3/6/9)", region: "abdomen", unit: "cm",
    bands: [{ age_max_months: 3000, normal: [null, 9], label: "<9ס\"מ" }],
    note_he: ">9ס\"מ — סכנת ניקוב.",
  },
  atlanto_dental_interval: {
    label_he: "מרווח אטלנטו-דנטלי (ADI)", region: "neck_spine", unit: "mm",
    bands: [
      { age_max_months: 168, normal: [null, 5], label: "ילד (<5מ\"מ)" },
      { age_max_months: 3000, normal: [null, 3], label: "מבוגר (<3מ\"מ)" },
    ],
    note_he: "עלייה — חוסר-יציבות אטלנטו-צירית (שקול טראומה/RA/דאון).",
  },
  thoracic_kyphosis: {
    label_he: "קיפוזיס תורקלי (T3–T12)", region: "spine", unit: "°",
    bands: [{ age_max_months: 3000, normal: [21, 33], label: "21–33°" }],
  },
  lumbar_lordosis: {
    label_he: "לורדוזיס מותני (L1–L5)", region: "spine", unit: "°",
    bands: [{ age_max_months: 3000, normal: [31, 50], label: "31–50°" }],
  },
  gi_wall_stomach: {
    label_he: "עובי דופן קיבה (CT)", region: "abdomen", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [3, 5], label: "3–5מ\"מ" }],
  },
  gi_wall_colon: {
    label_he: "עובי דופן מעי גס (CT)", region: "abdomen", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 3], label: "≤3מ\"מ" }],
  },
  acetabular_index: {
    label_he: "אינדקס אצטבולרי (יילוד, DDH)", region: "hip", unit: "°",
    bands: [{ age_max_months: 6, normal: [null, 30], label: "יילוד (≤~30°)" }],
    note_he: ">30° — חשד לדיספלזיה התפתחותית של מפרק הירך (אימות קליני/US).",
  },
  renal_length_us: {
    label_he: "אורך כליה (US)", region: "genitourinary", unit: "cm",
    bands: [
      { age_max_months: 3, normal: [3.3, 6.0], label: "0–3ח'" },
      { age_max_months: 12, normal: [4.5, 7.0], label: "3–12ח'" },
      { age_max_months: 60, normal: [5.5, 8.5], label: "1–5ש'" },
      { age_max_months: 120, normal: [6.5, 9.5], label: "5–10ש'" },
      { age_max_months: 3000, normal: [8.0, 11.0], label: "10–15ש'" },
    ],
    note_he: "נומוגרמה תלוית-גיל (Rosenbaum). אסימטריה >1ס\"מ בין כליות — משמעותית. אמת מול נומוגרמה מקומית.",
  },
  center_edge_angle: {
    label_he: "זווית מרכז-קצה (Wiberg CE)", region: "hip", unit: "°",
    bands: [
      { age_max_months: 96, normal: [19, null], label: "5–8ש' (>19°)" },
      { age_max_months: 3000, normal: [25, null], label: "≥13ש' (>25°)" },
    ],
    note_he: "נמוך מהסף — כיסוי אצטבולרי לקוי (דיספלזיה). מדיד מגיל ~5 (גרעין ראש עצם ירך).",
  },
  optic_nerve_sheath_diameter: {
    label_he: "קוטר נדן עצב הראייה (ONSD, US 3מ\"מ מאחורי לגלגל)", region: "neuro", unit: "mm",
    bands: [
      { age_max_months: 12, normal: [null, 4.0], label: "תינוק (≤4.0)" },
      { age_max_months: 3000, normal: [null, 4.5], label: "ילד (≤4.5)" },
    ],
    note_he: "עלייה — סמן עקיף אפשרי ללחץ תוך-גולגולתי מוגבר. אינו מאבחן; מצריך הקשר קליני.",
  },
  common_bile_duct_diameter: {
    label_he: "קוטר צינור מרה משותף (CBD, US)", region: "abdomen", unit: "mm",
    bands: [
      { age_max_months: 1, normal: [null, 1.0], label: "יילוד (≤1)" },
      { age_max_months: 12, normal: [null, 2.0], label: "תינוק (≤2)" },
      { age_max_months: 3000, normal: [null, 4.0], label: "ילד (≤4)" },
    ],
    note_he: "הרחבה — חשד לחסימה ביליארית (אבן/ציסטה כולדוכאלית).",
  },
  prevertebral_c2_soft_tissue: {
    label_he: "רקמה רכה טרום-חולייתית C2", region: "neck_spine", unit: "mm",
    bands: [{ age_max_months: 3000, normal: [null, 7], label: "≤~7מ\"מ" }],
    note_he: "נמדד בצילום צוואר לטרלי בשאיפה. בכי עלול ליצור הרחבה מדומה.",
  },
};

/** Bladder expected capacity (mL) = (age_years + 2) × 30. Deterministic formula. */
export function bladderCapacityMl(ageYears) {
  if (!Number.isFinite(+ageYears)) return null;
  return Math.round((+ageYears + 2) * 30);
}

function pickBand(bands, ageMonths) {
  if (!bands || !bands.length) return null;
  if (!Number.isFinite(+ageMonths)) return bands[bands.length - 1]; // age unknown → widest/oldest band
  for (const b of bands) if (+ageMonths <= b.age_max_months) return b;
  return bands[bands.length - 1];
}

/**
 * Evaluate a measured value against the age-appropriate normal.
 * @returns {object|null} { key, label_he, value, unit, normal, verdict, age_band, source, verification_status }
 */
export function evaluateMeasurement(key, value, { ageMonths } = {}) {
  const m = RADIOLOGY_NORMALS[key];
  if (!m || !Number.isFinite(+value)) return null;
  const band = pickBand(m.bands, ageMonths);
  const [lo, hi] = band.normal;
  let verdict = "normal";
  if (hi != null && +value > hi) verdict = "above_normal";
  else if (lo != null && +value < lo) verdict = "below_normal";
  return {
    key,
    label_he: m.label_he,
    region: m.region,
    value: +value,
    unit: m.unit,
    normal: band.normal,
    age_band: band.label,
    verdict,
    note_he: m.note_he || null,
    source: RADIOLOGY_NORMALS_SOURCE,
    verification_status: "draft_needs_verification",
  };
}

/** Evaluate a batch of {key, value} measurements. */
export function evaluateMeasurements(measurements = [], ageInfo = {}) {
  return (measurements || [])
    .map((mm) => evaluateMeasurement(mm.key || mm.name, mm.value, ageInfo))
    .filter(Boolean);
}
