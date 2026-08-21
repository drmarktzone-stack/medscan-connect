/**
 * ============================================================================
 *  MedScan AI — Lab Report Scanner (Vision extraction, zero-hallucination)
 * ============================================================================
 *  Reads a photographed / scanned / PDF lab report and extracts each analyte,
 *  value, unit and reference range into structured rows so the physician does
 *  not type them by hand.
 *
 *  ⚠ ANTI-HALLUCINATION — the whole point of this module:
 *    - The model returns ONLY what is clearly legible. Anything it cannot read
 *      with confidence is returned as value=null / confidence="unreadable" —
 *      it NEVER guesses a number. A blank is safe; a wrong number is not.
 *    - Every extracted row is a DRAFT. Nothing enters the interpreter until the
 *      physician reviews/confirms it in the UI. Low-confidence and blank rows
 *      are flagged for manual entry.
 *    - Canonical analyte matching is DETERMINISTIC (analyteCatalog), not by the
 *      model — so "Hb"/"המוגלובין"/"HGB" map to the same field in code.
 * ============================================================================
 */

import { resolveAnalyte } from "./medscan/deterministic/analyteCatalog";

export const LAB_SCAN_SCHEMA = {
  type: "object",
  properties: {
    is_lab_report: {
      type: "boolean",
      description: "true only if the image clearly appears to be a laboratory results report/sheet. If it is not, return false and an empty rows array.",
    },
    patient: {
      type: "object",
      properties: {
        age_text: { type: "string", description: "Patient age exactly as printed if visible (e.g. '5 y', '18 months'); else empty string." },
        sex: { type: "string", enum: ["male", "female", ""], description: "Only if explicitly printed; else empty." },
        report_date: { type: "string", description: "Report/collection date as printed if visible; else empty." },
      },
    },
    rows: {
      type: "array",
      description: "One entry per test line that is visible on the report.",
      items: {
        type: "object",
        properties: {
          analyte_raw: { type: "string", description: "Test name EXACTLY as printed (do not translate or normalize)." },
          value: { type: ["number", "null"], description: "The numeric result ONLY if clearly legible. If not clearly legible, or non-numeric, return null. NEVER guess or infer a number." },
          value_text: { type: "string", description: "For qualitative/textual results (e.g. 'Positive','Negative','Not detected') as printed; else empty." },
          unit: { type: "string", description: "Unit exactly as printed (e.g. 'g/dL','10^9/L'); empty if not printed/legible." },
          ref_low: { type: ["number", "null"], description: "Lower reference bound as a NUMBER if printed (e.g. the 40 in '40-60', or the X in '>X'). One-sided upper limits ('<200','up to 5','עד 5') have NO lower bound -> null. NEVER use 0 to mean 'absent' — use null." },
          ref_high: { type: ["number", "null"], description: "Upper reference bound as a NUMBER if printed (e.g. the 60 in '40-60', the 200 in '<200', the 5 in 'up to 5'/'עד 5'). One-sided lower limits ('>40') have NO upper bound -> null. NEVER use 0 to mean 'absent' — use null." },
          ref_range_text: { type: "string", description: "The reference range EXACTLY as printed, verbatim (e.g. '<200', '>40', '40-60', 'up to 5', 'עד 5', '0.3-1.2'); empty if none printed. This raw text is parsed deterministically as a fallback." },
          flag_printed: { type: "string", description: "Any H/L/* abnormal flag printed next to the value; else empty." },
          confidence: { type: "string", enum: ["high", "medium", "low", "unreadable"], description: "Your legibility confidence for THIS row's value. Use 'unreadable' (with value=null) when you cannot read the number reliably." },
        },
        required: ["analyte_raw", "confidence"],
      },
    },
  },
  required: ["is_lab_report", "rows"],
};

const SCAN_PROMPT = `אתה קורא/ת בזהירות דף תוצאות מעבדה (צילום מודפס, צילום-מסך, PDF, או כתב-יד).

חלץ/י כל שורת-בדיקה שנראית בדף: שם הבדיקה בדיוק כפי שמודפס (analyte_raw), הערך (value), היחידה (unit), וטווח-הייחוס אם מודפס.

## טווח-הייחוס (קריטי — שגיאות כאן גורמות לסימון שגוי של גבוה/נמוך):
- מלא/י תמיד גם את ref_range_text — מחרוזת הטווח בדיוק כפי שמודפסת (למשל "<200", ">40", "40-60", "עד 5").
- טווח דו-צדדי "X-Y" → ref_low=X, ref_high=Y.
- גבול עליון בלבד: "<200", "≤200", "עד 200", "up to 200" → ref_high=200, ref_low=null.
- גבול תחתון בלבד: ">40", "≥40" → ref_low=40, ref_high=null.
- **לעולם אל תשתמש/י ב-0 כדי לציין "אין גבול".** אם אין גבול — null. (0 כגבול-עליון הופך כל ערך ל"גבוה".)

חוק-ברזל למניעת טעויות (קריטי):
- החזר/י ערך מספרי **רק אם הוא קריא בבירור**. אם ספרה מטושטשת, חתוכה, או לא ודאית — החזר/י value=null ו-confidence="unreadable". **אסור לנחש מספר.** עדיף שדה ריק מאשר מספר שגוי.
- אל תמציא/י בדיקות שלא רואים, ואל תשלים/י ערכים מהזיכרון/מהידע הכללי.
- תוצאה איכותית (חיובי/שלילי/לא נמצא) → value_text, ו-value=null.
- שמור/י יחידות וטווחים בדיוק כפי שמודפסים; אם לא מודפס/לא קריא — השאר/י ריק/null.
- confidence לכל שורה משקף עד כמה הערך קריא: high/medium/low/unreadable.

אם התמונה אינה דף מעבדה — החזר/י is_lab_report=false ו-rows ריק.

## שלמות החילוץ (מניעת פספוס):
- חלץ/י **כל שורה נראית** בדף — אל תדלג/י ואל תאחד/י בדיקות שונות לשורה אחת. שמות דומים (LDL מול Non-HDL, נויטרופילים % מול מוחלט) הם בדיקות נפרדות.
- אל תתרגם/י ואל תשנה/י את analyte_raw — העתק/י בדיוק כפי שמודפס, כולל אותיות גדולות וסוגריים.

החזר/י אך ורק JSON התואם לסכמה.`;

/**
 * @param {object} p
 * @param {string[]} p.fileUrls  uploaded image/pdf urls
 * @param {function} p.invokeLLM vision invoker (createVisionInvokeLLM)
 * @param {string} [p.model]
 * @returns {Promise<{ok:boolean, is_lab_report:boolean, patient:object, rows:object[], stats:object, note_he:string}>}
 */
export async function runLabScan({ fileUrls = [], text = "", invokeLLM, model } = {}) {
  const hasText = typeof text === "string" && text.trim().length > 0;
  if (!fileUrls.length && !hasText) return { ok: false, reason: "no_file", note_he: "לא סופק קובץ לסריקה." };
  if (typeof invokeLLM !== "function") return { ok: false, reason: "no_invoker", note_he: "מנוע הסריקה אינו זמין." };

  // מסלול טקסט: כש-PDF טקסטואלי חולץ בצד-הלקוח — מפענחים את הטקסט ישירות
  // (מדויק ואמין יותר מ-OCR על תמונה). אחרת — מסלול הראייה על התמונה.
  const raw = await invokeLLM({
    prompt: hasText
      ? `${SCAN_PROMPT}\n\n## טקסט שחולץ מדף-המעבדה (פענח/י את הטבלה מתוך הטקסט הבא; הטקסט עברי RTL — שים/י לב לסדר):\n"""\n${text}\n"""`
      : SCAN_PROMPT,
    ...(hasText ? {} : { file_urls: fileUrls }),
    response_json_schema: LAB_SCAN_SCHEMA,
    model,
  });

  return finalizeScan(raw);
}

/**
 * Turn a raw scan/extract object ({is_lab_report?, patient?, rows[]}) into the
 * final scan result. Shared by BOTH the vision path and the server-side
 * ExtractDataFromUploadedFile path.
 */
export function finalizeScan(raw) {
  if (!raw || raw.is_lab_report === false) {
    return {
      ok: false,
      is_lab_report: false,
      rows: [],
      note_he: "הקובץ אינו נראה כדף מעבדה. העלה/י דף תוצאות ברור, או הזן/י ידנית.",
    };
  }
  const rows = mapScanRows(raw.rows || []);
  if (!rows.length) {
    return { ok: false, is_lab_report: raw.is_lab_report !== false, rows: [], note_he: "לא זוהו שורות-בדיקה בקובץ." };
  }
  const stats = {
    total: rows.length,
    readable: rows.filter((r) => !r.needs_review).length,
    needs_review: rows.filter((r) => r.needs_review).length,
    unmatched: rows.filter((r) => !r.canonical_key).length,
  };
  return {
    ok: true,
    is_lab_report: true,
    patient: raw.patient || {},
    rows,
    stats,
    note_he:
      "חילוץ אוטומטי — טיוטה בלבד. עברו/עברי על כל הערכים לפני אישור. " +
      "שדות שסומנו לבדיקה (מטושטשים/לא-קריאים/לא-מזוהים) יש להשלים/לאמת ידנית.",
  };
}

/**
 * מפענח מחרוזת טווח-ייחוס מודפסת → {low, high}. דטרמיניסטי, בלי LLM.
 * תומך בחד-צדדי ("<200", ">40", "עד 5", "up to 5") ודו-צדדי ("40-60", "0.3–1.2").
 */
export function parseRangeText(txt) {
  const s = String(txt ?? '').trim().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!s) return { low: null, high: null };
  const num = '(-?\\d+(?:\\.\\d+)?)';
  let m;
  // גבול עליון בלבד
  if ((m = s.match(new RegExp(`^[<≤]\\s*=?\\s*${num}`)))) return { low: null, high: Number(m[1]) };
  if ((m = s.match(new RegExp(`^(?:up to|עד|לכל היותר|max|maximum)\\s*:?\\s*${num}`, 'i')))) return { low: null, high: Number(m[1]) };
  // גבול תחתון בלבד
  if ((m = s.match(new RegExp(`^[>≥]\\s*=?\\s*${num}`)))) return { low: Number(m[1]), high: null };
  if ((m = s.match(new RegExp(`^(?:מעל|לפחות|min|minimum)\\s*:?\\s*${num}`, 'i')))) return { low: Number(m[1]), high: null };
  // טווח דו-צדדי (מקף, en/em dash, "to", "עד") — תומך גם במספרים שליליים
  if ((m = s.match(new RegExp(`${num}\\s*(?:-|–|—|to|עד)\\s*${num}`, 'i')))) {
    const lo = Number(m[1]); const hi = Number(m[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) return { low: lo, high: hi };
  }
  return { low: null, high: null };
}

/**
 * קובע ref_low/ref_high לשורה: מעדיף מספרים מפורשים; אם חסרים — נופל
 * לפענוח דטרמיניסטי של ref_range_text. 0 כגבול-עליון מטופל ב-labNormalize.
 */
function parseRefBounds(r) {
  let low = Number.isFinite(Number(r.ref_low)) ? Number(r.ref_low) : null;
  let high = Number.isFinite(Number(r.ref_high)) ? Number(r.ref_high) : null;
  const text = (r.ref_range_text || '').trim();
  // אם ה-LLM לא מילא גבולות מספריים (או מילא 0/0 מנוון) — נסה לפענח מהטקסט.
  const degenerate = (low === null || low === 0) && (high === null || high === 0);
  if (text && degenerate) {
    const p = parseRangeText(text);
    if (p.low !== null || p.high !== null) { low = p.low; high = p.high; }
  }
  return { ref_low: low, ref_high: high, ref_range_text: text || null };
}

/** Deterministic canonical matching + review flagging. No model here. */
export function mapScanRows(rows = []) {
  return (rows || [])
    .filter((r) => r && (r.analyte_raw || "").trim())
    .map((r) => {
      const known = resolveAnalyte(r.analyte_raw);
      const hasNum = r.value !== null && r.value !== undefined && String(r.value).trim() !== "";
      const numericLegible = hasNum && Number.isFinite(Number(r.value)) && r.confidence !== "unreadable";
      const hasQualitative = !!(r.value_text || "").trim();
      const lowConf = r.confidence === "low" || r.confidence === "unreadable";
      const needs_review = !known || (!numericLegible && !hasQualitative) || lowConf;

      return {
        analyte_raw: (r.analyte_raw || "").trim(),
        canonical_key: known?.key ?? null,
        matched_he: known?.he ?? null,
        matched_en: known?.en ?? null,
        expected_unit: known?.unit ?? null,
        category: known?.cat ?? null,
        value: numericLegible ? Number(r.value) : null,
        value_text: hasQualitative ? r.value_text.trim() : "",
        unit: (r.unit || "").trim(),
        ...parseRefBounds(r),
        flag_printed: (r.flag_printed || "").trim(),
        confidence: r.confidence || "medium",
        needs_review,
        review_reason_he: !known
          ? "שם הבדיקה לא זוהה — בחר/י מהרשימה"
          : lowConf
          ? "קריאה לא-ודאית — אמת/י את הערך"
          : (!numericLegible && !hasQualitative)
          ? "לא נקרא ערך — הזן/י ידנית"
          : "",
      };
    });
}
