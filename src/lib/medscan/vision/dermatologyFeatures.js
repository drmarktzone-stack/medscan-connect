/**
 * DoctorPedAI — מאפיינים מורפולוגיים קשיחים לדרמטולוגיה
 *
 * גבולות נגע, צבע, פיזור, נגעים לווייניים.
 * עוטף את `skinMorphometry` (Otsu / compactness / asymmetry / color clusters).
 * אין אבחנה, אין מ״מ בלי סולם, כישלון → `{ ok:false }`.
 */

import {
  asymmetryIndex,
  colorClusters,
  compactness,
  maskPerimeter,
} from '../../skinMorphometry.js';
import {
  connectedComponents,
  failClosed,
  isImageDataLike,
  preprocessImage,
  round2,
} from './imagePreprocess.js';

const DRAFT = 'draft_needs_verification';

function lesionRgbList(imageData, mask) {
  const { data } = imageData;
  const rgb = [];
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    rgb.push([data[i], data[i + 1], data[i + 2]]);
  }
  return rgb;
}

function meanColor(rgbList) {
  if (!rgbList.length) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [rr, gg, bb] of rgbList) {
    r += rr;
    g += gg;
    b += bb;
  }
  const n = rgbList.length;
  return {
    r: Math.round(r / n),
    g: Math.round(g / n),
    b: Math.round(b / n),
  };
}

function quadrantOccupancy(mask, w, h) {
  const midX = w / 2;
  const midY = h / 2;
  const q = [0, 0, 0, 0];
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      total += 1;
      const col = x < midX ? 0 : 1;
      const row = y < midY ? 0 : 2;
      q[row + col] += 1;
    }
  }
  if (!total) return { fractions: [0, 0, 0, 0], occupied_quadrants: 0 };
  const fractions = q.map((c) => round2(c / total));
  const occupied = fractions.filter((f) => f >= 0.05).length;
  return { fractions, occupied_quadrants: occupied };
}

/**
 * לוויינים: רכיבים קטנים ליד הנגע הראשי, לא חלק ממנו.
 * יחסי בלבד — לא אבחנה של "satellite lesions" קלינית.
 */
export function detectSatelliteLesions(mask, w, h) {
  const comps = connectedComponents(mask, w, h, { minArea: Math.max(4, Math.round(w * h * 0.0005)) });
  if (!comps.length) {
    return { count: 0, satellites: [], verification_status: DRAFT };
  }
  const main = comps[0];
  const mainDiam = Math.max(main.width, main.height);
  const satellites = [];
  for (let i = 1; i < comps.length; i++) {
    const c = comps[i];
    const ratio = c.area / main.area;
    if (ratio < 0.005 || ratio > 0.35) continue;
    const dx = c.cx - main.cx;
    const dy = c.cy - main.cy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < mainDiam * 0.15) continue; // כנראה אותו נגע
    if (dist > mainDiam * 3.5) continue; // רחוק מדי בשדה
    satellites.push({
      relative_area: round2(ratio),
      distance_px: round2(dist),
      cx: round2(c.cx),
      cy: round2(c.cy),
    });
  }
  return {
    count: satellites.length,
    satellites,
    main_component_area: main.area,
    component_count: comps.length,
    verification_status: DRAFT,
    note_he: 'נגעים לווייניים כמדד מרחבי בפיקסלים — טיוטה לאימות קליני, אינו אבחנה.',
  };
}

/**
 * @param {object} imageData ImageData-like
 * @param {{ pxPerMm?: number }} [opts]
 */
export function extractDermatologyFeatures(imageData, { pxPerMm = null } = {}) {
  if (!isImageDataLike(imageData)) return failClosed('invalid_image');

  const pre = preprocessImage(imageData, { mode: 'dermatology' });
  if (!pre.ok) return pre;

  const { width: w, height: h, lesion_mask: mask, lesion_area: area } = pre;
  const perim = maskPerimeter(mask, w, h);
  const border = compactness(area, perim);
  const asymmetry = asymmetryIndex(mask, w, h);
  const rgb = lesionRgbList(imageData, mask);
  const clusters = colorClusters(rgb);
  const mean = meanColor(rgb);
  const distribution = quadrantOccupancy(mask, w, h);
  const satellites = detectSatelliteLesions(mask, w, h);

  let minX = w;
  let maxX = 0;
  let minY = h;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const diamPx = Math.max(maxX - minX, maxY - minY);

  return {
    ok: true,
    modality: 'dermatology',
    scale_unknown: !pxPerMm,
    image_width_px: w,
    image_height_px: h,
    borders: {
      compactness: border,
      perimeter_px: perim,
      irregular: border != null && border > 1.6,
      verification_status: 'measured',
    },
    color: {
      cluster_count: clusters,
      mean_rgb: mean,
      variegated: clusters >= 3,
      verification_status: 'measured',
    },
    distribution: {
      occupied_quadrants: distribution.occupied_quadrants,
      quadrant_fractions: distribution.fractions,
      pattern_he: distribution.occupied_quadrants >= 3 ? 'מפושט בשדה התמונה' : 'ממוקד בשדה התמונה',
      verification_status: 'measured',
      note_he: 'פיזור במישור התמונה בלבד — לא פיזור אנטומי גופני.',
    },
    satellite_lesions: satellites,
    diameter_px: diamPx,
    diameter_mm: pxPerMm ? round2(diamPx / pxPerMm) : null,
    asymmetry_index: asymmetry,
    coverage: pre.lesion_coverage,
    measurement_source: 'cv',
    verification_status: 'measured',
    note_he: pxPerMm
      ? null
      : 'אין סמן קנה-מידה — מאפיינים יחסיים בלבד, ללא מ״מ מוחלטים. אינו אבחנה.',
  };
}

/** פריטי P# למדידות מורפולוגיות (תצפית, לא ידע). */
export function dermatologyFeaturesToPatientFacts(features) {
  if (!features?.ok) return [];
  const facts = [
    { key: 'derm_border_compactness', label_he: 'אי-סדירות גבול (compactness)', value: features.borders?.compactness, unit: null },
    { key: 'derm_color_clusters', label_he: 'אשכולות צבע בנגע', value: features.color?.cluster_count, unit: null },
    { key: 'derm_asymmetry', label_he: 'מדד אסימטריה', value: features.asymmetry_index, unit: null },
    { key: 'derm_satellites', label_he: 'רכיבים לווייניים (יחסי)', value: features.satellite_lesions?.count ?? 0, unit: null },
    { key: 'derm_distribution', label_he: 'פיזור בשדה התמונה', value: features.distribution?.pattern_he, unit: null },
  ];
  if (features.diameter_mm != null) {
    facts.push({ key: 'derm_diameter_mm', label_he: 'קוטר נגע', value: features.diameter_mm, unit: 'mm' });
  } else {
    facts.push({ key: 'derm_diameter_px', label_he: 'קוטר נגע (פיקסלים)', value: features.diameter_px, unit: 'px' });
  }
  return facts.filter((f) => f.value != null);
}
