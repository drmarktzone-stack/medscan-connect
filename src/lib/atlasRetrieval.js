/**
 * ============================================================================
 *  MedScan AI — Shared Atlas Retrieval (deterministic, cross-modality)
 * ============================================================================
 *  One retrieval layer for ECG / radiology / skin reference atlases. Given a
 *  finding (category + tags + free-text keywords) it ranks the reference cases
 *  by overlap and returns the top matches WITH images for side-by-side visual
 *  comparison. Ranking is pure code (transparent, auditable) and it only ever
 *  surfaces VERIFIED, licensed reference images.
 *
 *  Population of the atlases awaits licensed datasets (PTB-XL/MIT-BIH for ECG,
 *  MIMIC-CXR/CheXpert/NIH for radiology, ISIC/PAD-UFES for skin). This module
 *  is the reusable engine that lights up the moment images are added.
 * ============================================================================
 */

const STOP = new Set(["the", "and", "with", "for", "של", "עם", "או", "לא", "the", "a"]);

export function keywords(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9֐-׿]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

/**
 * Deterministic similarity score between a query and a reference case.
 * category exact match (+3) + tag Jaccard (×4) + keyword overlap (×2).
 */
export function matchScore(query = {}, ref = {}) {
  let score = 0;
  const reasons = [];
  if (query.category && ref.category && query.category === ref.category) {
    score += 3;
    reasons.push("קטגוריה תואמת");
  }
  const tagJ = jaccard(query.tags || [], ref.tags || []);
  if (tagJ > 0) {
    score += tagJ * 4;
    reasons.push(`חפיפת תגיות ${(tagJ * 100).toFixed(0)}%`);
  }
  const qk = query.keywords || keywords(`${query.text || ""}`);
  const rk = keywords(`${ref.diagnosis || ""} ${ref.key_features || ""} ${ref.title || ""}`);
  const kw = jaccard(qk, rk);
  if (kw > 0) {
    score += kw * 2;
    reasons.push("חפיפת מונחים");
  }
  return { score: Math.round(score * 100) / 100, reasons };
}

/**
 * Retrieve the top-K most similar reference cases for visual comparison.
 * @param {object} p
 * @param {object} p.query       { category, tags, text|keywords }
 * @param {object[]} p.cases     reference KB rows (ECGCase/SkinCase/RadiologyCase)
 * @param {number} [p.topK=5]
 * @param {boolean} [p.requireImage=true]   only return cases that have an image
 * @param {boolean} [p.verifiedOnly=true]   only surface verified reference cases
 */
export function retrieveSimilar({ query = {}, cases = [], topK = 5, requireImage = true, verifiedOnly = true } = {}) {
  const pool = (cases || []).filter((c) => {
    if (verifiedOnly && c.verification_status !== "verified") return false;
    if (requireImage && !c.image_url) return false;
    return true;
  });
  const ranked = pool
    .map((c) => {
      const { score, reasons } = matchScore(query, c);
      return { case: c, score, reasons };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return {
    matches: ranked,
    count: ranked.length,
    pool_size: pool.length,
    note_he: pool.length === 0 ? "אין מקרי-ייחוס מאומתים עם תמונה לקטגוריה זו (המאגר עדיין לא אוכלס)." : null,
  };
}

/**
 * Generic atlas-record validator for ANY modality (copyright/provenance gate).
 * An image without a source + license never enters the atlas.
 */
export function validateAtlasRecord(rec = {}) {
  const errors = [];
  if (!rec.title) errors.push("חסר title");
  if (!rec.diagnosis) errors.push("חסר diagnosis");
  if (rec.image_url && !rec.image_source) errors.push("חסר image_source");
  if (rec.image_url && !rec.license) errors.push("חסר license");
  const record = {
    title: rec.title,
    diagnosis: rec.diagnosis,
    category: rec.category || "other",
    key_features: rec.key_features || "",
    diagnostic_criteria: rec.diagnostic_criteria || "",
    tags: Array.isArray(rec.tags) ? rec.tags : [],
    description: rec.description || "",
    image_url: rec.image_url || "",
    image_source: rec.image_source || "",
    license: rec.license || "",
    verification_status: "draft_needs_verification",
    urgent: !!rec.urgent,
  };
  return { ok: errors.length === 0, errors, record };
}
