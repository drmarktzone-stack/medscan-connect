/**
 * ============================================================================
 *  MedScan AI — PDF → page images (client-side, for OCR/vision scanning)
 * ============================================================================
 *  Lab reports arrive as PDFs (e.g. Clalit online printouts) as often as photos.
 *  Vision/OCR models read IMAGES, not PDFs — so we render each PDF page to a
 *  JPEG in the browser with pdf.js. Works for BOTH text PDFs and scanned PDFs,
 *  so the lab scanner becomes format-agnostic.
 *
 *  Fail-open: any error → returns [] and the caller falls back to sending the
 *  original file, so a PDF is never silently dropped.
 * ============================================================================
 */

import * as pdfjsLib from "pdfjs-dist";
// העובד מוטבע (inline) כ-blob בתוך ה-bundle — אין קובץ .mjs נפרד שהשרת
// עלול להגיש עם MIME שגוי (הסיבה הנפוצה לכשל pdf.js ב-production).
import PdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker&inline";

try {
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfjsWorker();
} catch (e) {
  console.error("pdf.js worker init failed", e);
}

const isPdf = (file) =>
  !!file && (file.type === "application/pdf" || /\.pdf$/i.test(file.name || ""));

/**
 * Render every page of a PDF File to a JPEG File.
 * @param {File} file
 * @param {{maxPages?:number, targetWidth?:number, quality?:number}} [opts]
 * @returns {Promise<File[]>} one JPEG File per page (empty on failure / not a PDF)
 */
export async function pdfToImages(file, { maxPages = 10, targetWidth = 1600, quality = 0.9 } = {}) {
  if (!isPdf(file) || typeof document === "undefined") return [];
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    const pageCount = Math.min(pdf.numPages || 1, maxPages);
    const baseName = (file.name || "lab").replace(/\.pdf$/i, "");
    const out = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      // Scale so the rendered page is ~targetWidth px wide (sharp enough for OCR).
      const scale = Math.max(1, Math.min(3, targetWidth / base.width));
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      // White background — lab PDFs are black text on transparent; JPEG needs a bg.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport }).promise;

      const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (blob) {
        out.push(new File([blob], `${baseName}_p${i}.jpg`, { type: "image/jpeg", lastModified: Date.now() }));
      }
      if (page.cleanup) page.cleanup();
    }
    try { await pdf.cleanup?.(); } catch { /* ignore */ }
    return out;
  } catch (e) {
    console.error("pdfToImages failed", e);
    return [];
  }
}

/**
 * Extract the embedded text of a (digital) PDF, page by page. No canvas.
 * Returns "" for scanned/image PDFs (no text layer) or on failure — the caller
 * then falls back to rendering pages to images + OCR.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function pdfExtractText(file, { maxPages = 12 } = {}) {
  if (!isPdf(file)) return "";
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
    const n = Math.min(pdf.numPages || 1, maxPages);
    let text = "";
    for (let i = 1; i <= n; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((x) => (x.str || "")).join(" ") + "\n";
      if (page.cleanup) page.cleanup();
    }
    try { await pdf.cleanup?.(); } catch { /* ignore */ }
    return text.trim();
  } catch (e) {
    console.error("pdfExtractText failed", e);
    return "";
  }
}

export { isPdf };
