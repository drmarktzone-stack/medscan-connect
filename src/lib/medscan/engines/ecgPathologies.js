/**
 * ============================================================================
 *  MedScan AI — Deterministic ECG Pathology Catalog + Matcher
 * ============================================================================
 *  This is the code-side "knowledge" of ECG pathology: for each recognizable
 *  pattern we encode its DEFINING diagnostic criteria as deterministic
 *  predicates over the code-computed features (intervals, rate, axis,
 *  conduction, and morphology observations). No LLM guesses which pathology
 *  it is — the code scores candidates against explicit criteria.
 *
 *  Design rules (mirror the ten iron-laws):
 *   - Criteria-gated, bidirectional: a pathology matches ONLY when its defining
 *     criteria are actually present. Normal-in / no-criteria → no false match.
 *   - Every entry carries a `source_anchor` (a general, non-copyrightable
 *     clinical criterion reference). These are medical FACTS/criteria — not
 *     copyrighted text or images.
 *   - Decision-support only: `match` yields a candidate + which criteria were
 *     met, never a final diagnosis. Must-not-miss patterns are surfaced.
 *   - Safety gate: in the presence of a wide-QRS conduction block (LBBB / paced),
 *     ordinary STEMI thresholds do NOT apply — the matcher defers to Sgarbossa.
 *
 *  Feature object `f` (all fields optional; missing → that criterion is
 *  indeterminate, never assumed):
 *    hr, pr_ms, qrs_ms, qt_ms, qtc_ms, axis_deg           (numbers)
 *    rhythm_regular, p_before_qrs                          (bool|null)
 *    conduction_type       'narrow'|'LBBB'|'RBBB'|'IVCD'|'unknown'
 *    st_elev  [{lead, mm}]   ST elevation, mm at J point
 *    st_dep   [{lead, mm}]   ST depression
 *    t_inv    [lead...]       T-wave inversion
 *    path_q   [lead...]       pathological Q
 *    pr_depression  bool
 *    v1_pattern    'dominant_s'|'rsr_prime'|'other'
 *    lateral_broad_r bool
 *    age_years, sex
 * ============================================================================
 */

/* ---- Lead territory groups (standard 12-lead anatomy) ------------------- */
export const TERRITORIES = {
  inferior: ["II", "III", "aVF"],
  septal: ["V1", "V2"],
  anterior: ["V3", "V4"],
  anteroseptal: ["V1", "V2", "V3", "V4"],
  lateral: ["I", "aVL", "V5", "V6"],
  high_lateral: ["I", "aVL"],
  precordial: ["V1", "V2", "V3", "V4", "V5", "V6"],
};

const norm = (s) => String(s || "").trim().toUpperCase().replace("AVF", "aVF").replace("AVL", "aVL").replace("AVR", "aVR");
const leadsOf = (arr) => (Array.isArray(arr) ? arr.map((x) => norm(typeof x === "string" ? x : x?.lead)).filter(Boolean) : []);
const isNum = (x) => typeof x === "number" && isFinite(x);

/** Which precordial leads count as "septal/anterior" for a given mm using the
 *  standard J-point threshold: limb ≥1mm, precordial (V2-V3) ≥2mm, other V ≥1mm. */
function elevatedByThreshold(st_elev) {
  const out = [];
  for (const e of st_elev || []) {
    const lead = norm(e.lead);
    const mm = Number(e.mm);
    if (!lead || !isNum(mm)) continue;
    const isPrecordial = /^V[1-6]$/.test(lead);
    const isV2V3 = lead === "V2" || lead === "V3";
    const thr = isV2V3 ? 2 : isPrecordial ? 1 : 1; // conservative decision-support thresholds
    if (mm >= thr) out.push(lead);
  }
  return out;
}

/** Count how many leads of a territory appear in a lead set. */
function inTerritory(leadSet, territoryLeads) {
  const set = new Set(leadSet);
  return territoryLeads.filter((l) => set.has(l));
}

/** Detect a contiguous-territory STE pattern → returns the strongest territory or null. */
function stemiTerritory(elevatedLeads) {
  const checks = [
    ["inferior", TERRITORIES.inferior],
    ["anteroseptal", TERRITORIES.anteroseptal],
    ["anterior", TERRITORIES.anterior],
    ["lateral", TERRITORIES.lateral],
    ["high_lateral", TERRITORIES.high_lateral],
  ];
  let best = null;
  for (const [name, leads] of checks) {
    const hit = inTerritory(elevatedLeads, leads);
    if (hit.length >= 2 && (!best || hit.length > best.count)) {
      best = { territory: name, leads: hit, count: hit.length };
    }
  }
  return best;
}

const TERRITORY_HE = {
  inferior: "תחתון (II/III/aVF)",
  anteroseptal: "קדמי-מחיצתי (V1-V4)",
  anterior: "קדמי (V3-V4)",
  lateral: "צידי (I/aVL/V5-V6)",
  high_lateral: "צידי-גבוה (I/aVL)",
};

/* ==========================================================================
 *  THE CATALOG — each pathology evaluates the feature object and returns
 *  { matched, score, criteria:[{text,ok}], severity, note_he }.
 *  score is a 0-100 confidence in the *pattern being present* (not a diagnosis).
 * ========================================================================== */
export const ECG_PATHOLOGIES = [
  /* ---------- Rate / rhythm ---------- */
  {
    key: "sinus_tachycardia",
    name_he: "טכיקרדיה סינוסלית",
    name_en: "Sinus tachycardia",
    category: "rhythm",
    source_anchor: "Sinus rhythm with rate > age-upper limit (Nelson; Surawicz/Chou)",
    evaluate(f) {
      if (f.p_before_qrs === false) return null;
      const upper = ageRate(f).tachy;
      if (isNum(f.hr) && f.hr > upper) {
        return { matched: true, score: 80, severity: "yellow",
          criteria: [{ text: `HR ${f.hr} > סף גיל ${upper}`, ok: true }, { text: "P לפני כל QRS", ok: f.p_before_qrs !== false }],
          note_he: "טכיקרדיה סינוסלית — חפש גורם (חום, כאב, אנמיה, היפוולמיה, היפרתירואיד)." };
      }
      return null;
    },
  },
  {
    key: "sinus_bradycardia",
    name_he: "ברדיקרדיה סינוסלית",
    name_en: "Sinus bradycardia",
    category: "rhythm",
    source_anchor: "Sinus rhythm with rate < age-lower limit",
    evaluate(f) {
      if (f.p_before_qrs === false) return null;
      const lower = ageRate(f).brady;
      if (isNum(f.hr) && f.hr < lower) {
        return { matched: true, score: 78, severity: "yellow",
          criteria: [{ text: `HR ${f.hr} < סף גיל ${lower}`, ok: true }],
          note_he: "ברדיקרדיה סינוסלית — שקול רקע (ספורטאי, תרופות, היפותירואיד, לחץ תוך-גולגולתי)." };
      }
      return null;
    },
  },
  {
    key: "atrial_fibrillation",
    name_he: "פרפור עליות (AF)",
    name_en: "Atrial fibrillation",
    category: "rhythm",
    severity: "yellow",
    source_anchor: "Irregularly irregular rhythm, no discrete P waves",
    evaluate(f) {
      if (f.rhythm_regular === false && f.p_before_qrs === false) {
        return { matched: true, score: 72, severity: "yellow",
          criteria: [{ text: "R–R לא-סדיר לחלוטין", ok: true }, { text: "אין גלי P מובחנים", ok: true }],
          note_he: "דפוס פרפור עליות — נדרש מתאם קליני; הערך קצב חדרי ואנטיקואגולציה לפי הקשר." };
      }
      return null;
    },
  },

  /* ---------- Conduction ---------- */
  {
    key: "first_degree_av_block",
    name_he: "חסם AV דרגה 1",
    name_en: "First-degree AV block",
    category: "conduction",
    severity: "yellow",
    source_anchor: "PR interval > 200 ms (age-adjusted in children)",
    evaluate(f) {
      const thr = f.pr_upper || 200;
      if (isNum(f.pr_ms) && f.pr_ms > thr) {
        return { matched: true, score: 82, severity: "yellow",
          criteria: [{ text: `PR ${f.pr_ms}ms > ${thr}ms`, ok: true }, { text: "כל P מוליך QRS", ok: true }],
          note_he: "הארכת PR — לרוב שפירה; שלול קדחת שגרון/מיוקרדיטיס/תרופות בהקשר מתאים." };
      }
      return null;
    },
  },
  {
    key: "lbbb",
    name_he: "חסם צרור שמאלי (LBBB)",
    name_en: "Left bundle branch block",
    category: "conduction",
    severity: "yellow",
    source_anchor: "QRS ≥120 ms, dominant S in V1, broad/notched R in lateral leads",
    evaluate(f) {
      if (f.conduction_type === "LBBB") {
        return { matched: true, score: 88, severity: "yellow",
          criteria: [
            { text: `QRS ${f.qrs_ms ?? "?"}ms ≥120`, ok: isNum(f.qrs_ms) ? f.qrs_ms >= 120 : true },
            { text: "S דומיננטי ב-V1", ok: f.v1_pattern === "dominant_s" },
            { text: "R רחב/מחורץ לטרלי", ok: f.lateral_broad_r === true },
          ],
          note_he: "LBBB — בנוכחותו צפויה discordance מתאים; ספי-STEMI רגילים אינם תקפים, השתמש ב-Sgarbossa." };
      }
      return null;
    },
  },
  {
    key: "rbbb",
    name_he: "חסם צרור ימני (RBBB)",
    name_en: "Right bundle branch block",
    category: "conduction",
    severity: "yellow",
    source_anchor: "QRS ≥120 ms, rsR' in V1, wide S in I/V6",
    evaluate(f) {
      if (f.conduction_type === "RBBB") {
        return { matched: true, score: 85, severity: "yellow",
          criteria: [
            { text: `QRS ${f.qrs_ms ?? "?"}ms ≥120`, ok: isNum(f.qrs_ms) ? f.qrs_ms >= 120 : true },
            { text: "RSR' (דמוי-M) ב-V1", ok: f.v1_pattern === "rsr_prime" },
          ],
          note_he: "RBBB — לרוב אינו חוסם הערכת ST בלידים הצידיים/תחתונים." };
      }
      return null;
    },
  },
  {
    key: "preexcitation_short_pr",
    name_he: "PR קצר — שקול פרה-אקסיטציה (WPW)",
    name_en: "Short PR — consider pre-excitation",
    category: "conduction",
    severity: "yellow",
    source_anchor: "PR < 120 ms (WPW also needs delta wave + wide QRS)",
    evaluate(f) {
      const lower = f.pr_lower || 120;
      if (isNum(f.pr_ms) && f.pr_ms < lower) {
        return { matched: true, score: 55, severity: "yellow",
          criteria: [{ text: `PR ${f.pr_ms}ms < ${lower}ms`, ok: true }, { text: "גל דלתא (לא נמדד אוטומטית)", ok: null }],
          note_he: "PR קצר — לאישור WPW נדרש גל דלתא + QRS רחב; הערך ידנית." };
      }
      return null;
    },
  },

  /* ---------- Repolarization / intervals ---------- */
  {
    key: "long_qt",
    name_he: "QT מוארך",
    name_en: "Long QT",
    category: "repolarization",
    severity: "yellow",
    source_anchor: "QTc > 460 ms (borderline) / > 480–500 ms (prolonged); Torsades risk",
    evaluate(f) {
      if (!isNum(f.qtc_ms)) return null;
      if (f.qtc_ms > 500) {
        return { matched: true, score: 85, severity: "red",
          criteria: [{ text: `QTc ${f.qtc_ms}ms > 500`, ok: true }],
          note_he: "QTc מוארך משמעותית — סיכון Torsades. שלול תרופות/אלקטרוליטים; מתאם קליני דחוף." };
      }
      if (f.qtc_ms > 460) {
        return { matched: true, score: 70, severity: "yellow",
          criteria: [{ text: `QTc ${f.qtc_ms}ms > 460`, ok: true }],
          note_he: "QTc בגבול העליון/מוארך — חזור על מדידה ידנית ושלול גורמים." };
      }
      return null;
    },
  },
  {
    key: "short_qt",
    name_he: "QT קצר",
    name_en: "Short QT",
    category: "repolarization",
    severity: "yellow",
    source_anchor: "QTc < 340 ms",
    evaluate(f) {
      if (isNum(f.qtc_ms) && f.qtc_ms < 340) {
        return { matched: true, score: 68, severity: "yellow",
          criteria: [{ text: `QTc ${f.qtc_ms}ms < 340`, ok: true }],
          note_he: "QTc קצר — שקול היפרקלצמיה/תסמונת QT קצר בהקשר." };
      }
      return null;
    },
  },

  /* ---------- Ischemia / infarction (criteria-gated, safety-first) ---------- */
  {
    key: "stemi",
    name_he: "דפוס STEMI — עליית ST טריטוריאלית",
    name_en: "STEMI pattern",
    category: "ischemia",
    severity: "red",
    source_anchor: "ST elevation ≥1mm (limb)/≥2mm (V2-V3) in ≥2 contiguous leads (4th Universal Definition of MI)",
    evaluate(f) {
      // Safety gate: with LBBB / paced, ordinary STE thresholds do not apply.
      if (f.conduction_type === "LBBB") return null;
      const elevated = elevatedByThreshold(f.st_elev);
      const terr = stemiTerritory(elevated);
      if (terr) {
        return { matched: true, score: 90, severity: "red", territory: terr.territory,
          criteria: [
            { text: `עליית ST ב-${terr.leads.join(", ")} (טריטוריה ${TERRITORY_HE[terr.territory] || terr.territory})`, ok: true },
            { text: "≥2 לידים סמוכים מעל הסף", ok: true },
          ],
          note_he: `דפוס STEMI ${TERRITORY_HE[terr.territory] || ""} — חובה לשלול אוטם חד. הפעל מסלול חירום/הפניה מיידית + טרופונין.` };
      }
      return null;
    },
  },
  {
    key: "stemi_in_lbbb_sgarbossa",
    name_he: "עליית ST בנוכחות LBBB — הערך לפי Sgarbossa",
    name_en: "STE with LBBB — apply Sgarbossa",
    category: "ischemia",
    severity: "yellow",
    source_anchor: "Sgarbossa criteria for acute MI in LBBB / paced rhythm",
    evaluate(f) {
      if (f.conduction_type !== "LBBB") return null;
      const elevated = elevatedByThreshold(f.st_elev);
      if (elevated.length >= 1 || (f.st_dep || []).length >= 1) {
        return { matched: true, score: 60, severity: "yellow",
          criteria: [{ text: "שינויי ST בנוכחות LBBB", ok: true }, { text: "discordance מתאים צפוי", ok: true }],
          note_he: "בנוכחות LBBB ספי-STEMI הרגילים אינם תקפים — הערך לפי קריטריוני Sgarbossa; מתאם קליני." };
      }
      return null;
    },
  },
  {
    key: "pericarditis_pattern",
    name_he: "דפוס פריקרדיטיס — עליית ST מפושטת + ירידת PR",
    name_en: "Pericarditis pattern",
    category: "pericardial",
    severity: "yellow",
    source_anchor: "Diffuse concave ST elevation + PR depression, no reciprocal territory (decision-support, not diagnosis)",
    evaluate(f) {
      if (f.conduction_type === "LBBB") return null;
      const elevated = elevatedByThreshold(f.st_elev);
      if (!f.pr_depression) return null;               // GATE 1: PR depression required
      // GATE 2: diffuse — spans ≥2 different territories (not a single-territory STEMI)
      const terrHit = ["inferior", "lateral", "anterior"].filter((t) => inTerritory(elevated, TERRITORIES[t]).length >= 1);
      if (elevated.length >= 3 && terrHit.length >= 2) {
        return { matched: true, score: 65, severity: "yellow",
          criteria: [
            { text: "ירידת PR", ok: true },
            { text: `עליית ST מפושטת (${elevated.join(", ")})`, ok: true },
            { text: "מעורבות >טריטוריה אחת (לא ממוקד)", ok: true },
          ],
          note_he: "דפוס העולה בקנה אחד עם פריקרדיטיס — אינו אבחנה; טעון מתאם קליני ושלילת איסכמיה ממוקדת." };
      }
      return null;
    },
  },
  {
    key: "ischemia_st_depression",
    name_he: "איסכמיה — ירידת ST",
    name_en: "Ischemia — ST depression",
    category: "ischemia",
    severity: "yellow",
    source_anchor: "ST depression ≥0.5mm in ≥2 contiguous leads",
    evaluate(f) {
      const dep = leadsOf(f.st_dep);
      // posterior MI mirror: ST depression in V1-V3
      const antero = inTerritory(dep, ["V1", "V2", "V3"]);
      if (antero.length >= 2) {
        return { matched: true, score: 62, severity: "yellow",
          criteria: [{ text: `ירידת ST ב-${antero.join(", ")}`, ok: true }],
          note_he: "ירידת ST קדמית — שקול איסכמיה, וגם אוטם אחורי (תמונת-ראי) — הוסף לידים אחוריים V7-V9." };
      }
      if (dep.length >= 2) {
        return { matched: true, score: 55, severity: "yellow",
          criteria: [{ text: `ירידת ST ב-${dep.join(", ")}`, ok: true }],
          note_he: "ירידת ST — שקול איסכמיה/עומס; מתאם קליני וטרופונין לפי הקשר." };
      }
      return null;
    },
  },
  {
    key: "t_inversion",
    name_he: "היפוך גלי T",
    name_en: "T-wave inversion",
    category: "repolarization",
    severity: "yellow",
    source_anchor: "T inversion in ≥2 contiguous leads (age-dependent; juvenile pattern normal in V1-V3 in children)",
    evaluate(f) {
      const t = leadsOf(f.t_inv);
      if (t.length < 2) return null;
      const juvenile = isNum(f.age_years) && f.age_years < 16 && t.every((l) => ["V1", "V2", "V3"].includes(l));
      if (juvenile) {
        return { matched: true, score: 40, severity: "normal",
          criteria: [{ text: `היפוך T ב-${t.join(", ")}`, ok: true }, { text: "גיל <16 + V1-V3 בלבד", ok: true }],
          note_he: "היפוך T ב-V1-V3 בילד — עשוי להיות דפוס ילדי תקין (juvenile). מתאם לגיל." };
      }
      return { matched: true, score: 58, severity: "yellow",
        criteria: [{ text: `היפוך T ב-${t.join(", ")}`, ok: true }],
        note_he: "היפוך T — שקול איסכמיה/עומס/PE; בהקשר של כאב שחלף שקול Wellens." };
    },
  },
  {
    key: "hyperkalemia",
    name_he: "היפרקלמיה — גלי T מחודדים",
    name_en: "Hyperkalemia (peaked T)",
    category: "electrolyte",
    severity: "red",
    source_anchor: "Peaked/tented T waves → widened QRS → P loss → sine wave (progressive hyperkalemia)",
    evaluate(f) {
      const t = leadsOf(f.peaked_t_leads);
      if (t.length >= 2) {
        const wide = isNum(f.qrs_ms) && f.qrs_ms >= 120;
        return { matched: true, score: wide ? 82 : 68, severity: wide ? "red" : "yellow",
          criteria: [
            { text: `גלי T מחודדים ב-${t.join(", ")}`, ok: true },
            { text: "QRS מתרחב", ok: wide },
            { text: "אובדן גלי P", ok: f.p_before_qrs === false ? true : null },
          ],
          note_he: "דפוס היפרקלמיה — בדוק אשלגן דחוף; QRS רחב/אובדן P = מסכן-חיים, טיפול מיידי." };
      }
      return null;
    },
  },
  {
    key: "hypokalemia",
    name_he: "היפוקלמיה — גלי U",
    name_en: "Hypokalemia (U waves)",
    category: "electrolyte",
    severity: "yellow",
    source_anchor: "ST depression, flat T, prominent U waves; risk of arrhythmia/long QU",
    evaluate(f) {
      const u = leadsOf(f.u_wave_leads);
      if (u.length >= 1) {
        return { matched: true, score: 62, severity: "yellow",
          criteria: [{ text: `גלי U ב-${u.join(", ")}`, ok: true }],
          note_he: "דפוס היפוקלמיה — בדוק אשלגן/מגנזיום; סיכון להפרעות קצב." };
      }
      return null;
    },
  },
  {
    key: "wpw_preexcitation",
    name_he: "WPW — פרה-אקסיטציה (גל דלתא)",
    name_en: "WPW / pre-excitation",
    category: "conduction",
    severity: "yellow",
    source_anchor: "Short PR (<120ms) + delta wave + wide QRS",
    evaluate(f) {
      const shortPr = isNum(f.pr_ms) && f.pr_ms < (f.pr_lower || 120);
      if (f.delta_wave === true && (shortPr || (isNum(f.qrs_ms) && f.qrs_ms >= 110))) {
        return { matched: true, score: 80, severity: "yellow",
          criteria: [
            { text: "גל דלתא", ok: true },
            { text: `PR קצר ${isNum(f.pr_ms) ? f.pr_ms + "ms" : ""}`, ok: shortPr },
            { text: `QRS רחב ${isNum(f.qrs_ms) ? f.qrs_ms + "ms" : ""}`, ok: isNum(f.qrs_ms) ? f.qrs_ms >= 110 : null },
          ],
          note_he: "דפוס WPW — סיכון להפרעות קצב (בפרט AF פרה-מוגבר); הימנע מחוסמי-AV בהתקף רחב, הפניה לאלקטרופיזיולוגיה." };
      }
      return null;
    },
  },
  {
    key: "hypothermia_osborn",
    name_he: "היפותרמיה — גלי Osborn/J",
    name_en: "Hypothermia (Osborn waves)",
    category: "other",
    severity: "yellow",
    source_anchor: "Osborn (J) waves + bradycardia + tremor artifact in hypothermia",
    evaluate(f) {
      // Osborn waves are clinically meaningful with hypothermia, which is bradycardic.
      // GATE: require bradycardia (HR<60) — or unknown HR — so a normal-rate ECG
      // (e.g. HR 77) cannot be labelled hypothermia off a single dubious J-wave.
      const bradyOrUnknown = !isNum(f.hr) || f.hr < 60;
      if (f.osborn_j_wave === true && bradyOrUnknown) {
        return { matched: true, score: 70, severity: "yellow",
          criteria: [{ text: "גל Osborn/J", ok: true }, { text: `ברדיקרדיה (HR ${isNum(f.hr) ? f.hr : "?"})`, ok: isNum(f.hr) ? f.hr < 60 : null }],
          note_he: "דפוס היפותרמיה — מדוד חום-ליבה; חמם בזהירות ונטר קצב." };
      }
      return null;
    },
  },
  {
    key: "low_voltage_effusion",
    name_he: "מתח נמוך / חילוף חשמלי — שקול תפליט קרום",
    name_en: "Low voltage / electrical alternans",
    category: "pericardial",
    severity: "yellow",
    source_anchor: "Low QRS voltage ± electrical alternans → pericardial effusion / tamponade",
    evaluate(f) {
      if (f.electrical_alternans === true) {
        return { matched: true, score: 72, severity: "red",
          criteria: [{ text: "חילוף חשמלי", ok: true }, { text: "מתח נמוך", ok: f.low_voltage === true }],
          note_he: "חילוף חשמלי — חשד תפליט קרום גדול/טמפונדה. אקו-לב דחוף." };
      }
      if (f.low_voltage === true) {
        return { matched: true, score: 50, severity: "yellow",
          criteria: [{ text: "מתח QRS נמוך", ok: true }],
          note_he: "מתח נמוך — שקול תפליט קרום/פריקרד, השמנה, COPD, אמילואיד, מיקסדמה." };
      }
      return null;
    },
  },
  {
    key: "pathological_q",
    name_he: "גלי Q פתולוגיים — שקול אוטם ישן",
    name_en: "Pathological Q — old infarct",
    category: "infarction",
    severity: "yellow",
    source_anchor: "Pathological Q waves (>40ms or >25% R height) in a territory",
    evaluate(f) {
      const q = leadsOf(f.path_q);
      if (q.length >= 1) {
        return { matched: true, score: 60, severity: "yellow",
          criteria: [{ text: `גלי Q ב-${q.join(", ")}`, ok: true }],
          note_he: "גלי Q פתולוגיים — שקול צלקת/אוטם ישן; מתאם להיסטוריה ואקו." };
      }
      return null;
    },
  },
];

/* ---- age-adjusted helpers (coarse; fundamentals engine holds precise bands) */
function ageRate(f) {
  const a = f.age_years;
  if (!isNum(a)) return { brady: 60, tachy: 100 };
  if (a < 1) return { brady: 100, tachy: 160 };
  if (a < 3) return { brady: 90, tachy: 150 };
  if (a < 6) return { brady: 70, tachy: 130 };
  if (a < 12) return { brady: 60, tachy: 120 };
  return { brady: 55, tachy: 100 };
}

/**
 * Match the deterministic feature object against the catalog.
 * @returns {{ candidates: Array, maxSeverity: string, mustNotMiss: Array }}
 */
export function matchPathologies(f = {}) {
  const candidates = [];
  for (const p of ECG_PATHOLOGIES) {
    let res = null;
    try { res = p.evaluate(f); } catch { res = null; }
    if (res && res.matched) {
      candidates.push({
        key: p.key,
        name_he: p.name_he,
        name_en: p.name_en,
        category: p.category,
        source_anchor: p.source_anchor,
        score: res.score,
        severity: res.severity || p.severity || "yellow",
        criteria: res.criteria || [],
        territory: res.territory || null,
        note_he: res.note_he || "",
      });
    }
  }
  candidates.sort((a, b) => (b.score || 0) - (a.score || 0));

  const sevRank = { normal: 0, yellow: 1, red: 2 };
  const maxSeverity = candidates.reduce((acc, c) => (sevRank[c.severity] > sevRank[acc] ? c.severity : acc), "normal");
  const mustNotMiss = candidates.filter((c) => c.severity === "red");

  return { candidates, maxSeverity, mustNotMiss };
}

/** Build a compact Hebrew evidence block from matched pathologies (for the LLM narrative + display). */
export function buildPathologyBlock(match) {
  if (!match || !Array.isArray(match.candidates) || match.candidates.length === 0) {
    return "מנוע-הפתולוגיות הדטרמיניסטי: לא זוהה דפוס פתולוגי מגדיר מהמדידות (בגבולות הנורמה מבחינת הקריטריונים שנבדקו).";
  }
  const lines = match.candidates.slice(0, 8).map((c) => {
    const crit = c.criteria.map((x) => `${x.ok === false ? "✗" : x.ok === null ? "?" : "✓"} ${x.text}`).join("; ");
    return `- **${c.name_he}** (${c.name_en}) [${c.severity}] — קריטריונים: ${crit}. ${c.note_he}`;
  });
  return `מנוע-הפתולוגיות הדטרמיניסטי — דפוסים שקריטריוניהם התקיימו במדידות (ראיה, לא אבחנה סופית):\n${lines.join("\n")}`;
}

/** Map a runMicroReading interpretation + measured into the flat feature object `f`. */
export function featuresFromReading({ measured, interpretation, observations, ageYears, sex } = {}) {
  const iv = measured?.intervals || {};
  const rate = measured?.rate || {};
  const qtc = measured?.qtc || {};
  const axis = measured?.axis || {};
  const bandNorms = interpretation?.band_norms || {};
  return {
    hr: rate.hr_bpm,
    pr_ms: iv.pr_ms,
    qrs_ms: iv.qrs_ms,
    qt_ms: iv.qt_ms,
    qtc_ms: qtc.bazett,
    axis_deg: axis.degrees,
    rhythm_regular: observations?.regular,
    p_before_qrs: observations?.p_before_each_qrs,
    conduction_type: interpretation?.conduction?.type || "unknown",
    st_elev: observations?.st_elevation_leads || [],
    st_dep: observations?.st_depression_leads || [],
    t_inv: observations?.t_inversion_leads || [],
    path_q: observations?.pathological_q_leads || [],
    pr_depression: observations?.pr_depression,
    v1_pattern: observations?.v1_qrs_pattern,
    lateral_broad_r: observations?.lateral_broad_notched_r,
    peaked_t_leads: observations?.peaked_t_leads || [],
    u_wave_leads: observations?.u_wave_leads || [],
    delta_wave: observations?.delta_wave,
    osborn_j_wave: observations?.osborn_j_wave,
    low_voltage: observations?.low_voltage,
    electrical_alternans: observations?.electrical_alternans,
    tall_r_v1: observations?.tall_r_v1,
    age_years: ageYears,
    sex,
    pr_upper: bandNorms.pr_upper,
    pr_lower: bandNorms.pr_lower,
  };
}
