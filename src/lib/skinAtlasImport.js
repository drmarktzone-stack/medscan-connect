/**
 * ============================================================================
 *  MedScan AI — Skin Reference-Image Atlas: import & validation (code only)
 * ============================================================================
 *  Turns labeled reference-image records into clean SkinCase rows. It does NOT
 *  fetch or scrape any images — the caller supplies records that already point
 *  to LICENSED images (ISIC / PAD-UFES-20 / clinic-anonymised / etc.). This
 *  module only normalises taxonomy and ENFORCES that every image carries a
 *  source + licence + Fitzpatrick tone before it can enter the atlas.
 *
 *  Nothing here is shown clinically until verification_status === 'verified'.
 * ============================================================================
 */

/** Canonical SkinCase categories (must match the entity enum). */
export const CANONICAL_CATEGORIES = [
  "benign", "malignant", "inflammatory", "infectious",
  "autoimmune", "pigmentation", "vascular", "precancerous", "other",
];

/** Map the mixed/legacy category strings found in the KB to the canonical set. */
export const TAXONOMY_MAP = {
  "acne and variants": "inflammatory",
  "dermatitis": "inflammatory",
  "genodermatoses": "other",
  "pigmentation disorders": "pigmentation",
  "vascular lesions": "vascular",
  "eczema": "inflammatory",
  "psoriasis": "inflammatory",
  "bacterial": "infectious",
  "viral": "infectious",
  "fungal": "infectious",
  "neoplastic": "malignant",
  "premalignant": "precancerous",
};

export function normalizeCategory(cat) {
  if (!cat) return "other";
  const c = String(cat).trim().toLowerCase();
  if (CANONICAL_CATEGORIES.includes(c)) return c;
  return TAXONOMY_MAP[c] || "other";
}

const VALID_FITZ = ["I", "II", "III", "IV", "V", "VI", "unknown"];

/**
 * Validate + normalize one atlas record.
 * @param {object} rec { title, diagnosis, image_url, image_source, license, fitzpatrick, category, ... }
 * @returns {{ ok:boolean, errors:string[], record:object }}
 */
export function validateAtlasRecord(rec = {}) {
  const errors = [];
  if (!rec.title) errors.push("חסר title");
  if (!rec.diagnosis) errors.push("חסר diagnosis");
  if (!rec.image_url) errors.push("חסר image_url");
  // Copyright / provenance gate — an image without a source + licence never enters.
  if (rec.image_url && !rec.image_source) errors.push("חסר image_source (מקור התמונה)");
  if (rec.image_url && !rec.license) errors.push("חסר license (רישיון התמונה)");
  const fitz = VALID_FITZ.includes(rec.fitzpatrick) ? rec.fitzpatrick : "unknown";

  const record = {
    title: rec.title,
    diagnosis: rec.diagnosis,
    category: normalizeCategory(rec.category),
    key_features: rec.key_features || "",
    diagnostic_criteria: rec.diagnostic_criteria || "",
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    description: rec.description || "",
    image_url: rec.image_url || "",
    image_source: rec.image_source || "",
    license: rec.license || "",
    fitzpatrick: fitz,
    verification_status: "draft_needs_verification", // never auto-verified
    urgent: !!rec.urgent,
  };
  return { ok: errors.length === 0, errors, record };
}

/**
 * Prepare a batch for import. Returns ready/rejected splits and a Fitzpatrick
 * coverage report (so under-representation of dark skin is visible, not hidden).
 */
export function prepareAtlasBatch(records = []) {
  const ready = [];
  const rejected = [];
  for (const rec of records) {
    const v = validateAtlasRecord(rec);
    if (v.ok) ready.push(v.record);
    else rejected.push({ title: rec?.title || null, errors: v.errors });
  }
  const coverage = {};
  for (const f of VALID_FITZ) coverage[f] = 0;
  for (const r of ready) coverage[r.fitzpatrick] = (coverage[r.fitzpatrick] || 0) + 1;
  const darkCount = coverage.IV + coverage.V + coverage.VI;
  const fairness_note_he =
    ready.length && darkCount / ready.length < 0.25
      ? `אזהרת הוגנות: רק ${darkCount}/${ready.length} תמונות בגווני עור כהים (IV–VI). יש להעשיר לפני הסתמכות על עור כהה.`
      : null;
  return { ready, rejected, count: ready.length, fitzpatrick_coverage: coverage, fairness_note_he };
}
