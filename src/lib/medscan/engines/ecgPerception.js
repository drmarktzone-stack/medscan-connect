/**
 * ============================================================================
 *  MedScan AI — ECG Perception → Deterministic Measurement (stage 2)
 * ============================================================================
 *  The vision model does ONE job here: PERCEPTION. It reports pixel geometry —
 *  the calibration box size and the pixel X-positions of fiducial points — and
 *  is explicitly forbidden from estimating any millisecond value or naming any
 *  diagnosis. The clinical numbers are then computed in code by
 *  `runMicroMeasure` (ecgMicroMeasure.js). This is the deterministic/LLM
 *  firewall applied to ECG geometry: the model sees, the code measures.
 * ============================================================================
 */

import { runMicroMeasure } from "./ecgMicroMeasure.js";
import { interpretFundamentals } from "./ecgFundamentals.js";
import { matchPathologies, featuresFromReading, buildPathologyBlock } from "./ecgPathologies.js";
import { VISION_MODEL } from "@/lib/aiConfig";

/** Perception-only schema. Pixel coordinates + calibration. No ms, no diagnosis. */
export const ECG_PERCEPTION_SCHEMA = {
  type: "object",
  properties: {
    quality: {
      type: "object",
      properties: {
        is_ecg: { type: "boolean", description: "האם התמונה אכן תרשים ECG" },
        interpretable: { type: "boolean", description: "האם ניתן לזהות גריד ונקודות-ציון" },
        issues_he: { type: "array", items: { type: "string" } },
      },
      required: ["is_ecg", "interpretable"],
    },
    calibration: {
      type: "object",
      description: "כיול הרשת. מדוד את גודל משבצת קטנה (1mm) בפיקסלים.",
      properties: {
        small_box_px: { type: "number", description: "רוחב משבצת קטנה (1mm) בפיקסלים. null אם לא נראה גריד." },
        paper_speed_mm_s: { type: "number", description: "מהירות נייר: 25 (ברירת מחדל) או 50 אם מסומן." },
        gain_mm_mv: { type: "number", description: "כיול משרעת: 10 (ברירת מחדל) או 20 אם מסומן." },
        reliable: { type: "boolean", description: "האם הכיול נמדד בביטחון" },
        note_he: { type: "string" },
      },
      required: ["reliable"],
    },
    fiducials: {
      type: "object",
      description: "מקטע ייצוגי (עדיף ליד II / רצועת הקצב). מיקומי-X בפיקסלים של נקודות-הציון. null למה שלא ברור.",
      properties: {
        lead_used: { type: "string" },
        p_onset_x: { type: "number" },
        p_offset_x: { type: "number" },
        qrs_onset_x: { type: "number", description: "תחילת Q / קומפלקס QRS" },
        qrs_offset_x: { type: "number", description: "נקודת J / סוף QRS" },
        t_offset_x: { type: "number", description: "סוף גל T" },
        rr_px: { type: "number", description: "מרחק בפיקסלים בין שני שיאי R עוקבים" },
      },
    },
    lead_net: {
      type: "object",
      description: "היטל QRS נטו (מ\"מ) — חיובי מעל קו-הבסיס, שלילי מתחת — לחישוב הציר בקוד.",
      properties: {
        net_I_mm: { type: "number", description: "היטל QRS נטו בליד I, במ\"מ" },
        net_aVF_mm: { type: "number", description: "היטל QRS נטו בליד aVF, במ\"מ" },
      },
    },
    rhythm: {
      type: "object",
      description: "תיאור קצב — תצפית, לא אבחנה.",
      properties: {
        regular: { type: "boolean", description: "האם מרווחי R–R סדירים" },
        p_before_each_qrs: { type: "boolean", description: "האם גל P תקין לפני כל QRS" },
      },
    },
    morphology: {
      type: "object",
      description: "תיאור מורפולוגי — מה נצפה, לא שם-מחלה.",
      properties: {
        st_elevation_leads: { type: "array", items: { type: "object", properties: { lead: { type: "string" }, mm: { type: "number" } } }, description: "לידים עם עליית ST והגובה במ\"מ" },
        st_depression_leads: { type: "array", items: { type: "object", properties: { lead: { type: "string" }, mm: { type: "number" } } } },
        t_inversion_leads: { type: "array", items: { type: "string" } },
        pathological_q_leads: { type: "array", items: { type: "string" } },
        pr_depression: { type: "boolean" },
        v1_qrs_pattern: { type: "string", description: "צורת QRS ב-V1: 'dominant_s' (S עמוק/דומיננטי) / 'rsr_prime' (RSR' דמוי-M) / 'other'" },
        lateral_broad_notched_r: { type: "boolean", description: "גל R רחב/מחורץ (דמוי-M) בלידים הלטרליים I/aVL/V5-6" },
        peaked_t_leads: { type: "array", items: { type: "string" }, description: "לידים עם גלי T גבוהים-מחודדים-צרים (peaked) — חשד היפרקלמיה" },
        u_wave_leads: { type: "array", items: { type: "string" }, description: "לידים עם גלי U בולטים — חשד היפוקלמיה" },
        delta_wave: { type: "boolean", description: "גל דלטא (עלייה מטושטשת בתחילת QRS) — חשד פרה-אקסיטציה/WPW" },
        osborn_j_wave: { type: "boolean", description: "גל Osborn/J (זיז בנקודת J) — חשד היפותרמיה" },
        low_voltage: { type: "boolean", description: "מתח נמוך (QRS <5מ\"מ בגפיים / <10מ\"מ בחזה)" },
        electrical_alternans: { type: "boolean", description: "חילוף משרעת QRS מפעמה לפעימה — חשד תפוקת קרום/טפונדה" },
        tall_r_v1: { type: "boolean", description: "R דומיננטי/גבוה ב-V1 (R>S) — שקול RVH/אוטם אחורי/WPW" },
      },
    },
    findings: {
      type: "array",
      description: "אזורי ממצא חריג על התמונה (תיבות-תחום באחוזים 0-100). ריק אם אין ממצא חריג ברור.",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" },
        },
        required: ["label", "x", "y", "width", "height"],
      },
    },
  },
  required: ["quality", "calibration"],
};

const PERCEPTION_PROMPT = `אתה מודד גיאומטרי של תרשים ECG. **תפקידך תפיסה בלבד — לא אבחון ולא הערכת זמנים.**

חוקים מוחלטים:
1. **אל תיתן שום ערך במילי-שניות.** אל תכתוב "PR=160ms". אתה מדווח אך ורק **מיקומי-פיקסלים** ו**גודל משבצת בפיקסלים**. הקוד יחשב את הזמנים.
2. **אל תאבחן.** אל תכתוב שם מחלה. רק גיאומטריה.
3. **כיול:** מדוד את רוחב משבצת קטנה אחת (1mm) בפיקסלים (small_box_px). אם אין גריד ברור — reliable=false ו-small_box_px=null.
4. **נקודות-ציון:** בחר מקטע ייצוגי אחד (עדיף ליד II או רצועת הקצב), ודווח את מיקום-ה-X בפיקסלים של: תחילת P, סוף P, תחילת QRS (Q), נקודת J (סוף QRS), סוף גל T, ומרחק ה-R–R בפיקסלים. מה שאינו ברור — null. **אל תנחש.**
5. **ציר:** דווח את היטל ה-QRS הנטו במ"מ בליד I ובליד aVF (חיובי/שלילי) — לחישוב הציר בקוד.
6. אם התמונה אינה ECG או לא ניתן לזהות גריד/נקודות — סמן זאת ב-quality ואל תמציא קואורדינטות.
7. **קצב ומורפולוגיה (תיאור, לא אבחנה):** דווח האם R–R סדיר והאם יש P תקין לפני כל QRS. דווח לידים עם עליית/ירידת ST (והגובה במ\"מ), היפוך T, גלי Q פתולוגיים, וירידת PR. כן דווח את צורת ה-QRS ב-V1 (S דומיננטי / RSR' דמוי-M) והאם יש R רחב-מחורץ בלידים הלטרליים — לזיהוי חסם צרור. זה תיאור של מה שנראה — לא שם-מחלה.
8. **סימני-היכר נדירים — ברירת-המחדל היא false/ריק:** השדות הבאים מתארים ממצאים **נדירים**. דווח אותם כ-true/עם לידים **רק אם הסימן חד-משמעי, בולט ובלתי-ניתן-לטעות**. בספק — השאר false/ריק. אל תדווח אותם על סמך רעש-קו-בסיס, רטט, או צורה גבולית: גלי T מחודדים (peaked_t_leads), גלי U (u_wave_leads), גל דלטא (delta_wave), גל Osborn/J (osborn_j_wave), מתח נמוך (low_voltage), חילוף חשמלי (electrical_alternans), R דומיננטי ב-V1 (tall_r_v1). גם גלי Q פתולוגיים (pathological_q_leads) — דווח רק אם Q רחב (>40ms) או עמוק (>25% מגובה R), לא כל S רגיל או QS פיזיולוגי ב-V1/aVR.
9. **תיבות-תחום:** אם יש ממצא חריג ברור, סמן אזורים ב-findings (x,y,width,height באחוזים 0-100 + label קצר). אין ממצא → מערך ריק.

10. **סריקה שיטתית מלאה (מניעת פספוס):** סרוק את **כל הלידים הנראים** — לא מקטע אחד: לכל ליד בדוק עליית/ירידת ST (עם גובה במ"מ), היפוך T ו-Q פתולוגי, ודווח כל ליד שבו הממצא קיים.
11. **ללא עמום:** אל תדווח ממצא מורפולוגי "גבולי" — או שהסימן נראה חד-משמעית ומדווח עם הליד, או שהוא נשאר ריק.

החזר JSON לפי הסכמה בלבד.`;

/**
 * Run perception + deterministic measurement.
 * @param {{fileUrls:string[], invokeLLM:Function, model?:string, ageDays?:number}} args
 * @returns {Promise<{abstain?:boolean, abstain_reason_he?:string, measured?:object, perception?:object}>}
 */
export async function runEcgMicroReading({ fileUrls, invokeLLM, model = VISION_MODEL, ageYears, sex }) {
  if (!invokeLLM || !Array.isArray(fileUrls) || fileUrls.length === 0) {
    return { abstain: true, abstain_reason_he: "אין תמונה או מנוע." };
  }

  let perception;
  try {
    perception = await invokeLLM({
      prompt: PERCEPTION_PROMPT,
      file_urls: fileUrls,
      response_json_schema: ECG_PERCEPTION_SCHEMA,
      add_context_from_internet: false,
      model,
    });
  } catch (e) {
    return { abstain: true, abstain_reason_he: "כשל בשלב התפיסה." };
  }

  if (!perception || perception.quality?.is_ecg === false) {
    return { abstain: true, abstain_reason_he: "התמונה אינה נראית כתרשים ECG.", perception };
  }

  const measured = runMicroMeasure({
    calibration: {
      small_box_px: perception.calibration?.small_box_px,
      paper_speed_mm_s: perception.calibration?.paper_speed_mm_s ?? 25,
      gain_mm_mv: perception.calibration?.gain_mm_mv ?? 10,
      reliable: perception.calibration?.reliable,
    },
    fiducials: {
      p_onset_x: perception.fiducials?.p_onset_x,
      p_offset_x: perception.fiducials?.p_offset_x,
      qrs_onset_x: perception.fiducials?.qrs_onset_x,
      qrs_offset_x: perception.fiducials?.qrs_offset_x,
      t_offset_x: perception.fiducials?.t_offset_x,
      rr_px: perception.fiducials?.rr_px,
    },
    leadNet: {
      net_I_mm: perception.lead_net?.net_I_mm,
      net_aVF_mm: perception.lead_net?.net_aVF_mm,
    },
  });

  const observations = {
    regular: perception.rhythm?.regular,
    p_before_each_qrs: perception.rhythm?.p_before_each_qrs,
    st_elevation_leads: perception.morphology?.st_elevation_leads,
    st_depression_leads: perception.morphology?.st_depression_leads,
    t_inversion_leads: perception.morphology?.t_inversion_leads,
    pathological_q_leads: perception.morphology?.pathological_q_leads,
    pr_depression: perception.morphology?.pr_depression,
    v1_qrs_pattern: perception.morphology?.v1_qrs_pattern,
    lateral_broad_notched_r: perception.morphology?.lateral_broad_notched_r,
    peaked_t_leads: perception.morphology?.peaked_t_leads,
    u_wave_leads: perception.morphology?.u_wave_leads,
    delta_wave: perception.morphology?.delta_wave,
    osborn_j_wave: perception.morphology?.osborn_j_wave,
    low_voltage: perception.morphology?.low_voltage,
    electrical_alternans: perception.morphology?.electrical_alternans,
    tall_r_v1: perception.morphology?.tall_r_v1,
  };
  const interpretation = interpretFundamentals({ measured, observations, ageYears, sex });

  // התאמה דטרמיניסטית מול קטלוג הפתולוגיות — בקוד בלבד, ללא קריאת LLM נוספת.
  // זה החלק ש"מוצא הסבר/דפוס" לכל סטייה — על בסיס המדידות שחושבו בקוד.
  const pathologyMatch = matchPathologies(
    featuresFromReading({ measured, interpretation, observations, ageYears, sex })
  );

  return { measured, perception, interpretation, pathologyMatch, pathologyBlock: buildPathologyBlock(pathologyMatch) };
}

/** Human/LLM-readable block of the code-computed measurements, for grounding + display. */
export function buildMeasuredBlock(measured) {
  if (!measured || !measured.measurable) {
    return "מדידות דטרמיניסטיות: לא ניתן למדוד (כיול/נקודות-ציון לא זוהו בביטחון). אין להסתמך על ערכי-זמן מהתמונה.";
  }
  const iv = measured.intervals, r = measured.rate, q = measured.qtc, ax = measured.axis;
  const parts = [];
  if (r.hr_bpm != null) parts.push(`HR=${r.hr_bpm} bpm`);
  if (iv.pr_ms != null) parts.push(`PR=${iv.pr_ms} ms`);
  if (iv.qrs_ms != null) parts.push(`QRS=${iv.qrs_ms} ms`);
  if (iv.qt_ms != null) parts.push(`QT=${iv.qt_ms} ms`);
  if (q.bazett != null) parts.push(`QTc(Bazett)=${q.bazett} ms`);
  if (ax.degrees != null) parts.push(`ציר=${ax.degrees}° (${ax.label_he})`);
  return `מדידות שחושבו בקוד ממנוע-המדידה הדטרמיניסטי (אלה המספרים הקובעים — לא הערכה מהעין): ${parts.join(" | ") || "—"}.`;
}
