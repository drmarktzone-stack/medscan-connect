/**
 * MedScan — Deterministic Calculators
 *
 * כלל-ברזל: מינונים, נוזלים, percentiles, GFR ונוסחאות תיקון מחושבים **רק כאן**,
 * בקוד נבדק. ה-LLM לעולם אינו מחשב מספר קריטי — הוא מצטט ערך D# שחושב כאן.
 *
 * שני סוגי מחשבונים, והבחנה ביניהם קריטית:
 *
 *  (א) נוסחאות אריתמטיות טהורות — Holliday-Segar, Schwartz, BSA.
 *      הנוסחה עצמה היא הגדרה מתמטית מפורסמת. מותר לממש אותה בקוד.
 *      עדיין: כל תוצאה נושאת `requires_local_verification` — כי ההחלטה
 *      *להשתמש* בנוסחה במטופל מסוים היא קלינית, לא חשבונית.
 *
 *  (ב) טבלאות מינון — **אינן מיושמות כאן ולא יוטמעו מהזיכרון.**
 *      מנוע המינון מקבל רשומה מאומתת מישות DoseRecord ומבצע עליה אריתמטיקה.
 *      בלי רשומה מאומתת הוא מסרב לחשב. זו אינה מגבלה — זו התכונה.
 */

const isNum = (v) => Number.isFinite(Number(v));
const round = (v, d = 2) => Number(Number(v).toFixed(d));

/** מבנה תוצאה אחיד — מה שנכנס ל-FACT BLOCK כ-D#. */
function result({ key, label_he, value, unit, formula_source, inputs, notes_he = [], requires_local_verification = true }) {
  return {
    key,
    label_he,
    value,
    unit,
    formula_source,
    inputs,
    notes_he,
    requires_local_verification,
    computed_by: 'deterministic_code',
    computed_at: new Date().toISOString(),
  };
}

function failure(key, message_he, details = {}) {
  return { key, ok: false, error: 'calculation_refused', message_he, ...details };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 1. נוזלי אחזקה — Holliday-Segar
 * נוסחה: 100 מ"ל/ק"ג ל-10 הק"ג הראשונים, 50 לעשרה הבאים, 20 לכל ק"ג מעבר.
 * זו הגדרה אריתמטית מפורסמת ופומבית, לא המלצה קלינית.
 * ההחלטה האם המטופל זקוק לאחזקה מלאה/מוגבלת/מוגברת — קלינית, לא כאן.
 * ──────────────────────────────────────────────────────────────────────── */
export function maintenanceFluids({ weight_kg }) {
  if (!isNum(weight_kg) || weight_kg <= 0) {
    return failure('fluids.maintenance', 'לא סופק משקל תקין. לא ניתן לחשב נוזלי אחזקה.');
  }
  const w = Number(weight_kg);

  const first = Math.min(w, 10) * 100;
  const second = Math.max(0, Math.min(w, 20) - 10) * 50;
  const third = Math.max(0, w - 20) * 20;
  const perDay = first + second + third;

  return {
    ok: true,
    ...result({
      key: 'fluids.maintenance',
      label_he: 'נוזלי אחזקה ל-24 שעות (Holliday-Segar)',
      value: round(perDay, 0),
      unit: 'mL/24h',
      formula_source: 'Holliday-Segar — נוסחה אריתמטית (100/50/20 mL/kg לפי מדרגות משקל)',
      inputs: { weight_kg: w },
      notes_he: [
        'הנוסחה מחשבת אחזקה בלבד. אינה כוללת גירעון, אובדנים מתמשכים או תיקון.',
        'במצבים כמו SIADH, אי-ספיקת לב/כליה או בצקת מוחית — יש לשקול הגבלת נוזלים לפי הפרוטוקול המחלקתי.',
        'הקצב השעתי הוא חלוקה אריתמטית ל-24 ואינו מהווה הוראת מתן.',
      ],
    }),
    per_hour: round(perDay / 24, 1),
    breakdown: {
      first_10kg_mL: round(first, 0),
      next_10kg_mL: round(second, 0),
      above_20kg_mL: round(third, 0),
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. GFR משוער — Bedside Schwartz
 * eGFR = k × גובה(ס"מ) / קריאטינין(mg/dL)
 * מקדם k תלוי-שיטה ותלוי-אוכלוסייה — לכן הוא **פרמטר חובה מבחוץ**,
 * ולא מוטמע כאן. מעבדה שמודדת קריאטינין בשיטה אנזימטית מכוילת-IDMS
 * משתמשת במקדם שונה מזו שמודדת בשיטת Jaffe.
 * ──────────────────────────────────────────────────────────────────────── */
export function estimatedGFR({ height_cm, creatinine_mg_dl, k_coefficient, k_source }) {
  if (!isNum(height_cm) || height_cm <= 0) {
    return failure('renal.egfr', 'לא סופק גובה תקין. לא ניתן לחשב eGFR.');
  }
  if (!isNum(creatinine_mg_dl) || creatinine_mg_dl <= 0) {
    return failure('renal.egfr', 'לא סופק ערך קריאטינין תקין. לא ניתן לחשב eGFR.');
  }
  if (!isNum(k_coefficient)) {
    return failure(
      'renal.egfr',
      'לא סופק מקדם k. מקדם Schwartz תלוי בשיטת מדידת הקריאטינין במעבדה שלך ' +
      'ובאוכלוסיית הייחוס — הוא חייב להגיע מהמעבדה או מהפרוטוקול המחלקתי, ' +
      'ולא מהמערכת. ללא מקדם מאומת החישוב לא יבוצע.',
      { missing: 'k_coefficient' }
    );
  }

  const egfr = (Number(k_coefficient) * Number(height_cm)) / Number(creatinine_mg_dl);

  return {
    ok: true,
    ...result({
      key: 'renal.egfr',
      label_he: 'eGFR משוער (Bedside Schwartz)',
      value: round(egfr, 1),
      unit: 'mL/min/1.73m²',
      formula_source: `Bedside Schwartz: k × גובה / קריאטינין (k=${k_coefficient}, מקור: ${k_source ?? 'לא צוין'})`,
      inputs: { height_cm: Number(height_cm), creatinine_mg_dl: Number(creatinine_mg_dl), k_coefficient: Number(k_coefficient) },
      notes_he: [
        'הערכה בלבד. אינה מהימנה במצבי אי-יציבות של תפקוד כלייתי, במסת שריר חריגה, או בגיל צעיר מאוד.',
        'המקדם k תלוי-שיטה — ודא/י שהוא תואם לשיטת המדידה במעבדה המבצעת.',
      ],
    }),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. שטח גוף — Mosteller
 * BSA = √(גובה(ס"מ) × משקל(ק"ג) / 3600)
 * ──────────────────────────────────────────────────────────────────────── */
export function bodySurfaceArea({ height_cm, weight_kg }) {
  if (!isNum(height_cm) || !isNum(weight_kg) || height_cm <= 0 || weight_kg <= 0) {
    return failure('anthro.bsa', 'נדרשים גובה ומשקל תקינים לחישוב שטח גוף.');
  }
  const bsa = Math.sqrt((Number(height_cm) * Number(weight_kg)) / 3600);

  return {
    ok: true,
    ...result({
      key: 'anthro.bsa',
      label_he: 'שטח גוף (Mosteller)',
      value: round(bsa, 2),
      unit: 'm²',
      formula_source: 'Mosteller: √(גובה × משקל / 3600)',
      inputs: { height_cm: Number(height_cm), weight_kg: Number(weight_kg) },
      notes_he: ['נוסחת אומדן. שיטות שונות נותנות תוצאות שונות במעט.'],
    }),
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. מנוע מינון לפי משקל
 *
 * ⚠ אין כאן ולו טבלת מינון אחת, ולא תהיה.
 * המנוע מקבל רשומת-מינון מאומתת מישות DoseRecord ומבצע עליה אריתמטיקה
 * בלבד. ללא רשומה מאומתת — מסרב.
 * ──────────────────────────────────────────────────────────────────────── */
export function weightBasedDose({ weight_kg, age_days, doseRecord }) {
  if (!doseRecord) {
    return failure(
      'dosing.weight_based',
      'לא סופקה רשומת מינון מאומתת. MedScan אינו מחזיק טבלאות מינון פנימיות ' +
      'ואינו מסיק מינון מהידע הכללי של מנוע השפה. המינון חייב להגיע ' +
      'מהפרוטוקול המחלקתי או מטבלה שאומתה ע"י רופא/ה.',
      { missing: 'doseRecord' }
    );
  }
  if (doseRecord.verification_status !== 'verified') {
    return failure(
      'dosing.weight_based',
      `רשומת המינון עבור "${doseRecord.drug_name_he ?? doseRecord.drug_key}" ` +
      `אינה מאומתת (סטטוס: ${doseRecord.verification_status ?? 'לא צוין'}). ` +
      'מינון לא-מאומת לא יחושב ולא יוצג.',
      { drug_key: doseRecord.drug_key }
    );
  }
  if (!isNum(weight_kg) || weight_kg <= 0) {
    return failure('dosing.weight_based', 'לא סופק משקל תקין. לא ניתן לחשב מינון.');
  }
  if (!isNum(doseRecord.mg_per_kg_per_dose)) {
    return failure('dosing.weight_based', 'רשומת המינון אינה כוללת mg/kg/dose.');
  }

  if (isNum(doseRecord.min_age_days) && isNum(age_days) && Number(age_days) < Number(doseRecord.min_age_days)) {
    return failure(
      'dosing.weight_based',
      `רשומת המינון מוגדרת לגיל ${doseRecord.min_age_days} ימים ומעלה, ` +
      `והמטופל בן ${age_days} ימים. החישוב לא בוצע.`,
      { drug_key: doseRecord.drug_key }
    );
  }

  const w = Number(weight_kg);
  const raw = Number(doseRecord.mg_per_kg_per_dose) * w;

  const notes = [];
  let perDose = raw;
  let cappedBy = null;

  if (isNum(doseRecord.max_mg_per_dose) && perDose > Number(doseRecord.max_mg_per_dose)) {
    perDose = Number(doseRecord.max_mg_per_dose);
    cappedBy = 'max_per_dose';
    notes.push(
      `המינון המחושב לפי משקל (${round(raw, 1)} מ"ג) חורג מהתקרה שברשומה ` +
      `ולכן הוגבל לתקרה.`
    );
  }

  const dosesPerDay = isNum(doseRecord.doses_per_day) ? Number(doseRecord.doses_per_day) : null;
  let perDay = dosesPerDay ? perDose * dosesPerDay : null;

  if (perDay !== null && isNum(doseRecord.max_mg_per_day) && perDay > Number(doseRecord.max_mg_per_day)) {
    perDay = Number(doseRecord.max_mg_per_day);
    cappedBy = cappedBy ? `${cappedBy}+max_per_day` : 'max_per_day';
    notes.push('המינון היממתי חרג מהתקרה שברשומה והוגבל בהתאם.');
  }

  notes.push('המספר הוא תוצאת חישוב אריתמטי בלבד ואינו הוראת מתן. אימות מול הפרוטוקול המחלקתי חובה.');

  return {
    ok: true,
    ...result({
      key: `dosing.${doseRecord.drug_key}`,
      label_he: `מינון מחושב — ${doseRecord.drug_name_he ?? doseRecord.drug_key}`,
      value: round(perDose, 1),
      unit: 'mg/dose',
      formula_source: `${doseRecord.mg_per_kg_per_dose} mg/kg/dose × ${w} kg | מקור הרשומה: ${doseRecord.source ?? 'לא צוין'}`,
      inputs: {
        weight_kg: w,
        mg_per_kg_per_dose: Number(doseRecord.mg_per_kg_per_dose),
        doses_per_day: dosesPerDay,
      },
      notes_he: notes,
    }),
    per_day_mg: perDay !== null ? round(perDay, 1) : null,
    doses_per_day: dosesPerDay,
    capped_by: cappedBy,
    uncapped_per_dose_mg: round(raw, 1),
    source: doseRecord.source ?? null,
    route: doseRecord.route ?? null,
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Percentile גדילה
 * דורש טבלאות LMS חיצוניות (WHO/CDC). אין הטמעה מהזיכרון.
 * ──────────────────────────────────────────────────────────────────────── */
export function growthPercentile({ measurement, age_days, sex, metric, lmsTable }) {
  if (!lmsTable) {
    return failure(
      'growth.percentile',
      'לא סופקה טבלת LMS (WHO/CDC). אחוזוני גדילה מחייבים טבלאות ייחוס רשמיות ' +
      'ואינם מוערכים ע"י המערכת. יש לטעון את הטבלה הרלוונטית.',
      { missing: 'lmsTable', metric }
    );
  }
  const band = lmsTable.find(
    (b) => b.metric === metric && b.sex === sex &&
      age_days >= b.age_min_days && age_days <= b.age_max_days
  );
  if (!band || !isNum(band.L) || !isNum(band.M) || !isNum(band.S)) {
    return failure('growth.percentile', `לא נמצאה רשומת LMS מתאימה עבור ${metric} בגיל ${age_days} ימים.`);
  }
  if (!isNum(measurement) || measurement <= 0) {
    return failure('growth.percentile', 'לא סופקה מדידה תקינה.');
  }

  const { L, M, S } = band;
  const X = Number(measurement);
  // נוסחת LMS הסטנדרטית
  const z = L !== 0
    ? (Math.pow(X / M, L) - 1) / (L * S)
    : Math.log(X / M) / S;

  const percentile = normalCdf(z) * 100;

  return {
    ok: true,
    ...result({
      key: `growth.${metric}`,
      label_he: `אחוזון ${metric}`,
      value: round(percentile, 1),
      unit: '%',
      formula_source: `LMS (L=${L}, M=${M}, S=${S}) | מקור הטבלה: ${band.source ?? 'לא צוין'}`,
      inputs: { measurement: X, age_days, sex, metric },
      notes_he: ['אחוזון בודד אינו טרנד. הערכת גדילה מחייבת מדידות חוזרות לאורך זמן.'],
    }),
    z_score: round(z, 2),
  };
}

/** CDF של התפלגות נורמלית סטנדרטית — קירוב Abramowitz–Stegun 7.1.26. */
function normalCdf(z) {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6-9. נוסחאות אריתמטיות-טהורות (הגדרות מתמטיות מקובלות, לא ערכי-נורמה)
 * ──────────────────────────────────────────────────────────────────────── */
export function anionGap({ na, cl, hco3 }) {
  if (![na, cl, hco3].every(isNum)) return failure('electrolytes.anion_gap', 'נדרשים Na, Cl ו-HCO3 לחישוב anion gap.');
  const ag = Number(na) - (Number(cl) + Number(hco3));
  return { ok: true, ...result({ key: 'electrolytes.anion_gap', label_he: 'Anion Gap', value: round(ag, 1), unit: 'mmol/L', formula_source: 'Na − (Cl + HCO3)', inputs: { na: +na, cl: +cl, hco3: +hco3 }, notes_he: ['ללא אשלגן. פרשנות (חמצת עם/בלי פער) היא קלינית.'] }) };
}

export function correctedSodium({ na, glucose_mg_dl }) {
  if (![na, glucose_mg_dl].every(isNum)) return failure('electrolytes.corrected_na', 'נדרשים Na וגלוקוז (mg/dL).');
  const corr = Number(na) + 1.6 * ((Number(glucose_mg_dl) - 100) / 100);
  return { ok: true, ...result({ key: 'electrolytes.corrected_na', label_he: 'Na מתוקן להיפרגליקמיה', value: round(corr, 1), unit: 'mmol/L', formula_source: 'Na + 1.6 × (גלוקוז−100)/100 (Katz)', inputs: { na: +na, glucose_mg_dl: +glucose_mg_dl } }) };
}

export function correctedCalcium({ calcium_mg_dl, albumin_g_dl }) {
  if (![calcium_mg_dl, albumin_g_dl].every(isNum)) return failure('electrolytes.corrected_ca', 'נדרשים סידן (mg/dL) ואלבומין (g/dL).');
  const corr = Number(calcium_mg_dl) + 0.8 * (4.0 - Number(albumin_g_dl));
  return { ok: true, ...result({ key: 'electrolytes.corrected_ca', label_he: 'סידן מתוקן לאלבומין', value: round(corr, 2), unit: 'mg/dL', formula_source: 'Ca + 0.8 × (4.0 − אלבומין)', inputs: { calcium_mg_dl: +calcium_mg_dl, albumin_g_dl: +albumin_g_dl } }) };
}

export function serumOsmolality({ na, glucose_mg_dl, bun_mg_dl }) {
  if (![na, glucose_mg_dl, bun_mg_dl].every(isNum)) return failure('renal.osmolality', 'נדרשים Na, גלוקוז (mg/dL) ו-BUN (mg/dL).');
  const osm = 2 * Number(na) + Number(glucose_mg_dl) / 18 + Number(bun_mg_dl) / 2.8;
  return { ok: true, ...result({ key: 'renal.osmolality', label_he: 'אוסמולליות מחושבת', value: round(osm, 0), unit: 'mOsm/kg', formula_source: '2×Na + גלוקוז/18 + BUN/2.8', inputs: { na: +na, glucose_mg_dl: +glucose_mg_dl, bun_mg_dl: +bun_mg_dl } }) };
}

/**
 * גובה מטרה לפי ממוצע הורים (Tanner). נוסחה אריתמטית, לא אחוזון WHO.
 * זכר: (אב + אם + 13) / 2 ס״מ. נקבה: (אב + אם − 13) / 2 ס״מ.
 */
export function midParentalHeight({ father_cm, mother_cm, sex }) {
  if (![father_cm, mother_cm].every(isNum) || father_cm <= 0 || mother_cm <= 0) {
    return failure('growth.mid_parental_height', 'נדרשים גובה האב והאם בס״מ.');
  }
  const s = String(sex ?? '').toLowerCase();
  const male = ['m', 'male', 'זכר', 'boy', 'בן'].includes(s);
  const female = ['f', 'female', 'נקבה', 'girl', 'בת'].includes(s);
  if (!male && !female) {
    return failure('growth.mid_parental_height', 'נדרש מין (זכר/נקבה) לנוסחת Mid-Parental Height.');
  }
  const offset = male ? 13 : -13;
  const cm = (Number(father_cm) + Number(mother_cm) + offset) / 2;
  return {
    ok: true,
    ...result({
      key: 'growth.mid_parental_height',
      label_he: 'גובה מטרה (Mid-Parental Height)',
      value: round(cm, 1),
      unit: 'cm',
      formula_source: male
        ? '(father_cm + mother_cm + 13) / 2 (Tanner)'
        : '(father_cm + mother_cm - 13) / 2 (Tanner)',
      inputs: { father_cm: +father_cm, mother_cm: +mother_cm, sex: male ? 'male' : 'female' },
      notes_he: ['טווח מקובל ±8.5 ס״מ הוא כלל אצבע קליני — לא סף אבחנה במנוע זה.'],
    }),
  };
}

/**
 * מריץ אוסף מחשבונים ומחזיר רק את המוצלחים כפריטי D#,
 * לצד רשימת הסירובים (שמוצגת לרופא/ה — סירוב הוא מידע).
 */
export function runCalculators(requests = []) {
  const deterministic = [];
  const refusals = [];

  for (const req of requests) {
    let res;
    switch (req.type) {
      case 'maintenance_fluids': res = maintenanceFluids(req.params); break;
      case 'egfr':               res = estimatedGFR(req.params); break;
      case 'bsa':                res = bodySurfaceArea(req.params); break;
      case 'dose':               res = weightBasedDose(req.params); break;
      case 'growth_percentile':  res = growthPercentile(req.params); break;
      case 'anion_gap':          res = anionGap(req.params); break;
      case 'corrected_sodium':   res = correctedSodium(req.params); break;
      case 'corrected_calcium':  res = correctedCalcium(req.params); break;
      case 'serum_osmolality':   res = serumOsmolality(req.params); break;
      case 'mid_parental_height': res = midParentalHeight(req.params); break;
      default:
        refusals.push({ key: req.type, message_he: `מחשבון לא מוכר: ${req.type}` });
        continue;
    }
    if (res?.ok) deterministic.push(res);
    else refusals.push(res);
  }

  return { deterministic, refusals };
}
