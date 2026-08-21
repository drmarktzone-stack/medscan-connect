/**
 * DoctorPedAI — מאפיינים מורפולוגיים קשיחים לרדיולוגיה
 *
 * מבנה גרמי, תסנינים ריאתיים (מרקם), וצפיפויות יחסיות.
 * אין HU, אין מ״מ, אין אבחנה. כישלון → `{ ok:false }`.
 */

import {
  connectedComponents,
  failClosed,
  isImageDataLike,
  preprocessImage,
  round2,
} from './imagePreprocess.js';

const DRAFT = 'draft_needs_verification';

function binFractions(hist) {
  const total = hist.reduce((s, x) => s + x, 0) || 1;
  let air = 0;
  let soft = 0;
  let mineral = 0;
  for (let i = 0; i < 256; i++) {
    if (i <= 60) air += hist[i];
    else if (i <= 160) soft += hist[i];
    else mineral += hist[i];
  }
  return {
    lucent_like: round2(air / total),
    intermediate_like: round2(soft / total),
    dense_like: round2(mineral / total),
  };
}

/** שונות מקומית באזורים לוסנטיים — סמן מרקם, לא "תסנין". */
function lucentHeterogeneity(gray, lucentMask, w, h) {
  if (!lucentMask?.mask) return { ok: false, reason: 'no_lucent_mask' };
  const mask = lucentMask.mask;
  let n = 0;
  let sum = 0;
  let sum2 = 0;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64));
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const lap =
        Math.abs(gray[p] - gray[p - 1]) +
        Math.abs(gray[p] - gray[p + 1]) +
        Math.abs(gray[p] - gray[p - w]) +
        Math.abs(gray[p] - gray[p + w]);
      n += 1;
      sum += lap;
      sum2 += lap * lap;
    }
  }
  if (n < 16) return { ok: false, reason: 'insufficient_lucent_samples' };
  const mean = sum / n;
  const variance = Math.max(0, sum2 / n - mean * mean);
  return {
    ok: true,
    sample_count: n,
    edge_mean: round2(mean),
    edge_variance: round2(variance),
    elevated: variance > 80 && mean > 12,
  };
}

/**
 * @param {object} imageData ImageData-like
 */
export function extractRadiologyFeatures(imageData) {
  if (!isImageDataLike(imageData)) return failClosed('invalid_image');

  const pre = preprocessImage(imageData, { mode: 'radiology' });
  if (!pre.ok) return pre;

  const { width: w, height: h, gray, hist, bone_mask: bone, lucent_mask: lucent } = pre;
  const densities = binFractions(hist);

  let boneStructure = {
    relative_dense_fraction: densities.dense_like,
    connected_components: 0,
    largest_relative_area: 0,
    verification_status: 'measured',
    note_he: 'מבנה גרמי כפיקסלים בהירים יחסית — לא מדידת עצם ולא יחידות Hounsfield.',
  };
  if (bone?.ok && bone.mask) {
    const comps = connectedComponents(bone.mask, w, h, { minArea: Math.max(8, Math.round(w * h * 0.002)) });
    const largest = comps[0];
    boneStructure = {
      ...boneStructure,
      connected_components: comps.length,
      largest_relative_area: largest ? round2(largest.area / (w * h)) : 0,
      coverage: bone.coverage,
    };
  }

  const het = lucentHeterogeneity(gray, lucent, w, h);
  const infiltrateTexture = {
    ok: het.ok,
    elevated: het.ok ? het.elevated : false,
    edge_mean: het.ok ? het.edge_mean : null,
    edge_variance: het.ok ? het.edge_variance : null,
    verification_status: DRAFT,
    note_he:
      'מרקם באזורים לוסנטיים (חשד לתסנין) הוא סמן יחסי בטיוטה. אינו אבחנת דלקת ריאות ואינו מחליף קריאת רדיולוג.',
  };

  if (densities.lucent_like < 0.02 && densities.dense_like < 0.02) {
    return failClosed('density_spectrum_unreliable', { densities, entropy: pre.entropy });
  }

  return {
    ok: true,
    modality: 'radiology',
    image_width_px: w,
    image_height_px: h,
    bone_structure: boneStructure,
    pulmonary_infiltrate_texture: infiltrateTexture,
    densities: {
      ...densities,
      unit: 'relative_pixel_fraction',
      verification_status: 'measured',
      note_he: 'שלישיית צפיפות יחסית (לוסנטי / בינוני / צפוף) — לא יחידות Hounsfield.',
    },
    entropy: pre.entropy,
    measurement_source: 'cv',
    verification_status: 'measured',
    note_he: 'מאפייני הדמיה דטרמיניסטיים יחסיים. אין מ״מ ואין אבחנה.',
  };
}

export function radiologyFeaturesToPatientFacts(features) {
  if (!features?.ok) return [];
  return [
    { key: 'rad_dense_fraction', label_he: 'שבר פיקסלים צפופים (יחסי)', value: features.densities?.dense_like, unit: 'fraction' },
    { key: 'rad_lucent_fraction', label_he: 'שבר פיקסלים לוסנטיים (יחסי)', value: features.densities?.lucent_like, unit: 'fraction' },
    { key: 'rad_bone_components', label_he: 'רכיבי מבנה גרמי מחוברים', value: features.bone_structure?.connected_components, unit: null },
    {
      key: 'rad_infiltrate_texture',
      label_he: 'מרקם לוסנטי (טיוטת תסנין)',
      value: features.pulmonary_infiltrate_texture?.elevated ? 'elevated' : 'not_elevated',
      unit: null,
    },
  ].filter((f) => f.value != null);
}
