/**
 * MedScan — Analyte Catalog
 *
 * קטלוג שמות מדדי מעבדה, קיצורים, יחידות מקובלות וסוג תוצאה.
 *
 * ## מה יש כאן ומה במפורש אין
 *
 * **יש:** שם קנוני, שם עברי, שם אנגלי, מילים נרדפות/קיצורים, יחידה
 * מקובלת, קטגוריה, וסוג התוצאה (מספרי / איכותני / טיטר / זיהוי מחולל).
 * אלה **מטא-דאטה**, לא טענות קליניות.
 *
 * **אין — ובכוונה:** טווחי ייחוס, ספים, ערכי נורמה. אלה ספציפיים
 * למעבדה המבצעת ותלויי-גיל, והם מגיעים אך ורק מישות `ReferenceRange`
 * שמולאה מגיליון המעבדה. קטלוג שמכיל טווחים "טיפוסיים" יגרום למישהו
 * להסתמך עליהם, וזה בדיוק הכשל שהמערכת נבנתה למנוע.
 *
 * היחידה המצוינת כאן היא **היחידה השכיחה** — היא משמשת כברירת מחדל
 * בטופס ולבדיקת אי-התאמה. היחידה של המעבדה שלך גוברת עליה תמיד.
 *
 * ## למה הקטלוג חשוב מעבר לנוחות
 * `LabPattern` מתאים רכיבים לפי שם המדד. בלי מפתח קנוני, "המוגלובין",
 * "Hb" ו-"HGB" הם שלושה מדדים שונים, ודפוס שדורש המוגלובין נמוך פשוט
 * לא יופעל. הנרמול כאן הוא מה שגורם להתאמת הדפוסים לעבוד בפועל.
 */

export const RESULT_TYPES = {
  NUMERIC: 'numeric',        // ערך מספרי עם יחידה
  QUALITATIVE: 'qualitative', // חיובי/שלילי, נמצא/לא נמצא
  TITER: 'titer',            // 1:160 וכדומה
  ORGANISM: 'organism',      // שם מחולל שזוהה
  TEXT: 'text',              // ממצא מילולי (ציטוגנטיקה, מורפולוגיה)
};

export const CATEGORIES = {
  hematology: 'המטולוגיה וספירת דם',
  coagulation: 'קרישה',
  chemistry: 'כימיה כללית',
  renal: 'תפקודי כליה ואלקטרוליטים',
  liver: 'תפקודי כבד',
  lipids: 'שומנים',
  inflammation: 'סמני דלקת',
  endocrine: 'אנדוקרינולוגיה',
  metabolic: 'מטבולי וסקר יילודים',
  immunology: 'אימונולוגיה וראומטולוגיה',
  microbiology: 'מיקרוביולוגיה',
  serology: 'סרולוגיה',
  genetics: 'גנטיקה',
  urine: 'שתן',
  csf: 'נוזל שדרה',
  bloodgas: 'גזים בדם',
  cardiac: 'סמנים קרדיאליים',
  tumor: 'סמני גידול',
  vitamins: 'ויטמינים ומינרלים',
};

/**
 * הקטלוג.
 * key      — מפתח קנוני יציב. LabPattern מתייחס אליו.
 * he/en    — שמות לתצוגה ולחיפוש
 * syn      — קיצורים ומילים נרדפות (עברית ואנגלית)
 * unit     — יחידה שכיחה (ברירת מחדל בטופס בלבד)
 * type     — סוג תוצאה
 */
const CATALOG = [
  /* ── המטולוגיה ─────────────────────────────────────────────────────── */
  { key: 'wbc', he: 'ספירת לויקוציטים', en: 'WBC', syn: ['לויקוציטים', 'כדוריות לבנות', 'leukocytes'], unit: '10^9/L', cat: 'hematology' },
  { key: 'rbc', he: 'ספירת אריתרוציטים', en: 'RBC', syn: ['כדוריות אדומות', 'erythrocytes'], unit: '10^12/L', cat: 'hematology' },
  { key: 'hemoglobin', he: 'המוגלובין', en: 'Hemoglobin', syn: ['Hb', 'HGB', 'המוגלובין'], unit: 'g/dL', cat: 'hematology' },
  { key: 'hematocrit', he: 'המטוקריט', en: 'Hematocrit', syn: ['Hct', 'HCT'], unit: '%', cat: 'hematology' },
  { key: 'mcv', he: 'נפח תא ממוצע', en: 'MCV', syn: ['MCV'], unit: 'fL', cat: 'hematology' },
  { key: 'mch', he: 'המוגלובין ממוצע לתא', en: 'MCH', syn: ['MCH'], unit: 'pg', cat: 'hematology' },
  { key: 'mchc', he: 'ריכוז המוגלובין ממוצע', en: 'MCHC', syn: ['MCHC'], unit: 'g/dL', cat: 'hematology' },
  { key: 'rdw', he: 'פיזור גודל תאים', en: 'RDW', syn: ['RDW'], unit: '%', cat: 'hematology' },
  { key: 'platelets', he: 'טסיות', en: 'Platelets', syn: ['PLT', 'טרומבוציטים', 'thrombocytes'], unit: '10^9/L', cat: 'hematology' },
  { key: 'mpv', he: 'נפח טסית ממוצע', en: 'MPV', syn: ['MPV'], unit: 'fL', cat: 'hematology' },
  { key: 'neutrophils_abs', he: 'נויטרופילים (מוחלט)', en: 'ANC', syn: ['ANC', 'נויטרופילים מוחלט', 'absolute neutrophil count', 'Neutrophils', 'נויטרופילים', 'neutrophil count'], unit: '10^9/L', cat: 'hematology' },
  { key: 'neutrophils_pct', he: 'נויטרופילים (%)', en: 'Neutrophils %', syn: ['נויטרופילים אחוז', 'segs'], unit: '%', cat: 'hematology' },
  // כמו בלימפוציטים: 'נויטרופילים' ללא הכוונה → ספירה מוחלטת (ANC).
  { key: 'bands', he: 'תאי מוט (Bands)', en: 'Band forms', syn: ['bands', 'מוטות', 'left shift'], unit: '%', cat: 'hematology' },
  // 'לימפוציטים'/'Lymphocytes' ללא הכוונה ממופה לספירה המוחלטת ולא לאחוז:
  // בהקשר קליני (לימפופניה, חסר חיסוני) המספר המוחלט הוא הקובע.
  { key: 'lymphocytes_abs', he: 'לימפוציטים (מוחלט)', en: 'ALC', syn: ['ALC', 'absolute lymphocyte count', 'Lymphocytes', 'לימפוציטים', 'lymphocyte count'], unit: '10^9/L', cat: 'hematology' },
  { key: 'lymphocytes_pct', he: 'לימפוציטים (%)', en: 'Lymphocytes %', syn: ['לימפוציטים אחוז'], unit: '%', cat: 'hematology' },
  { key: 'monocytes_pct', he: 'מונוציטים (%)', en: 'Monocytes %', syn: ['מונוציטים', 'monocytes', 'mono'], unit: '%', cat: 'hematology' },
  { key: 'eosinophils_abs', he: 'אאוזינופילים (מוחלט)', en: 'AEC', syn: ['אאוזינופילים', 'eosinophils', 'eosinophil count'], unit: '10^9/L', cat: 'hematology' },
  { key: 'eosinophils_pct', he: 'אאוזינופילים (%)', en: 'Eosinophils %', syn: ['eos'], unit: '%', cat: 'hematology' },
  { key: 'basophils_pct', he: 'בזופילים (%)', en: 'Basophils %', syn: ['בזופילים', 'basophils', 'baso'], unit: '%', cat: 'hematology' },
  { key: 'reticulocytes', he: 'רטיקולוציטים', en: 'Reticulocytes', syn: ['retic', 'רטיקס'], unit: '%', cat: 'hematology' },
  { key: 'blasts', he: 'תאי בלסט', en: 'Blasts', syn: ['בלסטים', 'blast cells'], unit: '%', cat: 'hematology' },
  { key: 'blood_smear', he: 'משטח דם היקפי', en: 'Peripheral smear', syn: ['משטח', 'smear', 'מורפולוגיה'], type: RESULT_TYPES.TEXT, cat: 'hematology' },
  { key: 'esr', he: 'שקיעת דם', en: 'ESR', syn: ['ESR', 'שקיעה', 'sed rate'], unit: 'mm/hr', cat: 'inflammation' },
  { key: 'hemoglobin_electrophoresis', he: 'אלקטרופורזה של המוגלובין', en: 'Hb electrophoresis', syn: ['Hb electro', 'HbA2', 'HbF'], type: RESULT_TYPES.TEXT, cat: 'hematology' },
  { key: 'g6pd', he: 'G6PD', en: 'G6PD', syn: ['G6PD', 'גלוקוז-6-פוספט'], unit: 'U/g Hb', cat: 'hematology' },
  { key: 'coombs_direct', he: 'קומבס ישיר', en: 'Direct Coombs (DAT)', syn: ['DAT', 'קומבס'], type: RESULT_TYPES.QUALITATIVE, cat: 'hematology' },

  /* ── קרישה ─────────────────────────────────────────────────────────── */
  { key: 'pt', he: 'זמן פרותרומבין', en: 'PT', syn: ['PT'], unit: 'sec', cat: 'coagulation' },
  { key: 'inr', he: 'INR', en: 'INR', syn: ['INR'], unit: '', cat: 'coagulation' },
  { key: 'ptt', he: 'PTT', en: 'aPTT', syn: ['aPTT', 'PTT'], unit: 'sec', cat: 'coagulation' },
  { key: 'fibrinogen', he: 'פיברינוגן', en: 'Fibrinogen', syn: ['פיברינוגן'], unit: 'mg/dL', cat: 'coagulation' },
  { key: 'd_dimer', he: 'D-dimer', en: 'D-dimer', syn: ['D dimer'], unit: 'ng/mL', cat: 'coagulation' },
  { key: 'factor_viii', he: 'פקטור VIII', en: 'Factor VIII', syn: ['factor 8'], unit: '%', cat: 'coagulation' },
  { key: 'factor_ix', he: 'פקטור IX', en: 'Factor IX', syn: ['factor 9'], unit: '%', cat: 'coagulation' },
  { key: 'vwf', he: 'פון-וילברנד', en: 'von Willebrand factor', syn: ['vWF'], unit: '%', cat: 'coagulation' },

  /* ── אלקטרוליטים וכליה ─────────────────────────────────────────────── */
  { key: 'sodium', he: 'נתרן', en: 'Sodium', syn: ['Na', 'נתרן'], unit: 'mmol/L', cat: 'renal' },
  { key: 'potassium', he: 'אשלגן', en: 'Potassium', syn: ['K', 'אשלגן'], unit: 'mmol/L', cat: 'renal' },
  { key: 'chloride', he: 'כלור', en: 'Chloride', syn: ['Cl'], unit: 'mmol/L', cat: 'renal' },
  { key: 'bicarbonate', he: 'ביקרבונט', en: 'Bicarbonate', syn: ['HCO3', 'ביקרב'], unit: 'mmol/L', cat: 'renal' },
  { key: 'anion_gap', he: 'Anion gap', en: 'Anion gap', syn: ['AG'], unit: 'mmol/L', cat: 'renal' },
  { key: 'urea', he: 'אוריאה', en: 'Urea / BUN', syn: ['BUN', 'אוריאה'], unit: 'mg/dL', cat: 'renal' },
  { key: 'creatinine', he: 'קריאטינין', en: 'Creatinine', syn: ['Cr', 'קראטינין'], unit: 'mg/dL', cat: 'renal' },
  { key: 'egfr', he: 'eGFR', en: 'eGFR', syn: ['GFR'], unit: 'mL/min/1.73m²', cat: 'renal' },
  { key: 'calcium', he: 'סידן', en: 'Calcium', syn: ['Ca', 'סידן'], unit: 'mg/dL', cat: 'chemistry' },
  { key: 'calcium_ionized', he: 'סידן מיונן', en: 'Ionized calcium', syn: ['iCa'], unit: 'mmol/L', cat: 'chemistry' },
  { key: 'phosphorus', he: 'זרחן', en: 'Phosphorus', syn: ['PO4', 'P', 'פוספט'], unit: 'mg/dL', cat: 'chemistry' },
  { key: 'magnesium', he: 'מגנזיום', en: 'Magnesium', syn: ['Mg'], unit: 'mg/dL', cat: 'chemistry' },
  { key: 'uric_acid', he: 'חומצה אורית', en: 'Uric acid', syn: ['uric'], unit: 'mg/dL', cat: 'chemistry' },
  { key: 'osmolality_serum', he: 'אוסמולריות בדם', en: 'Serum osmolality', syn: ['osmolality'], unit: 'mOsm/kg', cat: 'renal' },

  /* ── כבד וחלבונים ──────────────────────────────────────────────────── */
  { key: 'alt', he: 'ALT', en: 'ALT (SGPT)', syn: ['SGPT', 'ALT', 'GPT', 'ALT GPT', 'ALT(GPT)', 'SGPT ALT'], unit: 'U/L', cat: 'liver' },
  { key: 'ast', he: 'AST', en: 'AST (SGOT)', syn: ['SGOT', 'AST', 'GOT', 'AST GOT', 'AST(GOT)', 'SGOT AST'], unit: 'U/L', cat: 'liver' },
  { key: 'ggt', he: 'GGT', en: 'GGT', syn: ['GGT', 'גמא GT'], unit: 'U/L', cat: 'liver' },
  { key: 'alp', he: 'פוספטאזה אלקלית', en: 'ALP', syn: ['ALP', 'אלקליין', 'alkaline phosphatase', 'alk phosphatase', 'alk phos', 'ALKP', 'ALK. PHOSPHATASE'], unit: 'U/L', cat: 'liver' },
  { key: 'bilirubin_total', he: 'בילירובין כללי', en: 'Total bilirubin', syn: ['בילירובין', 'TBIL'], unit: 'mg/dL', cat: 'liver' },
  { key: 'bilirubin_direct', he: 'בילירובין ישיר', en: 'Direct bilirubin', syn: ['DBIL', 'conjugated'], unit: 'mg/dL', cat: 'liver' },
  { key: 'albumin', he: 'אלבומין', en: 'Albumin', syn: ['ALB', 'אלבומין'], unit: 'g/dL', cat: 'liver' },
  { key: 'total_protein', he: 'חלבון כללי', en: 'Total protein', syn: ['TP', 'חלבון'], unit: 'g/dL', cat: 'chemistry' },
  { key: 'ammonia', he: 'אמוניה', en: 'Ammonia', syn: ['NH3', 'אמוניה'], unit: 'µmol/L', cat: 'liver' },
  { key: 'ldh', he: 'LDH', en: 'LDH', syn: ['LDH'], unit: 'U/L', cat: 'chemistry' },
  { key: 'ck', he: 'CK', en: 'Creatine kinase', syn: ['CPK', 'CK'], unit: 'U/L', cat: 'chemistry' },
  { key: 'amylase', he: 'עמילאז', en: 'Amylase', syn: ['עמילז'], unit: 'U/L', cat: 'chemistry' },
  { key: 'lipase', he: 'ליפאז', en: 'Lipase', syn: ['ליפז'], unit: 'U/L', cat: 'chemistry' },

  /* ── שומנים וגלוקוז ────────────────────────────────────────────────── */
  { key: 'glucose', he: 'גלוקוז', en: 'Glucose', syn: ['סוכר', 'GLU'], unit: 'mg/dL', cat: 'chemistry' },
  { key: 'hba1c', he: 'HbA1c', en: 'HbA1c', syn: ['A1C', 'המוגלובין מסוכרר'], unit: '%', cat: 'endocrine' },
  { key: 'cholesterol_total', he: 'כולסטרול כללי', en: 'Total cholesterol', syn: ['כולסטרול', 'cholesterol', 'chol', 'total cholesterol', 'cholesterol total'], unit: 'mg/dL', cat: 'lipids' },
  { key: 'ldl', he: 'LDL', en: 'LDL cholesterol', syn: ['LDL', 'LDL-C', 'LDLC', 'LDL cholesterol', 'cholesterol LDL', 'cholesterol-LDL', 'CHOLESTEROL-LDL calc', 'LDL calc', 'LDL calculated', 'CHOLESTEROL-LDL'], unit: 'mg/dL', cat: 'lipids' },
  { key: 'hdl', he: 'HDL', en: 'HDL cholesterol', syn: ['HDL', 'HDL-C', 'HDLC', 'HDL cholesterol', 'cholesterol HDL', 'cholesterol-HDL', 'CHOLESTEROL-HDL'], unit: 'mg/dL', cat: 'lipids' },
  { key: 'non_hdl_cholesterol', he: 'כולסטרול לא-HDL', en: 'Non-HDL cholesterol', syn: ['non HDL', 'nonHDL', 'non-HDL cholesterol', 'non HDL cholesterol', 'NON-HDL_CHOLESTEROL'], unit: 'mg/dL', cat: 'lipids' },
  { key: 'triglycerides', he: 'טריגליצרידים', en: 'Triglycerides', syn: ['TG', 'טריגליצרידים', 'triglyceride'], unit: 'mg/dL', cat: 'lipids' },

  /* ── סמני דלקת ─────────────────────────────────────────────────────── */
  { key: 'crp', he: 'CRP', en: 'C-reactive protein', syn: ['CRP', 'חלבון מגיב C'], unit: 'mg/L', cat: 'inflammation' },
  { key: 'procalcitonin', he: 'פרוקלציטונין', en: 'Procalcitonin', syn: ['PCT', 'פרוקלציטונין'], unit: 'ng/mL', cat: 'inflammation' },
  { key: 'ferritin', he: 'פריטין', en: 'Ferritin', syn: ['פריטין'], unit: 'ng/mL', cat: 'inflammation' },
  { key: 'il6', he: 'IL-6', en: 'Interleukin-6', syn: ['IL6'], unit: 'pg/mL', cat: 'inflammation' },

  /* ── אנדוקרינולוגיה ────────────────────────────────────────────────── */
  { key: 'tsh', he: 'TSH', en: 'TSH', syn: ['TSH'], unit: 'mIU/L', cat: 'endocrine' },
  { key: 'ft4', he: 'FT4', en: 'Free T4', syn: ['FT4', 'T4 חופשי', 'T4 FREE', 'FREE T4', 'T4-FREE'], unit: 'ng/dL', cat: 'endocrine' },
  { key: 'ft3', he: 'FT3', en: 'Free T3', syn: ['FT3', 'T3 חופשי', 'T3 FREE', 'FREE T3', 'T3-FREE'], unit: 'pg/mL', cat: 'endocrine' },
  { key: 'anti_tpo', he: 'נוגדני TPO', en: 'Anti-TPO', syn: ['TPO', 'אנטי TPO'], unit: 'IU/mL', cat: 'endocrine' },
  { key: 'cortisol', he: 'קורטיזול', en: 'Cortisol', syn: ['קורטיזול'], unit: 'µg/dL', cat: 'endocrine' },
  { key: 'acth', he: 'ACTH', en: 'ACTH', syn: ['ACTH'], unit: 'pg/mL', cat: 'endocrine' },
  { key: 'gh', he: 'הורמון גדילה', en: 'Growth hormone', syn: ['GH', 'הורמון גדילה'], unit: 'ng/mL', cat: 'endocrine' },
  { key: 'igf1', he: 'IGF-1', en: 'IGF-1', syn: ['IGF1', 'סומטומדין C'], unit: 'ng/mL', cat: 'endocrine' },
  { key: 'insulin', he: 'אינסולין', en: 'Insulin', syn: ['אינסולין'], unit: 'µIU/mL', cat: 'endocrine' },
  { key: 'c_peptide', he: 'C-peptide', en: 'C-peptide', syn: ['C peptide'], unit: 'ng/mL', cat: 'endocrine' },
  { key: 'lh', he: 'LH', en: 'LH', syn: ['LH'], unit: 'IU/L', cat: 'endocrine' },
  { key: 'fsh', he: 'FSH', en: 'FSH', syn: ['FSH'], unit: 'IU/L', cat: 'endocrine' },
  { key: 'estradiol', he: 'אסטרדיול', en: 'Estradiol', syn: ['E2'], unit: 'pg/mL', cat: 'endocrine' },
  { key: 'testosterone', he: 'טסטוסטרון', en: 'Testosterone', syn: ['טסטו'], unit: 'ng/dL', cat: 'endocrine' },
  { key: 'prolactin', he: 'פרולקטין', en: 'Prolactin', syn: ['PRL'], unit: 'ng/mL', cat: 'endocrine' },
  { key: 'pth', he: 'PTH', en: 'Parathyroid hormone', syn: ['PTH', 'הורמון פארתירואיד'], unit: 'pg/mL', cat: 'endocrine' },
  { key: 'aldosterone', he: 'אלדוסטרון', en: 'Aldosterone', syn: ['אלדוסטרון'], unit: 'ng/dL', cat: 'endocrine' },
  { key: 'renin', he: 'רנין', en: 'Renin', syn: ['PRA'], unit: 'ng/mL/hr', cat: 'endocrine' },
  { key: 'ohp17', he: '17-OH פרוגסטרון', en: '17-OH progesterone', syn: ['17OHP'], unit: 'ng/dL', cat: 'endocrine' },

  /* ── ויטמינים ומינרלים ─────────────────────────────────────────────── */
  { key: 'vitamin_d', he: 'ויטמין D', en: '25-OH Vitamin D', syn: ['25OHD', 'ויטמין די'], unit: 'ng/mL', cat: 'vitamins' },
  { key: 'vitamin_b12', he: 'ויטמין B12', en: 'Vitamin B12', syn: ['B12', 'קובלמין'], unit: 'pg/mL', cat: 'vitamins' },
  { key: 'folate', he: 'חומצה פולית', en: 'Folate', syn: ['פולאט', 'folic acid'], unit: 'ng/mL', cat: 'vitamins' },
  { key: 'iron', he: 'ברזל', en: 'Iron', syn: ['Fe', 'ברזל'], unit: 'µg/dL', cat: 'vitamins' },
  { key: 'transferrin_sat', he: 'רוויון טרנספרין', en: 'Transferrin saturation', syn: ['TSAT'], unit: '%', cat: 'vitamins' },
  { key: 'transferrin', he: 'טרנספרין', en: 'Transferrin', syn: ['transferrin'], unit: 'mg/dL', cat: 'vitamins' },
  { key: 'tibc', he: 'TIBC', en: 'TIBC', syn: ['TIBC'], unit: 'µg/dL', cat: 'vitamins' },
  { key: 'zinc', he: 'אבץ', en: 'Zinc', syn: ['Zn'], unit: 'µg/dL', cat: 'vitamins' },
  { key: 'lead', he: 'עופרת', en: 'Lead', syn: ['Pb', 'עופרת'], unit: 'µg/dL', cat: 'vitamins' },

  /* ── אימונולוגיה וראומטולוגיה ──────────────────────────────────────── */
  { key: 'ana', he: 'ANA', en: 'Antinuclear antibody', syn: ['ANA', 'נוגדנים אנטי-גרעיניים'], type: RESULT_TYPES.TITER, cat: 'immunology' },
  { key: 'anti_dsdna', he: 'Anti-dsDNA', en: 'Anti-dsDNA', syn: ['dsDNA'], unit: 'IU/mL', cat: 'immunology' },
  { key: 'rf', he: 'גורם ראומטי', en: 'Rheumatoid factor', syn: ['RF', 'ראומטויד'], unit: 'IU/mL', cat: 'immunology' },
  // נדרש להבחנה בין Drug-Induced Lupus ל-SLE ראשוני — המדד היחיד
  // שמפריד ביניהם (nelson.ראומטולוגיה.SLE).
  { key: 'anti_histone', he: 'Anti-Histone', en: 'Anti-histone antibody', syn: ['נוגדני היסטון', 'antihistone'], type: RESULT_TYPES.TITER, cat: 'immunology' },
  { key: 'anti_ccp', he: 'Anti-CCP', en: 'Anti-CCP', syn: ['CCP'], unit: 'U/mL', cat: 'immunology' },
  { key: 'anca', he: 'ANCA', en: 'ANCA', syn: ['pANCA', 'cANCA'], type: RESULT_TYPES.QUALITATIVE, cat: 'immunology' },
  { key: 'c3', he: 'משלים C3', en: 'Complement C3', syn: ['C3'], unit: 'mg/dL', cat: 'immunology' },
  { key: 'c4', he: 'משלים C4', en: 'Complement C4', syn: ['C4'], unit: 'mg/dL', cat: 'immunology' },
  { key: 'ch50', he: 'CH50', en: 'CH50', syn: ['CH50'], unit: 'U/mL', cat: 'immunology' },
  { key: 'igg', he: 'IgG', en: 'IgG', syn: ['IgG'], unit: 'mg/dL', cat: 'immunology' },
  { key: 'iga', he: 'IgA', en: 'IgA', syn: ['IgA'], unit: 'mg/dL', cat: 'immunology' },
  { key: 'igm', he: 'IgM', en: 'IgM', syn: ['IgM'], unit: 'mg/dL', cat: 'immunology' },
  { key: 'ige', he: 'IgE', en: 'IgE', syn: ['IgE'], unit: 'IU/mL', cat: 'immunology' },
  { key: 'anti_ttg_iga', he: 'Anti-tTG IgA', en: 'Anti-tissue transglutaminase IgA', syn: ['tTG', 'צליאק'], unit: 'U/mL', cat: 'immunology' },
  { key: 'anti_endomysial', he: 'נוגדני אנדומיזיום', en: 'Anti-endomysial antibody', syn: ['EMA'], type: RESULT_TYPES.QUALITATIVE, cat: 'immunology' },
  { key: 'lymphocyte_subsets', he: 'תת-אוכלוסיות לימפוציטים', en: 'Lymphocyte subsets', syn: ['CD4', 'CD8', 'CD19', 'flow cytometry'], type: RESULT_TYPES.TEXT, cat: 'immunology' },
  { key: 'hla_b27', he: 'HLA-B27', en: 'HLA-B27', syn: ['B27'], type: RESULT_TYPES.QUALITATIVE, cat: 'immunology' },

  /* ── מיקרוביולוגיה ─────────────────────────────────────────────────── */
  { key: 'blood_culture', he: 'תרבית דם', en: 'Blood culture', syn: ['תרבית דם', 'BC'], type: RESULT_TYPES.ORGANISM, cat: 'microbiology' },
  { key: 'urine_culture', he: 'תרבית שתן', en: 'Urine culture', syn: ['תרבית שתן', 'UC'], type: RESULT_TYPES.ORGANISM, cat: 'microbiology' },
  { key: 'csf_culture', he: 'תרבית CSF', en: 'CSF culture', syn: ['תרבית נוזל שדרה'], type: RESULT_TYPES.ORGANISM, cat: 'microbiology' },
  { key: 'throat_culture', he: 'תרבית גרון', en: 'Throat culture', syn: ['תרבית גרון'], type: RESULT_TYPES.ORGANISM, cat: 'microbiology' },
  { key: 'stool_culture', he: 'תרבית צואה', en: 'Stool culture', syn: ['תרבית צואה'], type: RESULT_TYPES.ORGANISM, cat: 'microbiology' },
  { key: 'wound_culture', he: 'תרבית פצע', en: 'Wound culture', syn: ['תרבית פצע'], type: RESULT_TYPES.ORGANISM, cat: 'microbiology' },
  { key: 'strep_rapid', he: 'בדיקת סטרפ מהירה', en: 'Rapid strep test', syn: ['strep', 'סטרפטוקוק מהיר'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },
  { key: 'respiratory_panel', he: 'פאנל נשימתי (PCR)', en: 'Respiratory viral panel', syn: ['פאנל ויראלי', 'RVP', 'multiplex PCR'], type: RESULT_TYPES.TEXT, cat: 'microbiology' },
  { key: 'influenza_pcr', he: 'שפעת PCR', en: 'Influenza PCR', syn: ['שפעת', 'flu'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },
  { key: 'rsv', he: 'RSV', en: 'RSV', syn: ['RSV'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },
  { key: 'covid_pcr', he: 'קורונה PCR', en: 'SARS-CoV-2 PCR', syn: ['COVID', 'קורונה'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },
  { key: 'gram_stain', he: 'צביעת גרם', en: 'Gram stain', syn: ['גרם'], type: RESULT_TYPES.TEXT, cat: 'microbiology' },
  { key: 'afb', he: 'צביעת AFB', en: 'Acid-fast bacilli', syn: ['AFB', 'שחפת'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },
  { key: 'quantiferon', he: 'QuantiFERON', en: 'IGRA / QuantiFERON', syn: ['IGRA', 'TB gold'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },
  { key: 'stool_parasites', he: 'טפילים בצואה', en: 'Stool O&P', syn: ['O&P', 'טפילים'], type: RESULT_TYPES.TEXT, cat: 'microbiology' },
  { key: 'c_difficile', he: 'C. difficile', en: 'C. difficile toxin', syn: ['CDIFF', 'קלוסטרידיום'], type: RESULT_TYPES.QUALITATIVE, cat: 'microbiology' },

  /* ── סרולוגיה ──────────────────────────────────────────────────────── */
  { key: 'ebv_serology', he: 'סרולוגיה EBV', en: 'EBV serology', syn: ['EBV', 'מונו', 'VCA'], type: RESULT_TYPES.TEXT, cat: 'serology' },
  { key: 'cmv_serology', he: 'סרולוגיה CMV', en: 'CMV serology', syn: ['CMV'], type: RESULT_TYPES.TEXT, cat: 'serology' },
  { key: 'monospot', he: 'Monospot', en: 'Monospot', syn: ['heterophile'], type: RESULT_TYPES.QUALITATIVE, cat: 'serology' },
  { key: 'hepatitis_b', he: 'סרולוגיה הפטיטיס B', en: 'Hepatitis B serology', syn: ['HBsAg', 'HBV'], type: RESULT_TYPES.TEXT, cat: 'serology' },
  { key: 'hepatitis_c', he: 'הפטיטיס C', en: 'Hepatitis C antibody', syn: ['HCV'], type: RESULT_TYPES.QUALITATIVE, cat: 'serology' },
  { key: 'hiv', he: 'HIV', en: 'HIV Ag/Ab', syn: ['HIV'], type: RESULT_TYPES.QUALITATIVE, cat: 'serology' },
  { key: 'aso', he: 'ASO', en: 'Antistreptolysin O', syn: ['ASLO', 'ASO'], unit: 'IU/mL', cat: 'serology' },
  { key: 'mycoplasma_serology', he: 'מיקופלזמה', en: 'Mycoplasma serology', syn: ['מיקופלזמה'], type: RESULT_TYPES.TEXT, cat: 'serology' },

  /* ── גנטיקה ────────────────────────────────────────────────────────── */
  { key: 'karyotype', he: 'קריוטיפ', en: 'Karyotype', syn: ['קריוטיפ', 'chromosomes'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'cma', he: 'צ׳יפ גנטי (CMA)', en: 'Chromosomal microarray', syn: ['CMA', 'microarray', 'צ׳יפ'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'wes', he: 'ריצוף אקסום', en: 'Whole exome sequencing', syn: ['WES', 'אקסום'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'wgs', he: 'ריצוף גנום', en: 'Whole genome sequencing', syn: ['WGS'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'fish', he: 'FISH', en: 'FISH', syn: ['FISH'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'cf_mutations', he: 'מוטציות CF', en: 'CFTR mutation panel', syn: ['CFTR', 'ציסטיק פיברוזיס'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'fragile_x', he: 'X שביר', en: 'Fragile X (FMR1)', syn: ['FMR1', 'fragile X'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'sma_carrier', he: 'SMA', en: 'SMN1 / SMA', syn: ['SMN1', 'SMA'], type: RESULT_TYPES.TEXT, cat: 'genetics' },
  { key: 'thrombophilia_panel', he: 'פאנל תרומבופיליה', en: 'Thrombophilia panel', syn: ['factor V leiden', 'MTHFR', 'prothrombin'], type: RESULT_TYPES.TEXT, cat: 'genetics' },

  /* ── מטבולי וסקר יילודים ───────────────────────────────────────────── */
  { key: 'newborn_screen', he: 'סקר יילודים', en: 'Newborn screening', syn: ['סקר ילודים', 'NBS'], type: RESULT_TYPES.TEXT, cat: 'metabolic' },
  { key: 'lactate', he: 'לקטט', en: 'Lactate', syn: ['לקטט', 'חומצה לקטית'], unit: 'mmol/L', cat: 'metabolic' },
  { key: 'pyruvate', he: 'פירובט', en: 'Pyruvate', syn: ['פירובאט'], unit: 'mmol/L', cat: 'metabolic' },
  { key: 'amino_acids', he: 'חומצות אמינו', en: 'Plasma amino acids', syn: ['amino acids', 'חומצות אמינו'], type: RESULT_TYPES.TEXT, cat: 'metabolic' },
  { key: 'organic_acids', he: 'חומצות אורגניות בשתן', en: 'Urine organic acids', syn: ['organic acids'], type: RESULT_TYPES.TEXT, cat: 'metabolic' },
  { key: 'acylcarnitine', he: 'אצילקרניטין', en: 'Acylcarnitine profile', syn: ['carnitine'], type: RESULT_TYPES.TEXT, cat: 'metabolic' },
  { key: 'ketones_blood', he: 'קטונים בדם', en: 'Beta-hydroxybutyrate', syn: ['BOHB', 'קטונים'], unit: 'mmol/L', cat: 'metabolic' },
  { key: 'sweat_chloride', he: 'מבחן זיעה', en: 'Sweat chloride', syn: ['sweat test', 'מבחן זיעה'], unit: 'mmol/L', cat: 'metabolic' },

  /* ── גזים בדם ──────────────────────────────────────────────────────── */
  { key: 'ph_blood', he: 'pH', en: 'pH', syn: ['pH'], unit: '', cat: 'bloodgas' },
  { key: 'pco2', he: 'pCO2', en: 'pCO2', syn: ['pCO2'], unit: 'mmHg', cat: 'bloodgas' },
  { key: 'po2', he: 'pO2', en: 'pO2', syn: ['pO2'], unit: 'mmHg', cat: 'bloodgas' },
  { key: 'base_excess', he: 'Base excess', en: 'Base excess', syn: ['BE'], unit: 'mmol/L', cat: 'bloodgas' },
  { key: 'o2_sat_lab', he: 'רוויון חמצן (מעבדה)', en: 'O2 saturation', syn: ['SaO2'], unit: '%', cat: 'bloodgas' },

  /* ── שתן ───────────────────────────────────────────────────────────── */
  { key: 'urine_protein', he: 'חלבון בשתן', en: 'Urine protein', syn: ['פרוטאינוריה', 'protein urine'], unit: 'mg/dL', cat: 'urine' },
  { key: 'urine_protein_24h', he: 'חלבון בשתן 24 שעות', en: '24h urine protein', syn: ['חלבון 24 שעות'], unit: 'g/24h', cat: 'urine' },
  { key: 'urine_protein_creat_ratio', he: 'יחס חלבון/קריאטינין בשתן', en: 'Urine protein/creatinine ratio', syn: ['UPCR', 'יחס חלבון קריאטינין'], unit: 'mg/mg', cat: 'urine' },
  { key: 'urine_blood', he: 'דם בשתן', en: 'Urine blood', syn: ['המטוריה', 'hematuria'], type: RESULT_TYPES.QUALITATIVE, cat: 'urine' },
  { key: 'urine_leukocyte_esterase', he: 'לויקוציט אסטראז', en: 'Leukocyte esterase', syn: ['LE'], type: RESULT_TYPES.QUALITATIVE, cat: 'urine' },
  { key: 'urine_nitrite', he: 'ניטריט בשתן', en: 'Urine nitrite', syn: ['ניטריט'], type: RESULT_TYPES.QUALITATIVE, cat: 'urine' },
  { key: 'urine_wbc', he: 'לויקוציטים בשתן', en: 'Urine WBC', syn: ['פיוריה', 'pyuria'], unit: '/HPF', cat: 'urine' },
  { key: 'urine_rbc', he: 'אריתרוציטים בשתן', en: 'Urine RBC', syn: ['RBC urine'], unit: '/HPF', cat: 'urine' },
  { key: 'urine_specific_gravity', he: 'משקל סגולי', en: 'Specific gravity', syn: ['SG'], unit: '', cat: 'urine' },
  { key: 'urine_glucose', he: 'גלוקוז בשתן', en: 'Urine glucose', syn: ['גליקוזוריה'], type: RESULT_TYPES.QUALITATIVE, cat: 'urine' },
  { key: 'urine_ketones', he: 'קטונים בשתן', en: 'Urine ketones', syn: ['קטונוריה'], type: RESULT_TYPES.QUALITATIVE, cat: 'urine' },
  { key: 'urine_sodium', he: 'נתרן בשתן', en: 'Urine sodium', syn: ['Na urine'], unit: 'mmol/L', cat: 'urine' },
  { key: 'urine_osmolality', he: 'אוסמולריות בשתן', en: 'Urine osmolality', syn: ['osm urine'], unit: 'mOsm/kg', cat: 'urine' },

  /* מדדי אבני כליה — נדרשים לכללי nelson.נפרולוגיה.נפרוליתיאזיס.
     ה-pH הוא הערך המספרי היחיד שמקור הידע נוקב עבורו סף (5.5 / 6.5),
     ולכן הוא היחיד שעליו נבנו LabPatterns. השאר נוספו כדי שהמלצות
     הבירור יוכלו להיפתר למדד מוכר. */
  { key: 'urine_ph', he: 'pH שתן', en: 'Urine pH', syn: ['pH בשתן', 'urine pH'], unit: '', cat: 'urine' },
  { key: 'urine_calcium', he: 'סידן בשתן', en: 'Urine calcium', syn: ['היפרקלציוריה', 'Ca urine'], unit: 'mg/24h', cat: 'urine' },
  { key: 'urine_oxalate', he: 'אוקסלאט בשתן', en: 'Urine oxalate', syn: ['אוקסלאט', 'oxalate'], unit: 'mg/24h', cat: 'urine' },
  { key: 'urine_urate', he: 'אוראט בשתן', en: 'Urine urate', syn: ['חומצת שתן בשתן', 'uric acid urine'], unit: 'mg/24h', cat: 'urine' },
  { key: 'urine_citrate', he: 'ציטראט בשתן', en: 'Urine citrate', syn: ['ציטראט', 'citrate'], unit: 'mg/24h', cat: 'urine' },
  { key: 'urine_cystine', he: 'ציסטין בשתן', en: 'Urine cystine', syn: ['ציסטין', 'cystine'], unit: 'mg/24h', cat: 'urine' },
  { key: 'urine_volume_24h', he: 'נפח שתן 24 שעות', en: '24h urine volume', syn: ['נפח שתן'], unit: 'mL/24h', cat: 'urine' },
  // נדרשים לזיהוי תסמונת פנקוני (nelson.נפרולוגיה.מחלות_טובולריות):
  // הצירוף גליקוזוריה + פרוטאינוריה + פוספטוריה הוא הדפוס המאבחן.
  { key: 'urine_phosphate', he: 'פוספט בשתן', en: 'Urine phosphate', syn: ['פוספטוריה', 'phosphate urine'], unit: 'mg/24h', cat: 'urine' },
  { key: 'urine_amino_acids', he: 'חומצות אמינו בשתן', en: 'Urine amino acids', syn: ['אמינו-אצידוריה', 'aminoaciduria'], type: RESULT_TYPES.TEXT, cat: 'urine' },

  /* ── נוזל שדרה ─────────────────────────────────────────────────────── */
  { key: 'csf_wbc', he: 'לויקוציטים ב-CSF', en: 'CSF WBC', syn: ['CSF WBC', 'פלאוציטוזיס'], unit: '/µL', cat: 'csf' },
  { key: 'csf_rbc', he: 'אריתרוציטים ב-CSF', en: 'CSF RBC', syn: ['CSF RBC'], unit: '/µL', cat: 'csf' },
  { key: 'csf_protein', he: 'חלבון ב-CSF', en: 'CSF protein', syn: ['CSF protein'], unit: 'mg/dL', cat: 'csf' },
  { key: 'csf_glucose', he: 'גלוקוז ב-CSF', en: 'CSF glucose', syn: ['CSF glucose'], unit: 'mg/dL', cat: 'csf' },
  { key: 'csf_glucose_ratio', he: 'יחס גלוקוז CSF/דם', en: 'CSF/serum glucose ratio', syn: ['glucose ratio'], unit: '', cat: 'csf' },
  { key: 'csf_lactate', he: 'לקטט ב-CSF', en: 'CSF lactate', syn: ['CSF lactate'], unit: 'mmol/L', cat: 'csf' },
  { key: 'csf_pcr_panel', he: 'פאנל PCR ל-CSF', en: 'CSF meningitis PCR panel', syn: ['meningitis panel'], type: RESULT_TYPES.TEXT, cat: 'csf' },

  /* ── סמנים קרדיאליים וגידוליים ─────────────────────────────────────── */
  { key: 'troponin', he: 'טרופונין', en: 'Troponin', syn: ['troponin I', 'troponin T'], unit: 'ng/L', cat: 'cardiac' },
  { key: 'bnp', he: 'BNP', en: 'BNP / NT-proBNP', syn: ['NT-proBNP', 'proBNP'], unit: 'pg/mL', cat: 'cardiac' },
  { key: 'ck_mb', he: 'CK-MB', en: 'CK-MB', syn: ['CKMB'], unit: 'ng/mL', cat: 'cardiac' },
  { key: 'afp', he: 'AFP', en: 'Alpha-fetoprotein', syn: ['AFP'], unit: 'ng/mL', cat: 'tumor' },
  { key: 'bhcg', he: 'בטא-HCG', en: 'Beta-hCG', syn: ['hCG', 'בטא HCG'], unit: 'mIU/mL', cat: 'tumor' },
  { key: 'catecholamines_urine', he: 'קטכולאמינים בשתן', en: 'Urine catecholamines / VMA-HVA', syn: ['VMA', 'HVA', 'קטכולאמינים'], type: RESULT_TYPES.TEXT, cat: 'tumor' },
  { key: 'ldh_tumor', he: 'LDH (סמן גידול)', en: 'LDH (tumor marker)', syn: [], unit: 'U/L', cat: 'tumor' },
];

/** מנרמל מחרוזת לצורך התאמה.
 * מסיר גם נקודות וסוגריים כדי ש-"ALK. PHOSPHATASE", "AST (GOT)" ו-"ALT (GPT)"
 * יותאמו למדד הקנוני (אחרת הסוגריים/הנקודה שוברים את ההתאמה). */
function norm(s) {
  return String(s ?? '').trim().toLowerCase()
    .replace(/[״"'׳`]/g, '')
    .replace(/[().]/g, '')
    .replace(/[\s_-]+/g, '');
}

// אינדקס חיפוש: כל שם/קיצור → הרשומה
const INDEX = new Map();
for (const a of CATALOG) {
  const entry = { ...a, type: a.type ?? RESULT_TYPES.NUMERIC, unit: a.unit ?? '' };
  for (const name of [entry.key, entry.he, entry.en, ...(entry.syn ?? [])]) {
    const n = norm(name);
    if (n && !INDEX.has(n)) INDEX.set(n, entry);
  }
}

export const ALL_ANALYTES = CATALOG.map((a) => ({
  ...a,
  type: a.type ?? RESULT_TYPES.NUMERIC,
  unit: a.unit ?? '',
}));

/**
 * מזהה מדד מטקסט חופשי שהמשתמש הקליד.
 * מחזיר null אם לא זוהה — והמערכת תתייחס אליו כמדד חופשי, לא תמציא לו זהות.
 */
export function resolveAnalyte(input) {
  const n = norm(input);
  if (!n) return null;
  const direct = INDEX.get(n);
  if (direct) return direct;

  // נפילה מודעת-סיומת: ספירות מובדלות מדווחות לעיתים כ"X Abs" / "X #"
  // (ספירה מוחלטת) או "X %" (אחוז). ממפים לאח הנכון לפי הסיומת.
  const isPct = /(%|percent|percentage)$/.test(n);
  const isAbs = /(abs|absolute|abscount|count|#)$/.test(n);
  if (isPct || isAbs) {
    const base = n.replace(/(%|percent|percentage|abs|absolute|abscount|count|#)+$/g, '');
    const baseHit = base && INDEX.get(base);
    if (baseHit) {
      const stem = String(baseHit.key).replace(/_(abs|pct)$/, '');
      const wantKey = isPct ? `${stem}_pct` : `${stem}_abs`;
      const sibling = ALL_ANALYTES.find((a) => a.key === wantKey);
      return sibling ?? baseHit;
    }
  }
  return null;
}

/** מפתח קנוני להתאמת LabPattern. אם לא זוהה — המחרוזת המנורמלת. */
export function canonicalKey(input) {
  return resolveAnalyte(input)?.key ?? norm(input);
}

/** חיפוש להשלמה אוטומטית. */
export function searchAnalytes(query, limit = 12) {
  const q = norm(query);
  if (!q) return [];

  const scored = [];
  for (const a of ALL_ANALYTES) {
    const names = [a.he, a.en, a.key, ...(a.syn ?? [])];
    let best = Infinity;
    for (const name of names) {
      const n = norm(name);
      if (n === q) { best = 0; break; }
      if (n.startsWith(q)) best = Math.min(best, 1);
      else if (n.includes(q)) best = Math.min(best, 2);
    }
    if (best < Infinity) scored.push({ a, score: best });
  }

  scored.sort((x, y) => x.score - y.score || x.a.he.localeCompare(y.a.he, 'he'));
  return scored.slice(0, limit).map((s) => s.a);
}

/** מדדים לפי קטגוריה — לתצוגת עיון. */
export function analytesByCategory() {
  const out = {};
  for (const a of ALL_ANALYTES) {
    (out[a.cat] ??= []).push(a);
  }
  return out;
}

export const CATALOG_SIZE = ALL_ANALYTES.length;
