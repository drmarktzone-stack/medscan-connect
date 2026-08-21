/**
 * ============================================================================
 *  MedScan AI — Multi-Modality Radiology Interpretation Engine
 * ============================================================================
 *  Structured, systematic radiologist-style reading with the same
 *  anti-hallucination discipline as the ECG engine:
 *   - Modality/relevance gate (refuse non-radiology or unreadable images).
 *   - Systematic search patterns (ABCDE chest, abdomen, MSK, neuro).
 *   - Evidence-linked findings; "indeterminate" is a first-class answer.
 *   - Internal-consistency checks (e.g. Emergency with no abnormality/red-flag).
 *   - Adversarial verification for urgent/uncertain reads.
 *  Transport-agnostic: caller passes `invokeLLM`.
 * ============================================================================
 */

import { verifyDiagnosis } from "./verify";
import { DIAGNOSIS_MODEL, FAST_MODEL } from "./aiConfig";
import { RADIOLOGY_CRITICAL_PROMPT, applyRadiologyCritical } from "./radiologyCritical";
import { evaluateMeasurements } from "./radiologyMeasurements";
import { extractRadiologyFeatures } from "./medscan/vision/radiologyFeatures.js";
import { runVisionNumericGuard, groundedRadiologyNumbers } from "./visionNumericGuard";

const langNames = { he: "Hebrew", en: "English", ar: "Arabic" };

const MODALITY_PHYSICS = `## זיהוי מודליות ופיזיקה
- **רנטגן (X-Ray):** ספקטרום צפיפויות (אוויר, שומן, רקמה רכה/נוזל, עצם/מינרל, מתכת), פרויקציות (AP, PA, צד, אלכסון), ומאפיינים ילדיים (אפיפיזות פתוחות, צל התימוס, התגרמות תואמת-גיל).
- **CT:** יחידות Hounsfield (HU), חלונות (עצם, רקמה רכה, ריאה, מוח), פאזות ניגוד (ללא ניגוד, עורקי, פורטו-ורידי, מושהה).
- **MRI:** רצפים — T1 (אנטומיה), T2/STIR (נוזל/בצקת), FLAIR (בצקת נוירו), DWI/ADC (הגבלת דיפוזיה/איסכמיה/מורסה), עם ניגוד (האדרה).
- **אולטרסאונד (US):** אקוגניות (אנאכואי, היפו/איזו/היפראכואי, הצללה, האדרה אחורית) ודינמיקת דופלר.`;

const SEARCH_PATTERNS = `## דפוסי חיפוש שיטתיים (כמו רדיולוג אנושי)
- **חזה (CXR/CT):** שיטת ABCDE — Airway (קנה/סמפונות), Bones/soft tissue, Cardiac/mediastinum, Diaphragm, Effusions/Lungs.
- **בטן/אגן:** איברים פרנכימטיים, דופן/הרחבת מעי, נוזל חופשי, אוויר חופשי, כלי דם גדולים.
- **שלד/טראומה:** שלמות קורטקס, יישור מפרקי, תפליטים, רקמות רכות.
- **נוירו:** דם חד, ציסטרנות, פרנכימה (איסכמיה, אפקט מסה, הסטת קו אמצע), חדרים, מבני עצם.

## אפיון שיטתי לכל ממצא
לכל ממצא: מיקום (Location), היקף (Extent), גודל/גבולות (Size/Margins), צפיפות/סיגנל/אקוגניות (Density/Signal/Echogenicity), ואפקט מסה (Mass Effect).`;

const ANTI_HALLUCINATION = `## חוקי-ברזל נגד הזיות (קריטי)
1. אל תמציא ממצא שאינך רואה. אזור שלא ניתן להעריך → status "Indeterminate".
2. כל אבנורמליות ב-key_abnormalities חייבת characteristics קונקרטיים הנראים בתמונה.
3. אל תכריז "Emergency" ללא ממצא/דגל-אדום תומך.
4. אל תסיק "תקין" אלא אם כל האזורים בסריקה השיטתית תקינים.
5. בספק לגבי מודליות/איכות → סמן וברר, אל תנחש.
6. אל תשתמש בידע חיצוני/אינטרנט — רק מה שנראה בתמונה.`;

export function buildRadiologySystemPrompt({ clinicalContext, language = "he", pediatric = false } = {}) {
  const outputLang = langNames[language] || "Hebrew";
  return `אתה רדיולוג/ית יועץ/ת בכיר/ה. קרא את בדיקת ההדמיה בצורה שיטתית, שלב אחר שלב, ממדידה לפרשנות, והחזר פלט מובנה.

## שלב 0 — רלוונטיות וקריאות
- אם התמונה אינה בדיקת הדמיה רפואית (רנטגן/CT/MRI/US) → is_relevant=false והסבר. אל תמציא פענוח.
- אם היא הדמיה אך לא-קריאה (איכות ירודה, חתוכה, ארטיפקטים כבדים) → interpretable=false, ופרט מה חסר.
${pediatric ? "\n## מצב ילדים (Pediatric) פעיל\nהחל נורמות אנטומיות תלויות-גיל: אפיפיזות פתוחות, צל תימוס, מרכזי התגרמות, יחסי גודל תואמי-גיל. שקלל אבחנות ילדיות.\n" : ""}
${clinicalContext ? `## הקשר קליני\n${clinicalContext}\n` : ""}
${MODALITY_PHYSICS}

${SEARCH_PATTERNS}

${ANTI_HALLUCINATION}

${RADIOLOGY_CRITICAL_PROMPT}

## מדידות (אם האנטומיה הרלוונטית מצולמת)
דווח measurements כמערך של { key, value } עם המפתחות הסטנדרטיים. **אל תשווה לנורמה בעצמך — המערכת משווה לפי גיל בקוד.** מפתחות: cardiothoracic_ratio (יחס), appendix_diameter_us, pylorus_muscle_thickness, pylorus_channel_length, spleen_length_us (ס"מ), retropharyngeal_soft_tissue, retrotracheal_soft_tissue, bladder_wall_thickness_full, neonatal_frontal_horn, neonatal_third_ventricle, small_bowel_diameter/large_bowel_diameter/cecum_diameter (ס"מ), atlanto_dental_interval, thoracic_kyphosis/lumbar_lordosis/acetabular_index (מעלות), gi_wall_stomach/gi_wall_colon (מ"מ אלא אם צוין אחרת), renal_length_us, center_edge_angle, optic_nerve_sheath_diameter, common_bile_duct_diameter, prevertebral_c2_soft_tissue. דווח גם patient_age_months אם ניתן להעריך מההקשר (נדרש לנורמות תלויות-גיל).

## תיבות-תחום (regions)
לכל ממצא חריג משמעותי — סמן את מיקומו ב-regions (x,y,width,height באחוזים 0-100 + label קצר). אין ממצא → מערך ריק.

## פלט
## נגד פלט כללי (קריטי)
- אל תפיק ניסוחים עמומים כמו "ייתכן ממצא" או "מומלץ מתאם קליני" ללא **מאפיין קונקרטי + מיקום** שנראים בתמונה. כל ממצא: מה בדיוק נראה ואיפה.
- הצהר במפורש אילו אזורים נסרקו; אזור שלא נסרק/לא ניתן להעריך ← Indeterminate, לא "תקין".

החזר אך ורק JSON התואם לסכמה. טקסט חופשי ב-${outputLang}; מונחים רפואיים ניתן להשאיר גם באנגלית.`;
}

export const RADIOLOGY_SCHEMA = {
  type: "object",
  properties: {
    is_relevant: { type: "boolean" },
    interpretable: { type: "boolean" },
    abstain_reason: { type: "string" },
    image_metadata: {
      type: "object",
      properties: {
        modality_detected: { type: "string", description: "X-Ray / CT / MRI / Ultrasound" },
        anatomical_region: { type: "string", description: "Chest / Abdomen / Musculoskeletal / Brain / Spine ..." },
        technical_quality: { type: "string", description: "Adequate / Suboptimal / Artifacts present" },
        contrast_used: { type: "boolean" },
      },
      required: ["modality_detected", "anatomical_region", "technical_quality"],
    },
    systematic_findings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          anatomical_zone: { type: "string" },
          status: { type: "string", description: "Normal / Abnormal / Indeterminate" },
          description: { type: "string" },
        },
        required: ["anatomical_zone", "status", "description"],
      },
    },
    key_abnormalities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          finding: { type: "string" },
          severity: { type: "string", description: "Mild / Moderate / Severe" },
          location: { type: "string" },
          characteristics: { type: "string" },
        },
        required: ["finding", "location"],
      },
    },
    differential_diagnoses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          diagnosis: { type: "string" },
          likelihood: { type: "string", description: "High / Moderate / Low" },
        },
        required: ["diagnosis", "likelihood"],
      },
    },
    primary_impression: { type: "string" },
    clinical_urgency: { type: "string", enum: ["Normal", "Urgent", "Emergency"] },
    critical_red_flags: { type: "array", items: { type: "string" } },
    recommended_next_steps: { type: "array", items: { type: "string" } },
    patient_age_months: { type: "number", description: "גיל משוער בחודשים (לנורמות תלויות-גיל)" },
    measurements: {
      type: "array",
      description: "מדידות שחולצו; המערכת משווה לנורמה בקוד",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "number" },
          unit: { type: "string" },
        },
        required: ["key", "value"],
      },
    },
    critical_rule_out: {
      type: "array",
      description: "שלילת דפוסים מסכני-חיים — לכל דפוס: met / indeterminate / not_met",
      items: {
        type: "object",
        properties: {
          pattern_key: { type: "string" },
          status: { type: "string", description: "met / indeterminate / not_met" },
          evidence: { type: "string" },
        },
        required: ["pattern_key", "status"],
      },
    },
    regions: {
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
    confidence: { type: "number", description: "0-100 calibrated confidence" },
  },
  required: [
    "is_relevant",
    "interpretable",
    "image_metadata",
    "systematic_findings",
    "primary_impression",
    "clinical_urgency",
  ],
};

/** Light internal-consistency checks (cheap hallucination catchers). */
function radiologyConsistency(st) {
  const warnings = [];
  const abn = (st.key_abnormalities || []).filter((a) => a && a.finding);
  const flags = (st.critical_red_flags || []).filter(Boolean);
  if (st.clinical_urgency === "Emergency" && abn.length === 0 && flags.length === 0) {
    warnings.push("סתירה: דחיפות 'Emergency' ללא אף אבנורמליות מרכזית או דגל-אדום מתועד.");
  }
  const anyAbnZone = (st.systematic_findings || []).some((f) => /abnormal|חריג|abnormal/i.test(f.status || ""));
  if (anyAbnZone && abn.length === 0) {
    warnings.push("אזור סומן כחריג בסריקה השיטתית אך לא תועדה אבנורמליות מרכזית תואמת.");
  }
  const unchar = abn.filter((a) => !a.characteristics);
  if (unchar.length) {
    warnings.push(`אבנורמליות ללא אפיון קונקרטי: ${unchar.map((a) => a.finding).join("، ")}.`);
  }
  return { warnings, penalty: warnings.length * 8 };
}

export function buildRadiologyEvidenceBlock(engineResult) {
  const st = engineResult?.structured;
  if (!st) return "";
  const md = st.image_metadata || {};
  const sysF = (st.systematic_findings || [])
    .map((f) => `  - ${f.anatomical_zone} [${f.status}]: ${f.description}`)
    .join("\n");
  const abn = (st.key_abnormalities || [])
    .map((a) => `  - ${a.finding} (${a.severity || "?"}) @ ${a.location || "?"}: ${a.characteristics || "—"}`)
    .join("\n");
  const dd = (st.differential_diagnoses || []).map((d) => `${d.diagnosis} (${d.likelihood})`).join(", ");
  const warns = engineResult.warnings || [];
  return `
## פענוח רדיולוגי מובנה (ראיה משלימה — הסתמך על הממצאים)
- **מודליות/אזור:** ${md.modality_detected || "—"} / ${md.anatomical_region || "—"} | איכות: ${md.technical_quality || "—"} | ניגוד: ${md.contrast_used ? "כן" : "לא/לא ידוע"}
- **סריקה שיטתית:**\n${sysF || "  —"}
- **אבנורמליות מרכזיות:**\n${abn || "  —"}
- **אבחנות מבדלות:** ${dd || "—"}
- **רושם ראשוני:** ${st.primary_impression || "—"}
- **דגלים אדומים:** ${(st.critical_red_flags || []).join(", ") || "—"}
- **דחיפות (מנוע):** ${st.clinical_urgency || "—"} | ביטחון מכויל: ${engineResult.confidence}%
- **צעדי המשך:** ${(st.recommended_next_steps || []).join(", ") || "—"}
${warns.length ? `\n### ⚠️ אזהרות אנטי-הזיה — התייחס אליהן:\n${warns.map((w) => "- " + w).join("\n")}` : ""}

⚠️ אל תאמץ אבנורמליות ללא אפיון תומך, או דחיפות ללא ראיה, כאבחנה ודאית.`;
}

export async function runRadiologyEngine({
  fileUrls,
  clinicalContext,
  language = "he",
  pediatric = false,
  invokeLLM,
  onStage,
  // ⚡ קריאת-הראייה העיקרית עוברת למודל המהיר (Sonnet) לצמצום זמן-פענוח;
  // הערכת המדידות מול נורמות-גיל מחושבת בקוד ומבטיחה את הדיוק הנומרי.
  model = FAST_MODEL,
  imageData = null,
}) {
  void DIAGNOSIS_MODEL;
  onStage?.("interpreting");

  let morphology = null;
  const morphWarnings = [];
  if (imageData) {
    morphology = extractRadiologyFeatures(imageData);
    if (!morphology.ok) {
      morphWarnings.push(`מדידת מאפייני הדמיה נכשלה (${morphology.reason}) — אין ניחוש צפיפויות/תסנינים.`);
    } else if (morphology.note_he) {
      morphWarnings.push(morphology.note_he);
    }
  }

  const prompt = buildRadiologySystemPrompt({ clinicalContext, language, pediatric });

  const pass1 = await invokeLLM({
    prompt,
    file_urls: fileUrls,
    response_json_schema: RADIOLOGY_SCHEMA,
    add_context_from_internet: false,
    model,
  });

  if (pass1 && (pass1.is_relevant === false || pass1.interpretable === false)) {
    return {
      abstain: true,
      abstain_reason:
        pass1.abstain_reason ||
        (pass1.is_relevant === false ? "התמונה אינה נראית כבדיקת הדמיה רפואית." : "בדיקת ההדמיה אינה קריאה מספיק."),
      structured: pass1,
      morphology,
    };
  }

  const cons = radiologyConsistency(pass1);
  const warnings = [...cons.warnings, ...morphWarnings];
  let confidence = (typeof pass1.confidence === "number" ? pass1.confidence : 60) - cons.penalty;

  // ---- Critical rule-out escalation (a met life-threat forces urgency) ----
  const radCrit = applyRadiologyCritical(pass1);
  warnings.push(...radCrit.warnings);
  const urank = { Normal: 0, Urgent: 1, Emergency: 2 };
  if (radCrit.forcedUrgency && urank[radCrit.forcedUrgency] > urank[pass1.clinical_urgency || "Normal"]) {
    pass1.clinical_urgency = radCrit.forcedUrgency;
  }

  // ---- Deterministic measurement evaluation vs textbook norms (Caffey/OHSU) ----
  const measurementEval = evaluateMeasurements(pass1.measurements || [], { ageMonths: pass1.patient_age_months });
  for (const me of measurementEval) {
    if (me.verdict === "above_normal" || me.verdict === "below_normal") {
      warnings.push(
        `${me.label_he}: ${me.value}${me.unit} — ${me.verdict === "above_normal" ? "מעל" : "מתחת ל"}נורמה לגיל (תקין ${me.normal[0] ?? ""}–${me.normal[1] ?? ""}${me.unit}${me.age_band ? ", " + me.age_band : ""}).${me.note_he ? " " + me.note_he : ""}`
      );
    }
  }

  // ---- Vision numeric guard: flag narrative numbers not backed by a measurement ----
  warnings.push(...runVisionNumericGuard(pass1, groundedRadiologyNumbers(pass1, measurementEval)).warnings);

  const urgent = pass1.clinical_urgency === "Urgent" || pass1.clinical_urgency === "Emergency";
  const needsScrutiny = urgent || confidence < 60 || cons.warnings.length > 0;

  let verification = null;
  if (needsScrutiny) {
    onStage?.("scrutinizing");
    verification = await verifyDiagnosis({
      fileUrls,
      analysisType: "radiology",
      primaryDiagnosis: st0(pass1),
      summary: pass1.primary_impression,
      severity: pass1.clinical_urgency,
      language,
      invokeLLM,
    }).catch(() => null);
    if (verification && verification.refuted) {
      confidence -= 20;
      warnings.push(`בקרה נגדית: ${verification.refutation}`);
    }
    if (verification && Array.isArray(verification.missed_findings) && verification.missed_findings.length) {
      warnings.push(`ממצאים אפשריים שפוספסו: ${verification.missed_findings.join("، ")}`);
    }
  }

  confidence = Math.max(5, Math.min(99, Math.round(confidence)));
  let uncertaintyLevel = null;
  if (confidence < 45 || (verification && verification.refuted)) uncertaintyLevel = "high";
  else if (confidence < 65 || cons.warnings.length) uncertaintyLevel = "medium";

  return { abstain: false, structured: pass1, warnings, confidence, uncertaintyLevel, verification, measurement_eval: measurementEval, morphology };
}

function st0(st) {
  const top = (st.key_abnormalities || [])[0];
  if (top) return top.finding;
  const dd = (st.differential_diagnoses || [])[0];
  return dd ? dd.diagnosis : st.primary_impression;
}
