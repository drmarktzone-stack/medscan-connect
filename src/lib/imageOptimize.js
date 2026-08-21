/**
 * ============================================================================
 *  MedScan AI — Client-side image optimization (speed) + ECG auto-orientation
 * ============================================================================
 *  Claude's vision models downscale every image to ~1568px on the long edge
 *  (≈1.15 MP) BEFORE analysis, regardless of what you send. A 4000px, 5 MB
 *  phone photo is therefore resized server-side anyway — you only pay for the
 *  slow upload and the extra resize latency, with ZERO diagnostic benefit.
 *
 *  This module downscales to exactly that target on-device before upload:
 *    • Faster upload (200–400 KB instead of 3–6 MB).
 *    • No server-side resize step.
 *    • Pixel content the model sees is unchanged → identical reading quality.
 *
 *  autoLandscape (ECG): an ECG tracing is landscape by nature. A photo taken
 *  in portrait (height > width) is rotated 90° so the strip is horizontal
 *  before analysis — the orientation the reader expects. Applied ONLY where
 *  the caller opts in (ECG), never to chest films or skin photos.
 *
 *  Safeguards (so we never degrade a reading):
 *    • Only touches raster images — PDFs and non-images pass through untouched.
 *    • Never upscales; downscales only when above target.
 *    • High-quality smoothing + JPEG q=0.92 to preserve fine detail (ECG grid).
 *    • Any failure → returns the original file (fail-open, never blocks).
 * ============================================================================
 */

const DEFAULT_MAX_DIM = 1568;   // Claude vision long-edge target
const DEFAULT_QUALITY = 0.92;   // high — preserves fine clinical detail
const MIN_BYTES = 350 * 1024;   // below this, downscale isn't worth it

function loadImageEl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Downscale (and optionally auto-rotate to landscape) a raster image File.
 * Returns a new File, or the original if nothing needs doing.
 * @param {File} file
 * @param {{maxDim?:number, quality?:number, autoLandscape?:boolean}} [opts]
 * @returns {Promise<File>}
 */
export async function downscaleImageFile(
  file,
  { maxDim = DEFAULT_MAX_DIM, quality = DEFAULT_QUALITY, autoLandscape = false } = {}
) {
  let objUrl = null;
  try {
    if (typeof document === "undefined") return file;
    if (!file || !file.type || !file.type.startsWith("image/")) return file; // PDFs etc.
    if (file.type === "image/gif") return file;

    // Load pixels + dimensions.
    let source, w, h;
    if (typeof createImageBitmap === "function") {
      try { source = await createImageBitmap(file); w = source.width; h = source.height; } catch { source = null; }
    }
    if (!source) {
      objUrl = URL.createObjectURL(file);
      const img = await loadImageEl(objUrl);
      source = img; w = img.naturalWidth; h = img.naturalHeight;
    }
    if (!w || !h) return file;

    const rotate = autoLandscape && h > w;             // portrait ECG → make it landscape
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const smallEnough = file.size < MIN_BYTES || scale >= 1;

    // Nothing to do: not rotating and already small/at-target.
    if (!rotate && smallEnough) { if (source.close) source.close(); return file; }

    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    if (rotate) {
      // 90° rotation: swap canvas dims, map source (x,y) → (nh - y, x).
      canvas.width = nh;
      canvas.height = nw;
      ctx.setTransform(0, 1, -1, 0, nh, 0);
      ctx.drawImage(source, 0, 0, nw, nh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      canvas.width = nw;
      canvas.height = nh;
      ctx.drawImage(source, 0, 0, nw, nh);
    }
    if (source.close) source.close();

    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) return file;
    // If we only downscaled (no rotation) and gained nothing, keep the original.
    if (!rotate && blob.size >= file.size) return file;

    const baseName = (file.name || "image").replace(/\.[^.]+$/, "");
    return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file; // fail-open: never block an analysis over optimization
  } finally {
    if (objUrl) URL.revokeObjectURL(objUrl);
  }
}

/** Downscale a list of files (images optimized, others untouched), concurrently. */
export async function downscaleImageFiles(files = [], opts) {
  return Promise.all((files || []).map((f) => downscaleImageFile(f, opts)));
}
