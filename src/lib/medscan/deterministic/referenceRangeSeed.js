/**
 * MedScan — Reference Range Seed (טיוטה בלבד)
 *
 * ═══════════════════════════════════════════════════════════════════════
 *  ⚠ קרא את זה לפני שאתה משתמש בקובץ הזה
 * ═══════════════════════════════════════════════════════════════════════
 *
 * **מה זה:** ערכי התחלה לטווחי ייחוס ילדיים, בסדר גודל של מה שמקובל
 * בספרות. מטרתם היחידה: לתת נקודת פתיחה לעריכה ולאימות, במקום טופס ריק.
 *
 * **מה זה לא:**
 *  · **אלה אינם הטווחים של המעבדה שלך.** טווחי ייחוס תלויים בשיטת
 *    המדידה, במכשור ובאוכלוסיית הייחוס. שתי מעבדות ייתנו טווחים שונים
 *    לאותו מדד — במיוחד באנזימים ובאימונואסיי.
 *  · **אלה אינם גיליונות של קופות החולים.** אין לי גישה אליהם.
 *  · **אלה לא אומתו רפואית.** הם נכתבו מידע כללי — כלומר מהמקור
 *    שכל המערכת הזו נבנתה לא להסתמך עליו.
 *
 * לכן **כל רשומה כאן נטענת כ-`draft_needs_verification`**, והמערכת
 * מסמנת כל ערך שנשען עליה כטיוטה. אימות = לפתוח את גיליון המעבדה,
 * להשוות, לתקן ולאשר. עד אז — הסימון מוצג עם אזהרה.
 *
 * גבולות הגיל הם בימים. חלוקה מקובלת ברפואת ילדים:
 *   0–1 · 2–7 · 8–30 · 31–180 · 181–730 · 731–2190 · 2191–4380 · 4381–6570
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

export const SEED_PROVENANCE =
  'ערכי התחלה מספרות כללית — לא מגיליון מעבדה ספציפי, לא אומתו רפואית. ' +
  'יש להשוות לגיליון המעבדה המבצעת ולאשר לפני שימוש קליני.';

/** קיצור לבניית מדרגת גיל. */
const b = (age_min_days, age_max_days, low, high, sex = 'any') =>
  ({ age_min_days, age_max_days, low, high, sex });

const ADULT = 6570;   // ~18 שנים
const OPEN = 36500;

export const SEED_RANGES = [
  /* ── ספירת דם ─────────────────────────────────────────────────────── */
  {
    analyte: 'hemoglobin', label_he: 'המוגלובין', unit: 'g/dL',
    note_he: 'תלוי-גיל באופן חד. ירידה פיזיולוגית בגיל 2–3 חודשים.',
    bands: [
      b(0, 1, 14.5, 22.5), b(2, 7, 13.5, 21.5), b(8, 30, 12.5, 20.5),
      b(31, 180, 9.5, 13.5), b(181, 730, 10.5, 13.5), b(731, 2190, 11.5, 13.5),
      b(2191, 4380, 11.5, 15.5), b(4381, ADULT, 12.0, 16.0),
      b(ADULT + 1, OPEN, 12.0, 17.5),
    ],
  },
  {
    analyte: 'hematocrit', label_he: 'המטוקריט', unit: '%',
    bands: [
      b(0, 1, 45, 67), b(2, 7, 42, 66), b(8, 30, 39, 63),
      b(31, 180, 29, 41), b(181, 730, 33, 39), b(731, 2190, 34, 40),
      b(2191, 4380, 35, 45), b(4381, OPEN, 36, 50),
    ],
  },
  {
    analyte: 'wbc', label_he: 'ספירת לויקוציטים', unit: '10^9/L',
    note_he: 'גבוה פיזיולוגית ביילוד ויורד בהדרגה.',
    bands: [
      b(0, 1, 9.0, 30.0), b(2, 7, 5.0, 21.0), b(8, 30, 5.0, 19.5),
      b(31, 180, 6.0, 17.5), b(181, 730, 6.0, 17.0), b(731, 2190, 5.5, 15.5),
      b(2191, 4380, 4.5, 13.5), b(4381, OPEN, 4.5, 11.0),
    ],
  },
  {
    analyte: 'platelets', label_he: 'טסיות', unit: '10^9/L',
    bands: [b(0, OPEN, 150, 450)],
  },
  {
    analyte: 'mcv', label_he: 'MCV', unit: 'fL',
    note_he: 'כלל אצבע נפוץ בילדים: גבול תחתון ≈ 70 + גיל בשנים.',
    bands: [
      b(0, 1, 98, 118), b(2, 30, 88, 112), b(31, 180, 73, 90),
      b(181, 730, 70, 86), b(731, 2190, 75, 87), b(2191, 4380, 77, 91),
      b(4381, OPEN, 78, 98),
    ],
  },
  {
    analyte: 'neutrophils_abs', label_he: 'נויטרופילים (מוחלט)', unit: '10^9/L',
    note_he: 'הסף לנויטרופניה תלוי-גיל ומוצא. יש לאמת מול הפרוטוקול המקומי.',
    bands: [
      b(0, 1, 6.0, 26.0), b(2, 7, 1.5, 10.0), b(8, 30, 1.0, 9.0),
      b(31, 730, 1.0, 8.5), b(731, 4380, 1.5, 8.0), b(4381, OPEN, 1.8, 8.0),
    ],
  },
  {
    analyte: 'lymphocytes_abs', label_he: 'לימפוציטים (מוחלט)', unit: '10^9/L',
    note_he: 'לימפוציטוזיס פיזיולוגי בינקות — הפוך מהמבוגר.',
    bands: [
      b(0, 30, 2.0, 11.0), b(31, 730, 4.0, 10.5), b(731, 2190, 2.0, 8.0),
      b(2191, 4380, 1.5, 6.8), b(4381, OPEN, 1.0, 4.8),
    ],
  },
  {
    analyte: 'reticulocytes', label_he: 'רטיקולוציטים', unit: '%',
    bands: [b(0, 7, 1.5, 6.0), b(8, 30, 0.5, 3.5), b(31, OPEN, 0.5, 2.5)],
  },

  /* ── אלקטרוליטים וכליה ────────────────────────────────────────────── */
  { analyte: 'sodium', label_he: 'נתרן', unit: 'mmol/L', bands: [b(0, OPEN, 135, 145)] },
  {
    analyte: 'potassium', label_he: 'אשלגן', unit: 'mmol/L',
    note_he: 'גבוה יותר ביילוד. המוליזה בדגימה מעלה כוזבת.',
    bands: [b(0, 30, 3.7, 5.9), b(31, 365, 4.1, 5.3), b(366, OPEN, 3.5, 5.1)],
  },
  { analyte: 'chloride', label_he: 'כלור', unit: 'mmol/L', bands: [b(0, OPEN, 98, 107)] },
  {
    analyte: 'bicarbonate', label_he: 'ביקרבונט', unit: 'mmol/L',
    bands: [b(0, 730, 17, 25), b(731, OPEN, 20, 28)],
  },
  {
    analyte: 'urea', label_he: 'אוריאה', unit: 'mg/dL',
    bands: [b(0, 30, 3, 25), b(31, OPEN, 7, 20)],
  },
  {
    analyte: 'creatinine', label_he: 'קריאטינין', unit: 'mg/dL',
    note_he: 'תלוי מסת שריר. ביילוד משקף את ערך האם בימים הראשונים.',
    bands: [
      b(0, 7, 0.30, 1.00), b(8, 365, 0.20, 0.40), b(366, 2190, 0.20, 0.50),
      b(2191, 4380, 0.30, 0.70), b(4381, ADULT, 0.50, 1.00),
      b(ADULT + 1, OPEN, 0.60, 1.20),
    ],
  },
  {
    analyte: 'calcium', label_he: 'סידן', unit: 'mg/dL',
    bands: [b(0, 30, 7.6, 10.4), b(31, 730, 8.8, 10.8), b(731, OPEN, 8.8, 10.3)],
  },
  {
    analyte: 'phosphorus', label_he: 'זרחן', unit: 'mg/dL',
    note_he: 'גבוה בילדים ביחס למבוגרים — גדילה עצם פעילה.',
    bands: [b(0, 30, 4.5, 9.0), b(31, 365, 4.5, 7.4), b(366, 4380, 3.8, 6.5), b(4381, OPEN, 2.7, 4.5)],
  },
  { analyte: 'magnesium', label_he: 'מגנזיום', unit: 'mg/dL', bands: [b(0, OPEN, 1.6, 2.6)] },
  {
    analyte: 'uric_acid', label_he: 'חומצה אורית', unit: 'mg/dL',
    bands: [b(0, 730, 1.0, 5.5), b(731, 4380, 2.0, 5.5), b(4381, OPEN, 2.5, 7.0)],
  },

  /* ── כבד וחלבונים ─────────────────────────────────────────────────── */
  {
    analyte: 'alt', label_he: 'ALT', unit: 'U/L',
    note_he: 'תלוי-שיטה במידה רבה. יש להשוות לגיליון המעבדה.',
    bands: [b(0, 365, 5, 45), b(366, OPEN, 5, 40)],
  },
  {
    analyte: 'ast', label_he: 'AST', unit: 'U/L',
    bands: [b(0, 30, 25, 75), b(31, 365, 15, 60), b(366, 4380, 10, 50), b(4381, OPEN, 10, 40)],
  },
  {
    analyte: 'alp', label_he: 'פוספטאזה אלקלית', unit: 'U/L',
    note_he: 'גבוה מאוד בילדים ובמיוחד בגיל ההתבגרות — פעילות אוסטאובלסטית.',
    bands: [
      b(0, 30, 75, 320), b(31, 365, 60, 400), b(366, 2190, 100, 350),
      b(2191, 4380, 100, 400), b(4381, ADULT, 50, 400), b(ADULT + 1, OPEN, 40, 130),
    ],
  },
  {
    analyte: 'bilirubin_total', label_he: 'בילירובין כללי', unit: 'mg/dL',
    note_he: '⚠ צהבת יילודים מוערכת מול נומוגרמה תלוית-שעות, לא מול טווח זה.',
    bands: [b(31, OPEN, 0.2, 1.2)],
  },
  { analyte: 'bilirubin_direct', label_he: 'בילירובין ישיר', unit: 'mg/dL', bands: [b(0, OPEN, 0.0, 0.3)] },
  {
    analyte: 'albumin', label_he: 'אלבומין', unit: 'g/dL',
    bands: [b(0, 30, 2.8, 4.4), b(31, 365, 3.2, 4.8), b(366, OPEN, 3.5, 5.2)],
  },
  {
    analyte: 'total_protein', label_he: 'חלבון כללי', unit: 'g/dL',
    bands: [b(0, 30, 4.6, 7.0), b(31, 365, 5.1, 7.3), b(366, OPEN, 6.0, 8.0)],
  },
  {
    analyte: 'ggt', label_he: 'GGT', unit: 'U/L',
    note_he: 'גבוה מאוד בחודשי החיים הראשונים.',
    bands: [b(0, 30, 13, 200), b(31, 365, 5, 60), b(366, OPEN, 5, 30)],
  },
  { analyte: 'ammonia', label_he: 'אמוניה', unit: 'µmol/L', bands: [b(0, 30, 20, 100), b(31, OPEN, 10, 45)] },

  /* ── סמני דלקת ────────────────────────────────────────────────────── */
  {
    analyte: 'crp', label_he: 'CRP', unit: 'mg/L',
    note_he: 'עולה 6–12 שעות מתחילת הגירוי. ערך תקין מוקדם אינו שולל.',
    bands: [b(0, OPEN, null, 5)],
  },
  {
    analyte: 'procalcitonin', label_he: 'פרוקלציטונין', unit: 'ng/mL',
    note_he: 'עלייה פיזיולוגית ב-48 השעות הראשונות לחיים.',
    bands: [b(3, OPEN, null, 0.5)],
  },
  {
    analyte: 'esr', label_he: 'שקיעת דם', unit: 'mm/hr',
    bands: [b(0, 4380, null, 15), b(4381, OPEN, null, 20)],
  },

  /* ── גלוקוז ושומנים ───────────────────────────────────────────────── */
  {
    analyte: 'glucose', label_he: 'גלוקוז', unit: 'mg/dL',
    note_he: 'ערכי צום. ⚠ סף היפוגליקמיה ביילוד נקבע בפרוטוקול, לא מטווח זה.',
    bands: [b(0, 1, 40, 90), b(2, 30, 50, 90), b(31, OPEN, 70, 100)],
  },
  { analyte: 'hba1c', label_he: 'HbA1c', unit: '%', bands: [b(0, OPEN, 4.0, 5.6)] },
  { analyte: 'cholesterol_total', label_he: 'כולסטרול כללי', unit: 'mg/dL',
    note_he: 'סף ילדים (NHLBI): רצוי <170. במבוגרים <200.',
    bands: [b(731, ADULT, null, 170), b(ADULT + 1, OPEN, null, 200)] },
  { analyte: 'ldl', label_he: 'LDL', unit: 'mg/dL',
    note_he: 'סף ילדים (NHLBI): רצוי <110. במבוגרים <130 (ונמוך יותר בסיכון קרדיווסקולרי).',
    bands: [b(731, ADULT, null, 110), b(ADULT + 1, OPEN, null, 130)] },
  { analyte: 'hdl', label_he: 'HDL', unit: 'mg/dL',
    note_he: '⚠ HDL הפוך: ערך נמוך הוא גורם סיכון. רצפה >45 (ילדים), >40 (מבוגרים).',
    bands: [b(731, ADULT, 45, null), b(ADULT + 1, OPEN, 40, null)] },
  { analyte: 'non_hdl_cholesterol', label_he: 'כולסטרול לא-HDL', unit: 'mg/dL',
    note_he: 'סף ילדים (NHLBI): רצוי <120, גבוה ≥145. במבוגרים <130.',
    bands: [b(731, ADULT, null, 145), b(ADULT + 1, OPEN, null, 130)] },
  {
    analyte: 'triglycerides', label_he: 'טריגליצרידים', unit: 'mg/dL',
    bands: [b(0, 3650, null, 100), b(3651, OPEN, null, 130)],
  },

  /* ── ברזל וויטמינים ───────────────────────────────────────────────── */
  {
    analyte: 'ferritin', label_he: 'פריטין', unit: 'ng/mL',
    note_he: '⚠ מגיב חריף — ערך תקין אינו שולל חוסר ברזל בנוכחות דלקת.',
    bands: [b(31, 365, 10, 200), b(366, OPEN, 10, 120)],
  },
  { analyte: 'iron', label_he: 'ברזל', unit: 'µg/dL', bands: [b(0, 365, 40, 100), b(366, OPEN, 50, 120)] },
  { analyte: 'tibc', label_he: 'TIBC', unit: 'µg/dL', bands: [b(0, OPEN, 250, 400)] },
  { analyte: 'vitamin_b12', label_he: 'ויטמין B12', unit: 'pg/mL', bands: [b(0, OPEN, 200, 900)] },
  { analyte: 'folate', label_he: 'חומצה פולית', unit: 'ng/mL', bands: [b(0, OPEN, 3, 20)] },
  {
    analyte: 'vitamin_d', label_he: 'ויטמין D', unit: 'ng/mL',
    note_he: 'ההגדרה של "מספק" משתנה בין הנחיות. יש לאמת מול הפרוטוקול המקומי.',
    bands: [b(0, OPEN, 30, 100)],
  },

  /* ── בלוטת התריס ──────────────────────────────────────────────────── */
  {
    analyte: 'tsh', label_he: 'TSH', unit: 'mIU/L',
    note_he: 'זינוק חד ב-3 הימים הראשונים לחיים. סקר יילודים מוערך בנפרד.',
    bands: [b(4, 30, 0.7, 15.0), b(31, 365, 0.7, 8.5), b(366, 4380, 0.7, 6.0), b(4381, OPEN, 0.5, 4.5)],
  },
  {
    analyte: 'ft4', label_he: 'FT4', unit: 'ng/dL',
    bands: [b(4, 30, 0.9, 2.6), b(31, 365, 0.8, 2.0), b(366, OPEN, 0.8, 1.8)],
  },

  /* ── שרירים ואנזימים ──────────────────────────────────────────────── */
  {
    analyte: 'ck', label_he: 'CK', unit: 'U/L',
    note_he: 'עולה אחרי מאמץ, נפילה או זריקה תוך-שרירית.',
    bands: [b(0, 30, 40, 500), b(31, OPEN, 30, 200)],
  },
  {
    analyte: 'ldh', label_he: 'LDH', unit: 'U/L',
    note_he: 'גבוה בילדים. המוליזה בדגימה מעלה כוזבת.',
    bands: [b(0, 30, 300, 1500), b(31, 730, 180, 800), b(731, 4380, 150, 500), b(4381, OPEN, 120, 300)],
  },
  { analyte: 'amylase', label_he: 'עמילאז', unit: 'U/L', bands: [b(366, OPEN, 25, 125)] },
  { analyte: 'lipase', label_he: 'ליפאז', unit: 'U/L', bands: [b(366, OPEN, 10, 60)] },

  /* ── קרישה ────────────────────────────────────────────────────────── */
  { analyte: 'inr', label_he: 'INR', unit: '', bands: [b(31, OPEN, 0.8, 1.2)] },
  { analyte: 'fibrinogen', label_he: 'פיברינוגן', unit: 'mg/dL', bands: [b(0, OPEN, 200, 400)] },

  /* ── גזים בדם ─────────────────────────────────────────────────────── */
  { analyte: 'ph_blood', label_he: 'pH', unit: '', bands: [b(0, OPEN, 7.35, 7.45)] },
  { analyte: 'pco2', label_he: 'pCO2', unit: 'mmHg', bands: [b(0, OPEN, 35, 45)] },
  { analyte: 'lactate', label_he: 'לקטט', unit: 'mmol/L', bands: [b(0, OPEN, 0.5, 2.2)] },

  /* ── נוזל שדרה ────────────────────────────────────────────────────── */
  {
    analyte: 'csf_wbc', label_he: 'לויקוציטים ב-CSF', unit: '/µL',
    note_he: '⚠ גבול היילוד שנוי במחלוקת בספרות. הפרוטוקול המחלקתי גובר.',
    bands: [b(0, 30, null, 20), b(31, 60, null, 9), b(61, OPEN, null, 5)],
  },
  {
    analyte: 'csf_protein', label_he: 'חלבון ב-CSF', unit: 'mg/dL',
    note_he: 'גבוה ביילוד ויורד בחודשים הראשונים.',
    bands: [b(0, 30, 20, 150), b(31, 180, 20, 80), b(181, OPEN, 15, 45)],
  },
  {
    analyte: 'csf_glucose', label_he: 'גלוקוז ב-CSF', unit: 'mg/dL',
    note_he: 'מוערך כיחס לגלוקוז בדם, לא כערך מוחלט.',
    bands: [b(0, 30, 30, 120), b(31, OPEN, 40, 80)],
  },

  /* ── שתן ──────────────────────────────────────────────────────────── */
  {
    analyte: 'urine_protein_creat_ratio', label_he: 'יחס חלבון/קריאטינין בשתן', unit: 'mg/mg',
    note_he: 'גבול שונה מתחת לגיל שנתיים.',
    bands: [b(0, 730, null, 0.5), b(731, OPEN, null, 0.2)],
  },
  { analyte: 'urine_wbc', label_he: 'לויקוציטים בשתן', unit: '/HPF', bands: [b(0, OPEN, null, 5)] },
  { analyte: 'urine_rbc', label_he: 'אריתרוציטים בשתן', unit: '/HPF', bands: [b(0, OPEN, null, 3)] },

  /* ══════════════════════════════════════════════════════════════════
   *  הרחבה — בדיקות נפוצות שחסרו טווח. כולן טיוטה-לאימות.
   *  לא נכללו מדדים תלויי-התבגרות/מין חזקים (LH/FSH/אסטרוגן/טסטו/IGF-1/GH/
   *  17OHP/IgG-A-M/IgE/AFP/רנין) — הם דורשים טבלאות תלויות-גיל/מין נפרדות.
   * ═══════════════════════════════════════════════════════════════════ */

  /* ספירת דם — אינדקסים ודיפרנציאל */
  { analyte: 'rbc', label_he: 'ספירת אריתרוציטים', unit: '10^12/L',
    bands: [b(0, 30, 4.1, 6.1), b(31, 365, 3.8, 5.4), b(366, 4380, 4.0, 5.3), b(4381, OPEN, 4.2, 5.9)] },
  { analyte: 'mch', label_he: 'המוגלובין ממוצע לתא', unit: 'pg',
    bands: [b(0, 30, 31, 37), b(31, 365, 24, 30), b(366, OPEN, 25, 33)] },
  { analyte: 'mchc', label_he: 'ריכוז המוגלובין ממוצע', unit: 'g/dL', bands: [b(0, OPEN, 32, 36)] },
  { analyte: 'rdw', label_he: 'פיזור גודל תאים', unit: '%', bands: [b(0, OPEN, 11.5, 14.5)] },
  { analyte: 'mpv', label_he: 'נפח טסית ממוצע', unit: 'fL', bands: [b(0, OPEN, 7.5, 11.5)] },
  { analyte: 'neutrophils_pct', label_he: 'נויטרופילים (%)', unit: '%',
    note_he: 'אחוזים משתנים מאוד עם הגיל; הספירה המוחלטת (ANC) אמינה יותר.',
    bands: [b(0, OPEN, 30, 75)] },
  { analyte: 'lymphocytes_pct', label_he: 'לימפוציטים (%)', unit: '%',
    note_he: 'לימפוציטוזיס פיזיולוגי בינקות — הטווח רחב בכוונה.', bands: [b(0, OPEN, 20, 60)] },
  { analyte: 'monocytes_pct', label_he: 'מונוציטים (%)', unit: '%', bands: [b(0, OPEN, 2, 12)] },
  { analyte: 'eosinophils_abs', label_he: 'אאוזינופילים (מוחלט)', unit: '10^9/L', bands: [b(0, OPEN, null, 0.5)] },
  { analyte: 'eosinophils_pct', label_he: 'אאוזינופילים (%)', unit: '%', bands: [b(0, OPEN, null, 6)] },
  { analyte: 'basophils_pct', label_he: 'בזופילים (%)', unit: '%', bands: [b(0, OPEN, null, 2)] },
  { analyte: 'bands', label_he: 'תאי מוט (Bands)', unit: '%', bands: [b(0, OPEN, null, 10)] },
  { analyte: 'blasts', label_he: 'תאי בלסט', unit: '%',
    note_he: '⚠ בלסטים בדם היקפי אינם תקינים — כל נוכחות דורשת בירור דחוף.', bands: [b(0, OPEN, null, 0)] },

  /* קרישה */
  { analyte: 'pt', label_he: 'זמן פרותרומבין', unit: 'sec', bands: [b(0, OPEN, 11, 14)] },
  { analyte: 'ptt', label_he: 'PTT', unit: 'sec', bands: [b(0, 30, 25, 45), b(31, OPEN, 25, 38)] },
  { analyte: 'd_dimer', label_he: 'D-dimer', unit: 'ng/mL', bands: [b(0, OPEN, null, 500)] },

  /* כימיה וכליה */
  { analyte: 'anion_gap', label_he: 'Anion gap', unit: 'mmol/L', bands: [b(0, OPEN, 4, 12)] },
  { analyte: 'osmolality_serum', label_he: 'אוסמולריות בדם', unit: 'mOsm/kg', bands: [b(0, OPEN, 275, 295)] },
  { analyte: 'calcium_ionized', label_he: 'סידן מיונן', unit: 'mmol/L', bands: [b(0, 30, 1.05, 1.37), b(31, OPEN, 1.12, 1.32)] },

  /* אנדוקרינולוגיה (יציבי-גיל יחסית) */
  { analyte: 'ft3', label_he: 'FT3', unit: 'pg/mL', bands: [b(0, OPEN, 2.3, 4.2)] },
  { analyte: 'anti_tpo', label_he: 'נוגדני TPO', unit: 'IU/mL',
    note_he: 'שלילי <35 (תלוי-שיטה).', bands: [b(0, OPEN, null, 35)] },
  { analyte: 'cortisol', label_he: 'קורטיזול', unit: 'µg/dL',
    note_he: 'טווח בוקר (AM). ערכי ערב נמוכים בהרבה.', bands: [b(0, OPEN, 5, 23)] },
  { analyte: 'acth', label_he: 'ACTH', unit: 'pg/mL', bands: [b(0, OPEN, 7, 63)] },
  { analyte: 'prolactin', label_he: 'פרולקטין', unit: 'ng/mL',
    note_he: 'טווח משתנה בין המינים — טיוטה גסה.', bands: [b(0, OPEN, 3, 25)] },
  { analyte: 'pth', label_he: 'PTH', unit: 'pg/mL', bands: [b(0, OPEN, 15, 65)] },
  { analyte: 'insulin', label_he: 'אינסולין', unit: 'µIU/mL', note_he: 'בצום.', bands: [b(0, OPEN, 2, 25)] },
  { analyte: 'c_peptide', label_he: 'C-peptide', unit: 'ng/mL', bands: [b(0, OPEN, 0.8, 3.9)] },

  /* ויטמינים ומינרלים */
  { analyte: 'transferrin', label_he: 'טרנספרין', unit: 'mg/dL', bands: [b(0, OPEN, 200, 360)] },
  { analyte: 'transferrin_sat', label_he: 'רוויון טרנספרין', unit: '%', bands: [b(0, OPEN, 20, 50)] },
  { analyte: 'zinc', label_he: 'אבץ', unit: 'µg/dL', bands: [b(0, OPEN, 60, 120)] },
  { analyte: 'lead', label_he: 'עופרת', unit: 'µg/dL',
    note_he: '⚠ ערך-ייחוס CDC <3.5. כל ערך מוגבר מחייב התייחסות.', bands: [b(0, OPEN, null, 3.5)] },

  /* אימונולוגיה וראומטולוגיה (ספי-שליליות; תלוי-שיטה) */
  { analyte: 'c3', label_he: 'משלים C3', unit: 'mg/dL', bands: [b(0, OPEN, 80, 170)] },
  { analyte: 'c4', label_he: 'משלים C4', unit: 'mg/dL', bands: [b(0, OPEN, 14, 40)] },
  { analyte: 'anti_dsdna', label_he: 'Anti-dsDNA', unit: 'IU/mL', note_he: 'שלילי <30 (תלוי-שיטה).', bands: [b(0, OPEN, null, 30)] },
  { analyte: 'rf', label_he: 'גורם ראומטי', unit: 'IU/mL', bands: [b(0, OPEN, null, 14)] },
  { analyte: 'anti_ccp', label_he: 'Anti-CCP', unit: 'U/mL', bands: [b(0, OPEN, null, 20)] },
  { analyte: 'anti_ttg_iga', label_he: 'Anti-tTG IgA', unit: 'U/mL',
    note_he: '⚠ סף תלוי-שיטה מאוד — יש לאמת מול המעבדה. בדוק IgA כללי.', bands: [b(0, OPEN, null, 7)] },

  /* סרולוגיה */
  { analyte: 'aso', label_he: 'ASO', unit: 'IU/mL', note_he: 'עולה בגיל בית-הספר; טיוטה גסה.', bands: [b(0, OPEN, null, 200)] },

  /* מטבולי */
  { analyte: 'ketones_blood', label_he: 'קטונים בדם', unit: 'mmol/L', bands: [b(0, OPEN, null, 0.6)] },
  { analyte: 'sweat_chloride', label_he: 'מבחן זיעה', unit: 'mmol/L',
    note_he: '<30 תקין; 30–59 גבולי; ≥60 מאבחן CF.', bands: [b(0, OPEN, null, 29)] },

  /* גזים בדם */
  { analyte: 'po2', label_he: 'pO2', unit: 'mmHg', bands: [b(0, OPEN, 80, 100)] },
  { analyte: 'base_excess', label_he: 'Base excess', unit: 'mmol/L', bands: [b(0, OPEN, -2, 3)] },
  { analyte: 'o2_sat_lab', label_he: 'רוויון חמצן (מעבדה)', unit: '%', bands: [b(0, OPEN, 95, 100)] },

  /* סמנים קרדיאליים */
  { analyte: 'troponin', label_he: 'טרופונין', unit: 'ng/L',
    note_he: '⚠ סף תלוי-ערכה לחלוטין (hs-cTn ~14 במבוגר) — לאמת מול המעבדה.', bands: [b(0, OPEN, null, 14)] },
  { analyte: 'bnp', label_he: 'BNP', unit: 'pg/mL', bands: [b(0, OPEN, null, 100)] },
  { analyte: 'ck_mb', label_he: 'CK-MB', unit: 'ng/mL', bands: [b(0, OPEN, null, 5)] },

  /* נוזל שדרה ושתן */
  { analyte: 'csf_rbc', label_he: 'אריתרוציטים ב-CSF', unit: '/µL', note_he: 'דיקור טראומטי מעלה כוזב.', bands: [b(0, OPEN, null, 5)] },
  { analyte: 'csf_glucose_ratio', label_he: 'יחס גלוקוז CSF/דם', unit: '', bands: [b(0, OPEN, 0.6, 1.0)] },
  { analyte: 'csf_lactate', label_he: 'לקטט ב-CSF', unit: 'mmol/L', bands: [b(0, OPEN, null, 2.1)] },
  { analyte: 'urine_ph', label_he: 'pH שתן', unit: '', bands: [b(0, OPEN, 4.5, 8.0)] },
  { analyte: 'urine_specific_gravity', label_he: 'משקל סגולי', unit: '', bands: [b(0, OPEN, 1.003, 1.030)] },
];

/**
 * ממיר את ה-seed לפורמט שישות ReferenceRange מצפה לו.
 * **כל רשומה יוצאת כטיוטה.** אין דרך לעקוף את זה מכאן — במכוון.
 */
export function seedToEntityRows(labName = 'טיוטה — טרם הוגדרה מעבדה') {
  return SEED_RANGES.map((r) => ({
    analyte: r.analyte,
    label_he: r.label_he,
    unit: r.unit,
    bands: r.bands,
    lab_name: labName,
    review_note_he: [SEED_PROVENANCE, r.note_he].filter(Boolean).join(' | '),
    verification_status: 'draft_needs_verification',
  }));
}

export const SEED_COUNT = SEED_RANGES.length;
