/**
 * עיבוד תמונה רדיולוגית — פונקציות טהורות על ImageData.
 *
 * ⚠ עיקרון-על: כל הפונקציות כאן הן **תצוגתיות בלבד**. הן אינן משנות את
 * הקובץ שהועלה, אינן נשלחות למנוע הפענוח, ואינן יוצרות מידע חדש —
 * הן רק ממפות מחדש ערכי אפור שכבר קיימים בתמונה. המקור נשמר תמיד.
 *
 * ⚠ למה אין כאן "הסרת איברים": צילום רנטגן הוא תמונת סכימה — כל פיקסל
 * הוא האינטגרל של כל מה שהקרן עברה דרכו. אין "שכבת לב" נפרדת שניתן
 * להחסיר, ולתסנין ולשולי הלב יש אותו ערך אפור בדיוק. סף אפור שמנסה
 * "להשאיר רק את הלא-תקין" ימחק ground-glass ותסנין מוקדם (שהם אפורים,
 * לא לבנים) וייצר שלילי-שגוי. לכן מפת הצפיפות כאן היא **שכבת צבע מעל
 * המקור** ולא תחליף לו.
 */

/** גבול העיבוד — מעליו מקטינים כדי לשמור על תגובתיות בנייד. */
export const MAX_PROCESS_DIM = 1600;

/** ממיר ImageData לערוץ אפור יחיד (Uint8ClampedArray באורך w*h). */
export function toGrayscale(imageData) {
  const { data, width, height } = imageData;
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // luminance לפי Rec.709 — צילומים רדיולוגיים בד"כ אפורים ממילא,
    // אבל קבצים שנסרקו או צולמו במצלמה עשויים לשאת סטייה קלה בערוצים.
    gray[p] = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
  }
  return gray;
}

/** כותב ערוץ אפור בחזרה ל-ImageData (משמר אלפא). */
export function grayToImageData(gray, width, height) {
  const out = new ImageData(width, height);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = gray[p];
    out.data[i] = v;
    out.data[i + 1] = v;
    out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}

/**
 * Window / Level — הפרימיטיב האמיתי של תחנת עבודה רדיולוגית.
 *
 * level = מרכז החלון (הערך שיוצג כאפור בינוני)
 * window = רוחב החלון (כמה טווח אפור נפרש על 0-255)
 *
 * חלון צר = ניגודיות גבוהה בטווח צר; חלון רחב = כל הטווח נראה אך שטוח.
 * זו הפעולה שמגלה תסנין מאחורי צל הלב, ששם ההפרש בין רקמות קטן.
 */
export function applyWindowLevel(gray, { level = 128, window = 255 }) {
  const out = new Uint8ClampedArray(gray.length);
  const w = Math.max(1, window);
  const lo = level - w / 2;
  const scale = 255 / w;
  // LUT — 256 חישובים במקום מיליוני.
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = (v - lo) * scale;
  for (let p = 0; p < gray.length; p++) out[p] = lut[gray[p]];
  return out;
}

/** גמא — מבהיר או מכהה את הטונים האמצעיים בלי לרסק את הקצוות. */
export function applyGamma(gray, gamma = 1) {
  if (gamma === 1) return gray;
  const out = new Uint8ClampedArray(gray.length);
  const lut = new Uint8ClampedArray(256);
  const inv = 1 / gamma;
  for (let v = 0; v < 256; v++) lut[v] = 255 * Math.pow(v / 255, inv);
  for (let p = 0; p < gray.length; p++) out[p] = lut[gray[p]];
  return out;
}

/** היפוך — מסייע בזיהוי קווי פנאומוטורקס, נקזים וצנתרים. */
export function applyInvert(gray) {
  const out = new Uint8ClampedArray(gray.length);
  for (let p = 0; p < gray.length; p++) out[p] = 255 - gray[p];
  return out;
}

/**
 * CLAHE — Contrast Limited Adaptive Histogram Equalization.
 *
 * הכלי בעל התשואה הגבוהה ביותר בצילום חזה: הוא מיישר ניגודיות
 * **מקומית**, ולכן חושף אזורים שנבלעים בתמונה גלובלית — מאחורי הלב,
 * מתחת לסרעפת, ובקודקודי הריאות.
 *
 * clipLimit מגביל את גובה ההיסטוגרמה לפני יישור, וזה מה שמונע
 * הגברת רעש פראית באזורים אחידים (זה ה-"Contrast Limited").
 */
export function applyCLAHE(gray, width, height, { tiles = 8, clipLimit = 3 } = {}) {
  // ⚠ אריח קטן מדי שובר את CLAHE: עם מעט פיקסלים, גבול הגזירה
  // מתנוון ל-1 וההיסטוגרמה נהרסת, מה שמייצר הבהרה פראית
  // ועלול לשטוף ממצא עדין. מגבילים את מספר האריחים כך
  // שכל אריח יהיה לפחות 32 פיקסלים בכל ציר.
  const MIN_TILE = 32;
  const maxTilesX = Math.max(1, Math.floor(width / MIN_TILE));
  const maxTilesY = Math.max(1, Math.floor(height / MIN_TILE));
  const tilesX = Math.max(1, Math.min(tiles, maxTilesX));
  const tilesY = Math.max(1, Math.min(tiles, maxTilesY));

  const tileW = Math.max(1, Math.floor(width / tilesX));
  const tileH = Math.max(1, Math.floor(height / tilesY));
  const nx = Math.ceil(width / tileW);
  const ny = Math.ceil(height / tileH);


  // מפת מיפוי (LUT) לכל אריח.
  const maps = new Array(nx * ny);

  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, width);
      const y1 = Math.min(y0 + tileH, height);

      const hist = new Uint32Array(256);
      let count = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * width;
        for (let x = x0; x < x1; x++) {
          hist[gray[row + x]]++;
          count++;
        }
      }

      // גזירה (clip) וחלוקה מחדש של העודף באופן אחיד.
      // רצפה של 4 פיקסלים לתא — מתחתיה הגזירה מוחקת את צורת
      // ההיסטוגרמה במקום להגביל אותה.
      if (clipLimit > 0 && count > 0) {
        const limit = Math.max(4, Math.floor((clipLimit * count) / 256));
        let excess = 0;
        for (let v = 0; v < 256; v++) {
          if (hist[v] > limit) {
            excess += hist[v] - limit;
            hist[v] = limit;
          }
        }
        const perBin = Math.floor(excess / 256);
        let remainder = excess - perBin * 256;
        for (let v = 0; v < 256; v++) {
          hist[v] += perBin;
          if (remainder > 0) {
            hist[v]++;
            remainder--;
          }
        }
      }

      // CDF → LUT, עם נירול ל-cdf_min.
      // ⚠ בלי חיסור cdf_min המיפוי מוסט כלפי מעלה — אריח כהה
      // ואחיד ממופה כמעט כולו ללבן. זו הצורה התקנית.
      const lut = new Uint8ClampedArray(256);
      let total = 0;
      for (let v = 0; v < 256; v++) total += hist[v];
      let cdfMin = 0;
      for (let v = 0; v < 256; v++) {
        if (hist[v] > 0) { cdfMin = hist[v]; break; }
      }
      const denom = total - cdfMin;
      if (denom > 0) {
        let cum = 0;
        for (let v = 0; v < 256; v++) {
          cum += hist[v];
          lut[v] = ((cum - cdfMin) / denom) * 255;
        }
      } else {
        // אריח אחיד לחלוטין — זהות, ולא מתיחה שתמציא ניגודיות יש מאין.
        for (let v = 0; v < 256; v++) lut[v] = v;
      }
      maps[ty * nx + tx] = lut;
    }
  }

  // אינטרפולציה בי-לינארית בין ארבעת האריחים הסמוכים —
  // בלעדיה נראים גבולות אריחים מלאכותיים שנקראים כממצא.
  const out = new Uint8ClampedArray(gray.length);
  for (let y = 0; y < height; y++) {
    const fy = (y - tileH / 2) / tileH;
    let ty0 = Math.floor(fy);
    let wy = fy - ty0;
    if (ty0 < 0) { ty0 = 0; wy = 0; }
    let ty1 = ty0 + 1;
    if (ty1 > ny - 1) { ty1 = ny - 1; if (ty0 > ny - 1) ty0 = ny - 1; wy = 0; }

    for (let x = 0; x < width; x++) {
      const fx = (x - tileW / 2) / tileW;
      let tx0 = Math.floor(fx);
      let wx = fx - tx0;
      if (tx0 < 0) { tx0 = 0; wx = 0; }
      let tx1 = tx0 + 1;
      if (tx1 > nx - 1) { tx1 = nx - 1; if (tx0 > nx - 1) tx0 = nx - 1; wx = 0; }

      const v = gray[y * width + x];
      const a = maps[ty0 * nx + tx0][v];
      const b = maps[ty0 * nx + tx1][v];
      const c = maps[ty1 * nx + tx0][v];
      const d = maps[ty1 * nx + tx1][v];
      out[y * width + x] =
        a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy;
    }
  }
  return out;
}

/** טשטוש בוקס מהיר (separable) — משמש כבסיס ל-unsharp mask. */
function boxBlur(gray, width, height, radius) {
  if (radius < 1) return gray;
  const tmp = new Uint8ClampedArray(gray.length);
  const out = new Uint8ClampedArray(gray.length);
  const span = radius * 2 + 1;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += gray[row + Math.min(width - 1, Math.max(0, x))];
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / span;
      const add = gray[row + Math.min(width - 1, x + radius + 1)];
      const sub = gray[row + Math.max(0, x - radius)];
      sum += add - sub;
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += tmp[Math.min(height - 1, Math.max(0, y)) * width + x];
    for (let y = 0; y < height; y++) {
      out[y * width + x] = sum / span;
      const add = tmp[Math.min(height - 1, y + radius + 1) * width + x];
      const sub = tmp[Math.max(0, y - radius) * width + x];
      sum += add - sub;
    }
  }
  return out;
}

/**
 * חידוד (Unsharp Mask) — מגביר קצוות: שוליים של תסנין, קווי צדר,
 * גבולות של פנאומוטורקס.
 *
 * ⚠ חידוד מגביר גם רעש ויכול לייצר הילה (halo) סביב מבנים בעלי
 * ניגודיות גבוהה — הילה כזו עלולה להיקרא בטעות כממצא. ערכים גבוהים
 * דורשים השוואה למקור.
 */
export function applyUnsharp(gray, width, height, { amount = 0, radius = 2 } = {}) {
  if (amount <= 0) return gray;
  const blurred = boxBlur(gray, width, height, radius);
  const out = new Uint8ClampedArray(gray.length);
  for (let p = 0; p < gray.length; p++) {
    out[p] = gray[p] + amount * (gray[p] - blurred[p]);
  }
  return out;
}

/**
 * מפת צפיפות — שכבת צבע שקופה מעל התמונה, המסמנת פיקסלים שערך
 * האפור שלהם נמצא בטווח שנבחר.
 *
 * ⚠ זו אינה זיהוי פתולוגיה. היא מסמנת **צפיפות**, ובצילום רנטגן
 * לצפיפות אין זהות: לתסנין, לשולי הלב, לשכמה, לשד ולקפל עור אותו
 * ערך אפור. לכן:
 *   • הסימון כולל תמיד מבנים תקינים (חיובי-שגוי).
 *   • ממצא אפור-בהיר — ground-glass, תסנין מוקדם — עלול ליפול מחוץ
 *     לטווח ולא להיצבע כלל (שלילי-שגוי).
 * המקור נשאר מתחת לשכבה ותמיד גלוי. אין להסיק מהיעדר צבע שאין ממצא.
 *
 * @returns ImageData — המקור עם שכבת צבע מעליו.
 */
export function buildDensityOverlay(gray, width, height, { low = 180, high = 255, opacity = 0.45, color = [239, 68, 68] } = {}) {
  const out = new ImageData(width, height);
  const [r, g, b] = color;
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = gray[p];
    const inBand = v >= low && v <= high;
    if (inBand) {
      out.data[i] = v * (1 - opacity) + r * opacity;
      out.data[i + 1] = v * (1 - opacity) + g * opacity;
      out.data[i + 2] = v * (1 - opacity) + b * opacity;
    } else {
      out.data[i] = v;
      out.data[i + 1] = v;
      out.data[i + 2] = v;
    }
    out.data[i + 3] = 255;
  }
  return out;
}

/**
 * מריץ את שרשרת העיבוד המלאה על ערוץ אפור.
 * הסדר מכוון: CLAHE (מקומי) → window/level (גלובלי) → גמא → חידוד → היפוך.
 */
export function processPipeline(baseGray, width, height, settings) {
  const {
    clahe = 0,
    claheTiles = 8,
    level = 128,
    window = 255,
    gamma = 1,
    sharpen = 0,
    invert = false,
  } = settings;

  let g = baseGray;
  if (clahe > 0) g = applyCLAHE(g, width, height, { tiles: claheTiles, clipLimit: clahe });
  if (level !== 128 || window !== 255) g = applyWindowLevel(g, { level, window });
  if (gamma !== 1) g = applyGamma(g, gamma);
  if (sharpen > 0) g = applyUnsharp(g, width, height, { amount: sharpen, radius: 2 });
  if (invert) g = applyInvert(g);
  return g;
}

/**
 * פריסטים — מקבילה לחלונות התצוגה של תחנת עבודה רדיולוגית.
 *
 * ⚠ בניגוד ל-CT, לצילום רנטגן רגיל (וגם לתמונה שצולמה במצלמה או
 * נסרקה) אין יחידות Hounsfield ואין כיול אבסולוטי. הערכים כאן הם
 * נקודות פתיחה על סולם 0-255 של התמונה שהועלתה, לא ערכים תקניים.
 * הם נועדו לחסוך זמן, לא להחליף התאמה ידנית.
 */
export const PRESETS = [
  { id: "original", labelKey: "viewer.preset_original", settings: { clahe: 0, level: 128, window: 255, gamma: 1, sharpen: 0, invert: false } },
  { id: "lung", labelKey: "viewer.preset_lung", settings: { clahe: 2.5, level: 110, window: 190, gamma: 1.1, sharpen: 0.4, invert: false } },
  { id: "mediastinum", labelKey: "viewer.preset_mediastinum", settings: { clahe: 3.5, level: 175, window: 110, gamma: 0.9, sharpen: 0.2, invert: false } },
  { id: "bone", labelKey: "viewer.preset_bone", settings: { clahe: 1.5, level: 200, window: 140, gamma: 0.8, sharpen: 0.8, invert: false } },
  { id: "softtissue", labelKey: "viewer.preset_soft", settings: { clahe: 3, level: 140, window: 150, gamma: 1.15, sharpen: 0.2, invert: false } },
  { id: "inverted", labelKey: "viewer.preset_inverted", settings: { clahe: 2, level: 128, window: 220, gamma: 1, sharpen: 0.3, invert: true } },
];

export const DEFAULT_SETTINGS = {
  clahe: 0,
  claheTiles: 8,
  level: 128,
  window: 255,
  gamma: 1,
  sharpen: 0,
  invert: false,
  overlayOn: false,
  overlayLow: 185,
  overlayHigh: 255,
  overlayOpacity: 0.45,
};

/** טוען קובץ/URL ל-canvas ומחזיר {gray, width, height} מוקטן לפי הצורך. */
export async function loadImageToGray(src) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });

  let { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_PROCESS_DIM / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  return { gray: toGrayscale(imageData), width: w, height: h };
}

/** היסטוגרמה ל-256 תאים — משמשת להצגת התפלגות הצפיפות. */
export function histogram(gray) {
  const hist = new Uint32Array(256);
  for (let p = 0; p < gray.length; p++) hist[gray[p]]++;
  return hist;
}
