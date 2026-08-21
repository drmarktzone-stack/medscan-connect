/**
 * ============================================================================
 *  MedScan AI — Visual Dermatology & Skin-Infection Interpretation Engine
 * ============================================================================
 *  Structured 4-step dermatological reading with the same anti-hallucination
 *  discipline as the ECG/radiology engines:
 *   - Relevance/quality gate (refuse non-skin or blurry/underlit images).
 *   - Systematic morphology: primary/secondary lesions, configuration,
 *     distribution, Fitzpatrick-aware color assessment.
 *   - Differentials carry supporting AND refuting features (forces the model
 *     to argue against itself — a strong anti-hallucination device).
 *   - Emergency red-flag detection (SJS/TEN, SSSS, meningococcemia, nec-fasc).
 *   - Adversarial verification for urgent/uncertain reads.
 * ============================================================================
 */

import { verifyDiagnosis } from "./verify";
import { DIAGNOSIS_MODEL, FAST_MODEL } from "./aiConfig";
import { sevenPointScore, abcdTds, chaosAndClues, malignancyRisk } from "./dermoscopyScore";
import { allergensForDistribution } from "./allergyModule";
import { extractDermatologyFeatures } from "./medscan/vision/dermatologyFeatures.js";

const langNames = { he: "Hebrew", en: "English", ar: "Arabic" };

const MORPHOLOGY = `## אלגוריתם הערכה דרמטולוגי בן 4 שלבים

### שלב 1 — נגע ראשוני
מקולה (<1ס"מ שטוח) מול פאטץ' (>1ס"מ שטוח) · פפולה (<1ס"מ מורם) מול פלאק (>1ס"מ) · נודול/גידול · וסיקולה (<1ס"מ נוזל) מול בולה (>1ס"מ) מול פוסטולה (מוגלה) · Wheal (בצקת חולפת) · קומדון.

### שלב 2 — נגע משני ושינויי פני שטח
קשקש · קרוסט (סרום/דם/מוגלה יבש) · ארוזיה (אובדן אפידרמיס) מול כיב (אובדן דרמיס) · פיסורה · ליכניפיקציה · אטרופיה · אקסקוריאציה · צלקת/קלואיד · פורפורה/פטכיות (לא מחווירות).

### שלב 3 — תצורה ותבנית
טבעתי (annular) · נומולרי (מטבע) · לינארי · Targetoid (מטרה) · רשתי · מקובץ/הרפטיפורם · דרמטומלי/זוסטריפורם · תופעת Köbner.

### שלב 4 — פיזור ואנטומיה
משטחים אקסטנסוריים מול פלקסוריים · אקרלי (כפות ידיים/רגליים) · אינטרטריגינוזי (קפלים) · חשוף-שמש · צנטריפטלי מול צנטריפוגלי · מוקמם מול כללי.

## פוטוטיפ Fitzpatrick
העריך גוון עור (I–VI) בעת שיפוט אריתמה, היפר/היפו-פיגמנטציה — נגעים נראים שונה בעור כהה.

## ספקטרום מחלות וזיהומים
זיהומיות (חיידקי: אימפטיגו/צלוליטיס/אריזיפלס/פוליקוליטיס/SSSS; ויראלי: HSV/VZV/מולוסקום/יבלות/exanthems; פטרייתי: Tinea/קנדידה/Pityriasis; טפילי: סקביאס/כינים/עקיצות) · דלקתי-אוטואימוני (אטופי/מגע/פסוריאזיס/סבוריאה/אורטיקריה/תגובות תרופתיות/EM-SJS-TEN) · ילדים (תפרחת חיתולים/cradle cap/erythema toxicum/המנגיומות) · פיגמנטי-ניאופלסטי (ABCDE למלנומה; SK/נבוס/BCC/SCC).`;

const ANTI_HALLUCINATION = `## חוקי-ברזל נגד הזיות (קריטי)
1. אל תמציא מאפיין שאינך רואה. תיאור מורפולוגי חייב להיות מבוסס-תמונה.
2. לכל אבחנה מבדלת ציין גם supporting_features וגם refuting_features — חובה לטעון גם נגד.
3. אל תכריז "Emergency" ללא דגל-אדום תומך (מעורבות ריריות, Nikolsky, פורפורה לא-מחווירה, סימנים סיסטמיים).
4. אל תניח "שפיר" כברירת מחדל — במיוחד בנגעים פיגמנטיים (ABCDE) ובחשד לממאירות.
5. איכות/תאורה/פוקוס ירודים → סמן וברר; אל תמציא.
6. הסתמך רק על התמונה — לא על ידע חיצוני/אינטרנט. תמונה אינה מחליפה מישוש ודרמוסקופיה.`;

export function buildSkinSystemPrompt({ clinicalContext, language = "he", pediatric = false } = {}) {
  const outputLang = langNames[language] || "Hebrew";
  return `אתה דרמטולוג/ית יועץ/ת בכיר/ה. בצע הערכה ויזואלית שיטתית של נגע/פריחה, שלב אחר שלב, מתיאור מורפולוגי לאבחנה, והחזר פלט מובנה.

## שלב 0 — רלוונטיות וקריאות
- אם התמונה אינה תצלום עור (נגע/פריחה) → is_relevant=false והסבר. אל תמציא אבחנה.
- אם היא עור אך לא-קריאה (טשטוש, תאורה ירודה, רחוק מדי) → interpretable=false, ופרט.
${pediatric ? "\n## מצב ילדים (Pediatric) פעיל\nהטה משקלים אבחוניים לכיוון exanthems ילדיים, תפרחות ניאונטליות, מאפייני מחסום עור ילדי, וצעדי המשך תואמי-גיל.\n" : ""}
${clinicalContext ? `## הקשר קליני\n${clinicalContext}\n` : ""}
${MORPHOLOGY}

${ANTI_HALLUCINATION}

## דרמוסקופיה (אם רלוונטי)
אם התמונה דרמוסקופית — מלא את שדה \`dermoscopy\`: סמן נוכחות/היעדר של המבנים (רשת אטיפית, blue-white veil, כלי-דם אטיפיים, פסים/נקודות/כתמים לא-סדירים, רגרסיה), תן קלט ABCD (אסימטריה 0-2, מקטעי-גבול 0-8, מספר צבעים 1-6, מבנים 1-5), ו-chaos+clues. **אל תחשב ניקוד — הוא מחושב בקוד.** תמונה קלינית (לא דרמוסקופית) → is_dermoscopic=false.

## פלט
## נגד פלט כללי (קריטי)
- אל תפיק תיאור עמום ("פריחה לא-ספציפית") ללא מאפיינים מורפולוגיים קונקרטיים (נגע ראשוני/משני, תצורה, פיזור, צבע/גבול) שנראים בתמונה.
- לכל אבחנה מבדלת — מאפיין תומך אחד לפחות ומאפיין סותר אחד, שניהם מבוססי-תמונה.

החזר אך ורק JSON התואם לסכמה. טקסט חופשי ב-${outputLang}; מונחים רפואיים ניתן להשאיר גם באנגלית.`;
}

export const SKIN_SCHEMA = {
  type: "object",
  properties: {
    is_relevant: { type: "boolean" },
    interpretable: { type: "boolean" },
    abstain_reason: { type: "string" },
    image_metadata: {
      type: "object",
      properties: {
        anatomical_location: { type: "string" },
        estimated_fitzpatrick_type: { type: "string", description: "Type I-VI" },
        technical_quality: { type: "string", description: "Adequate / Blur detected / Lighting insufficient" },
      },
      required: ["technical_quality"],
    },
    dermatological_descriptors: {
      type: "object",
      properties: {
        primary_lesions: { type: "array", items: { type: "string" } },
        secondary_lesions: { type: "array", items: { type: "string" } },
        configuration: { type: "string" },
        distribution_pattern: { type: "string" },
        color_and_border: { type: "string" },
      },
    },
    key_findings_summary: { type: "array", items: { type: "string" } },
    differential_diagnoses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          diagnosis: { type: "string" },
          likelihood: { type: "string", description: "High / Moderate / Low" },
          supporting_features: { type: "string" },
          refuting_features: { type: "string" },
        },
        required: ["diagnosis", "likelihood"],
      },
    },
    primary_impression: { type: "string" },
    clinical_urgency: { type: "string", enum: ["Normal", "Urgent", "Emergency"] },
    critical_red_flags: { type: "array", items: { type: "string" } },
    recommended_next_steps: { type: "array", items: { type: "string" } },
    dermoscopy: {
      type: "object",
      description: "מלא רק אם התמונה דרמוסקופית (אחרת is_dermoscopic=false). מבנים = נוכחות/היעדר; ABCD = קלט לניקוד. הניקוד עצמו מחושב בקוד — אל תחשב.",
      properties: {
        is_dermoscopic: { type: "boolean" },
        structures: {
          type: "object",
          properties: {
            atypical_network: { type: "boolean" },
            blue_white_veil: { type: "boolean" },
            atypical_vascular: { type: "boolean" },
            irregular_streaks: { type: "boolean" },
            irregular_dots_globules: { type: "boolean" },
            irregular_blotches: { type: "boolean" },
            regression: { type: "boolean" },
          },
        },
        abcd: {
          type: "object",
          properties: {
            asymmetry: { type: "number", description: "0-2" },
            border_segments: { type: "number", description: "0-8" },
            colors: { type: "number", description: "1-6" },
            structures: { type: "number", description: "1-5" },
          },
        },
        chaos: { type: "boolean" },
        clues: { type: "array", items: { type: "string" } },
      },
    },
    confidence: { type: "number", description: "0-100 calibrated confidence" },
  },
  required: [
    "is_relevant",
    "interpretable",
    "image_metadata",
    "dermatological_descriptors",
    "differential_diagnoses",
    "primary_impression",
    "clinical_urgency",
  ],
};

function skinConsistency(st) {
  const warnings = [];
  const flags = (st.critical_red_flags || []).filter(Boolean);
  if (st.clinical_urgency === "Emergency" && flags.length === 0) {
    warnings.push("סתירה: דחיפות 'Emergency' ללא דגל-אדום מתועד (מעורבות ריריות/Nikolsky/פורפורה/סיסטמי).");
  }
  const dd = st.differential_diagnoses || [];
  const noRefute = dd.filter((d) => d.diagnosis && !d.refuting_features);
  if (dd.length > 0 && noRefute.length === dd.length) {
    warnings.push("אף אבחנה מבדלת אינה כוללת מאפיינים שוללים — ייתכן ביטחון-יתר (לא נטען נגד).");
  }
  return { warnings, penalty: warnings.length * 8 };
}

export function buildSkinEvidenceBlock(engineResult) {
  const st = engineResult?.structured;
  if (!st) return "";
  const md = st.image_metadata || {};
  const d = st.dermatological_descriptors || {};
  const dd = (st.differential_diagnoses || [])
    .map((x) => `  - ${x.diagnosis} (${x.likelihood}) | תומך: ${x.supporting_features || "—"} | שולל: ${x.refuting_features || "—"}`)
    .join("\n");
  const warns = engineResult.warnings || [];
  return `
## פענוח דרמטולוגי מובנה (ראיה משלימה — הסתמך על המורפולוגיה)
- **מיקום/Fitzpatrick/איכות:** ${md.anatomical_location || "—"} | ${md.estimated_fitzpatrick_type || "—"} | ${md.technical_quality || "—"}
- **נגעים ראשוניים:** ${(d.primary_lesions || []).join(", ") || "—"} | **משניים:** ${(d.secondary_lesions || []).join(", ") || "—"}
- **תצורה/פיזור:** ${d.configuration || "—"} / ${d.distribution_pattern || "—"} | **צבע/גבול:** ${d.color_and_border || "—"}
- **סיכום ממצאים:** ${(st.key_findings_summary || []).join("; ") || "—"}
- **אבחנות מבדלות (תומך/שולל):**\n${dd || "  —"}
- **רושם ראשוני:** ${st.primary_impression || "—"}
- **דגלים אדומים:** ${(st.critical_red_flags || []).join(", ") || "—"}
- **דחיפות (מנוע):** ${st.clinical_urgency || "—"} | ביטחון מכויל: ${engineResult.confidence}%
- **צעדי המשך:** ${(st.recommended_next_steps || []).join(", ") || "—"}
${warns.length ? `\n### ⚠️ אזהרות אנטי-הזיה — התייחס אליהן:\n${warns.map((w) => "- " + w).join("\n")}` : ""}

⚠️ אל תאמץ אבחנה שנשללה בבקרה, או "שפיר" ללא ביסוס. תמונה אינה מחליפה מישוש/דרמוסקופיה.`;
}

export async function runSkinEngine({
  fileUrls,
  clinicalContext,
  language = "he",
  pediatric = false,
  invokeLLM,
  onStage,
  // ⚡ קריאת-הראייה העיקרית עוברת למודל המהיר (Sonnet) לצמצום זמן-פענוח;
  // הניקוד הדרמוסקופי (7-point/ABCD/chaos) מחושב בקוד ומבטיח את הדיוק הנומרי.
  model = FAST_MODEL,
  imageData = null,
}) {
  void DIAGNOSIS_MODEL;
  onStage?.("interpreting");

  let morphology = null;
  const morphWarnings = [];
  if (imageData) {
    morphology = extractDermatologyFeatures(imageData);
    if (!morphology.ok) {
      morphWarnings.push(`מדידה מורפולוגית נכשלה (${morphology.reason}) — אין ניחוש מאפיינים.`);
    } else if (morphology.note_he) {
      morphWarnings.push(morphology.note_he);
    }
  }

  const prompt = buildSkinSystemPrompt({ clinicalContext, language, pediatric });

  const pass1 = await invokeLLM({
    prompt,
    file_urls: fileUrls,
    response_json_schema: SKIN_SCHEMA,
    add_context_from_internet: false,
    model,
  });

  if (pass1 && (pass1.is_relevant === false || pass1.interpretable === false)) {
    return {
      abstain: true,
      abstain_reason:
        pass1.abstain_reason ||
        (pass1.is_relevant === false ? "התמונה אינה נראית כתצלום עור." : "תצלום העור אינו קריא מספיק (טשטוש/תאורה)."),
      structured: pass1,
      morphology,
    };
  }

  const cons = skinConsistency(pass1);
  const warnings = [...cons.warnings, ...morphWarnings];
  let confidence = (typeof pass1.confidence === "number" ? pass1.confidence : 60) - cons.penalty;

  // ---- Deterministic dermoscopy scoring + allergen mapping (code, not LLM) ----
  let dermoscopy = null;
  if (pass1?.dermoscopy?.is_dermoscopic) {
    const d = pass1.dermoscopy;
    const seven = sevenPointScore(d.structures || {});
    const tds = abcdTds(d.abcd || {});
    const chaos = chaosAndClues(d.chaos, d.clues || []);
    const risk = malignancyRisk({ sevenPoint: seven, tds, chaos, redFlags: pass1.critical_red_flags || [] });
    dermoscopy = { seven, tds, chaos, risk };
    if (risk.level === "high" && pass1.clinical_urgency === "Normal") {
      pass1.clinical_urgency = "Urgent";
      warnings.push(`ניקוד דרמוסקופי גבוה (${risk.reasons.join(", ")}) — הועלתה הדחיפות; ${risk.referral_he}`);
    }
  }
  const suspectedAllergens = allergensForDistribution(pass1?.dermatological_descriptors?.distribution_pattern || "");

  const urgent = pass1.clinical_urgency === "Urgent" || pass1.clinical_urgency === "Emergency";
  const needsScrutiny = urgent || confidence < 60 || cons.warnings.length > 0;

  let verification = null;
  if (needsScrutiny) {
    onStage?.("scrutinizing");
    const top = (pass1.differential_diagnoses || [])[0];
    verification = await verifyDiagnosis({
      fileUrls,
      analysisType: "skin",
      primaryDiagnosis: top ? top.diagnosis : pass1.primary_impression,
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

  return { abstain: false, structured: pass1, warnings, confidence, uncertaintyLevel, verification, dermoscopy, suspected_allergens: suspectedAllergens, morphology };
}
