import { base44 } from "@/api/base44Client";
import { buildCasesForMatching, buildMatchedCasesText } from "./knowledgeBase";
import { getMeasurementProtocol, EXTRACTION_SCHEMA } from "./diagnosticProtocols";
import { runEcgEngine, buildEcgEvidenceBlock } from "./ecgEngine";
import { runRadiologyEngine, buildRadiologyEvidenceBlock } from "./radiologyEngine";
import { runSkinEngine, buildSkinEvidenceBlock } from "./skinEngine";
import { DIAGNOSIS_MODEL, FAST_MODEL } from "./aiConfig";
import { guardVisionNarrative } from "./medscan/engines/visionNarrativeGuard";
import { createVisionInvokeLLM } from "./medscan/llmAdapter";
import { downscaleImageFile } from "./imageOptimize";

// ⚠ כל קריאות ה-LLM בצינור עוברות דרך המתאם ולא ישירות ל-SDK.
// המתאם אוכף סכמת פלט, משבית הקשר-מהאינטרנט ומרכז ניטור.
// ⚠ זה אינו תחליף לשער העיגון (groundedInvoke) — ראה הערה בראש שלב 2.
const invokeExtract = createVisionInvokeLLM({ purpose: "vision_extract_match" });
const invokeDiagnosis = createVisionInvokeLLM({ purpose: "vision_diagnosis" });
const invokeEngine = createVisionInvokeLLM({ purpose: "vision_engine" });

const langNames = { he: "Hebrew", en: "English", ar: "Arabic" };

// Domain engine dispatch: each returns { abstain, structured, warnings, confidence, uncertaintyLevel }
const ENGINE_BY_TYPE = { ecg: runEcgEngine, radiology: runRadiologyEngine, skin: runSkinEngine };
const EVIDENCE_BY_TYPE = { ecg: buildEcgEvidenceBlock, radiology: buildRadiologyEvidenceBlock, skin: buildSkinEvidenceBlock };

const emptyKbErrors = {
  he: "מאגר הידע ריק. יש להוסיף מקרים למאגר לפני ביצוע אבחון.",
  en: "The knowledge base is empty. Please add cases before running a diagnosis.",
  ar: "قاعدة المعرفة فارغة. يرجى إضافة حالات قبل إجراء التشخيص.",
};

const abstainErrors = {
  he: (r) => `לא ניתן להפיק פענוח אמין: ${r} נא להעלות תמונה מתאימה, חדה וברורה.`,
  en: (r) => `Cannot produce a reliable reading: ${r} Please upload a suitable, sharp, clear image.`,
  ar: (r) => `تعذّر إنتاج قراءة موثوقة: ${r} يرجى رفع صورة مناسبة وواضحة.`,
};

const uncertaintyReasons = {
  he: {
    high: "רמת הביטחון של ההתאמה הטובה ביותר נמוכה. האבחנה אינה וודאית — מומלץ להתייעץ עם רופא מומחה לבדיקה נוספת.",
    medium: "מספר אבחנות מתחרות עם דרגות ביטחון דומות. רצוי בדיקה נוספת לאישוש האבחנה הסופית.",
  },
  en: {
    high: "The confidence level of the best match is low. The diagnosis is uncertain — consult a specialist for further evaluation.",
    medium: "Multiple competing diagnoses with similar confidence levels. Further testing is recommended to confirm the final diagnosis.",
  },
  ar: {
    high: "مستوى الثقة لأفضل تطابق منخفض. التشخيص غير مؤكد — يُنصح باستشارة طبيب مختص لمزيد من الفحص.",
    medium: "هناك عدة تشخيصات منافسة بمستويات ثقة متقاربة. يُنصح بإجراء فحوصات إضافية لتأكيد التشخيص النهائي.",
  },
};

const defaultFindingLabels = { he: "ממצא", en: "Finding", ar: "نتيجة" };

export async function runDiagnosisPipeline({
  files,
  preUploadedUrls,
  entityName,
  analysisType,
  domainRole,
  matchingInstructions,
  diagnosisInstructions,
  clinicalContext,
  onStage,
  language = "he",
  pediatric = false,
  patientAgeYears,
  patientSex,
  patientRef,
}) {
  const outputLang = langNames[language] || "Hebrew";
  const langDirective = `\n## Output Language\nALL text in your response (titles, reasoning, summary, analysis, guideline, finding labels) MUST be written in ${outputLang}. This is critical — the user selected ${outputLang} as their language.`;

  const protocol = getMeasurementProtocol(analysisType);

  // 0. Upload images (or use pre-uploaded URLs) + fetch knowledge-base cases in parallel
  const [resolvedUrls, allCases] = await Promise.all([
    preUploadedUrls && preUploadedUrls.length > 0
      ? Promise.resolve(preUploadedUrls)
      : Promise.all(files.map(async (f) => {
          const optimized = await downscaleImageFile(f); // מקטין מהירות; לא פוגע באיכות הפענוח
          const r = await base44.integrations.Core.UploadFile({ file: optimized });
          return r.file_url;
        })),
    base44.entities[entityName].list("-created_date", 1000),
  ]);
  const fileUrls = resolvedUrls;
  const file_url = fileUrls[0];

  if (!allCases || allCases.length === 0) {
    throw new Error(emptyKbErrors[language] || emptyKbErrors.he);
  }

  const casesForMatching = buildCasesForMatching(allCases);

  // ---------- Stage 1: Scan, Measure & Match ----------
  onStage?.("extracting");

  const stage1Promise = invokeExtract({
    prompt: `אתה ${domainRole} עם ניסיון רב שנים. משימה זו מחולקת לשני חלקים: ראשית סריקה ומדידה שיטתית של התמונה, ולאחר מכן התאמה מול כל מקרי מאגר הידע.

## התמונות לניתוח
תמונה 1 היא התמונה הראשית לניתוח. שאר התמונות (אם קיימות) הן זוויות/לידים נוספים.
${clinicalContext ? `\n## הקשר קליני של המטופל\n${clinicalContext}\n` : ""}
${protocol.measurement}

## חלק א׳ — סריקה ומדידה
בצע את הפרוטוקול המלא. חלץ כל מדד כערך כמותי ככל הניתן. אל תדלג על מדדים — אם אינו בר-הערכה מהתמונה, ציין זאת. המדידות ישמשו ראיה לשלב האימות והאבחון.

## מאגר הידע — כל המקרים (יש להעריך כל מקרה)
${casesForMatching}

## חלק ב׳ — התאמה
${matchingInstructions}

- התאם את המדידות והממצאים שחלצת מול **המאפיינים המרכזיים וגם קריטריוני-האבחון** של כל מקרה במאגר. שני אלה מסופקים לך לכל מקרה — השתמש בשניהם.
- לכל מקרה החזר ציון ביטחון 0-100 והסבר קצר המבוסס על המדידות ועל התאמת/אי-התאמת הקריטריונים.
- דרג מהתואם ביותר לפחות. החזר רק את 15 ההתאמות הטובות ביותר.
- אל תניח "תקין" כברירת מחדל — שקול כל מקרה ברצינות, במיוחד מצבים מסכני חיים.
${langDirective}`,
    file_urls: fileUrls,
    response_json_schema: {
      type: "object",
      properties: {
        measurements: EXTRACTION_SCHEMA.properties.measurements,
        red_flags: EXTRACTION_SCHEMA.properties.red_flags,
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              case_id: { type: "string" },
              title: { type: "string" },
              diagnosis: { type: "string" },
              confidence: { type: "number" },
              reasoning: { type: "string" },
            },
            required: ["case_id", "title", "confidence", "reasoning"],
          },
        },
      },
      required: ["measurements", "matches"],
    },
    add_context_from_internet: false,
    model: FAST_MODEL,
  });

  // ---------- Stage 1.5: Structured domain engine (parallel with Stage 1) ----------
  // ECG / radiology / skin each get a state-of-the-art structured reading with a
  // relevance/quality gate, internal-consistency checks and adversarial
  // verification for urgent/uncertain reads. See ecgEngine / radiologyEngine /
  // skinEngine.
  const engineFn = ENGINE_BY_TYPE[analysisType];
  const enginePromise = engineFn
    ? engineFn({
        fileUrls,
        clinicalContext,
        language,
        pediatric,
        ageYears: patientAgeYears,
        sex: patientSex,
        invokeLLM: invokeEngine,
        onStage,
      })
    : null;

  // ---------- Await parallel stages ----------
  const [extractMatchResult, engineResult] = await Promise.all([
    stage1Promise,
    enginePromise || Promise.resolve(null),
  ]);

  // ---------- Abstention gate (anti-hallucination: refuse irrelevant/unreadable input) ----------
  if (engineResult && engineResult.abstain) {
    const build = abstainErrors[language] || abstainErrors.he;
    throw new Error(build(engineResult.abstain_reason || ""));
  }
  const engine = engineResult && !engineResult.abstain ? engineResult : null;
  const engineStructured = engine?.structured || null;

  // שכבת הפרשנות המעוגנת (visionGrounded) אינה נקראת מכאן במכוון:
  // עמודי ה-Vision מריצים אותה בעצמם אחרי שהפענוח הוצג, כדי שהמשתמש
  // לא ימתין לה וכדי שכישלון שלה לא יפיל את הפענוח. קריאה נוספת מכאן
  // היתה מכפילה קריאת LLM שלמה ללא תועלת.

  const measurements = Array.isArray(extractMatchResult.measurements)
    ? extractMatchResult.measurements.filter((m) => m.parameter)
    : [];
  const redFlags = extractMatchResult.red_flags || "";

  const matches = (extractMatchResult.matches || [])
    .filter((m) => m.case_id)
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

  // ---------- Compute diagnostic uncertainty ----------
  const topConfidence = matches[0]?.confidence || 0;
  const secondConfidence = matches[1]?.confidence || 0;
  const confidenceGap = topConfidence - secondConfidence;
  const reasons = uncertaintyReasons[language] || uncertaintyReasons.he;

  let uncertainty = null;
  if (matches.length === 0 || topConfidence < 40) {
    uncertainty = { level: "high", reason: reasons.high };
  } else if (topConfidence < 65 && matches.length > 1 && confidenceGap <= 15) {
    uncertainty = { level: "medium", reason: reasons.medium };
  }

  // Merge the structured engine's own uncertainty verdict (cross-check / verifier).
  if (engine?.uncertaintyLevel) {
    const lvlRank = { medium: 1, high: 2 };
    if (!uncertainty || (lvlRank[engine.uncertaintyLevel] || 0) > (lvlRank[uncertainty.level] || 0)) {
      uncertainty = {
        level: engine.uncertaintyLevel,
        reason: reasons[engine.uncertaintyLevel] || reasons.medium,
      };
    }
  }

  // ---------- Resolve top matched cases (full detail + reference images) ----------
  const topMatchIds = matches.slice(0, 5).map((m) => m.case_id);
  const topCases = topMatchIds
    .map((id) => allCases.find((c) => c.id === id))
    .filter(Boolean);

  const referenceCases = topCases.slice(0, 3);
  const referenceImages = referenceCases
    .filter((c) => c.image_url)
    .map((c) => c.image_url);

  const matchedCasesText = buildMatchedCasesText(topCases);

  let imageLegend = "";
  if (referenceImages.length > 0) {
    const legendItems = referenceCases
      .filter((c) => c.image_url)
      .map((c, i) => `תמונה ${i + 2}: ייחוס עבור "${c.title}" (${c.diagnosis})`);
    imageLegend = `## תמונות להשוואה ויזואלית\nתמונה 1: התמונה לניתוח.\n${legendItems.join("\n")}`;
  }

  const measurementsText = measurements.length > 0
    ? measurements.map((m) => `- **${m.parameter}**: ${m.value}${m.notes ? ` — ${m.notes}` : ""}`).join("\n")
    : "לא חולצו מדידות.";

  // ---------- Structured-engine evidence block for the diagnosis stage ----------
  const engineEvidenceBlock = engine ? (EVIDENCE_BY_TYPE[analysisType]?.(engine) || "") : "";

  // ---------- Stage 2: Criteria Verification + Diagnosis ----------
  onStage?.("verifying");

  const matchesSummary = matches.slice(0, 5).map((m, i) =>
    `${i + 1}. ${m.title} — ${m.diagnosis || ""} (ביטחון התאמה: ${m.confidence}%): ${m.reasoning}`
  ).join("\n");

  // ⚠ שלב הפרשנות — הפער שנותר פתוח.
  //
  // שלב זה מפיק אבחנה ראשית, אבחנות מבדלות, דרגת חומרה
  // והמלצות קליניות — כלומר פרשנות, לא תפיסה. לפי התכן הוא
  // אמור לעבור דרך groundedInvoke ולהידרש ל-fact_refs לכל טענה.
  //
  // הוא אינו עובר שם עדיין, מסיבה אחת: כל ה-KB בסטטוס טיוטה,
  // ולכן buildFactBlock מחזיר hasVerifiedClinicalContent=false
  // ו-preflightCheck היה מסרב לכל ניתוח עם no_verified_knowledge.
  // זו התנהגות נכונה של השער, אך משמעותה שהמודול יפסיק להפיק
  // פלט עד שיאומת ידע — וזו הכרעה מוצרית, לא הנדסית.
  //
  // עד להכרעה: הקריאה עוברת דרך המתאם, ו-guardVisionNarrative
  // מאמת שכל מספר בנרטיב עקיב לתצפית. הוא מאמת עקיבות,
  // לא נכונות — ואינו דורש fact_refs.
  const diagnosis = await invokeDiagnosis({
    prompt: `אתה ${domainRole} עם ניסיון רב שנים. בצע אימות קריטריוני אבחון ולאחריו ניתוח קליני מפורט, המבוסס על המדידות שחולצו והמקרים התואמים מול מאגר הידע.

## התמונות לניתוח
תמונה 1 (התמונה הראשונה) היא התמונה הראשית. שאר התמונות הן זוויות/לידים נוספים. סמן ממצאים בתמונה 1 בלבד.
${clinicalContext ? `\n## הקשר קליני של המטופל\n${clinicalContext}\n` : ""}${pediatric ? "\n## מצב ילדים (Pediatric) פעיל — החל נורמות וקטלוג אבחנות תואמי-גיל.\n" : ""}
## מדידות שחולצו מהתמונה (שלב הסריקה והמדידה)
${measurementsText}
${redFlags ? `\n## דגלים אדומים שזוהו\n${redFlags}\n` : ""}
${engineEvidenceBlock}
## תוצאות שלב ההתאמה — המקרים התואמים ביותר
${matchesSummary}

## פרטי המקרים התואמים מתוך מאגר הידע (כולל קריטריוני אבחון)
${matchedCasesText}

${imageLegend}

${protocol.criteria}

## הוראות ניתוח
${diagnosisInstructions}

## כלל ברזל — דיוק דו-כיווני: לא תקין-שקרי ולא פתולוגיה-שקרית (CRITICAL)
1. **אבחנה ספציפית (פריקרדיטיס, MI, מיוקרדיטיס, וכו') מותר להציג כחשד אך ורק אם קריטריוני-האבחון שלה מתקיימים בפועל בתרשים — ציין אילו קריטריונים נצפו.** קריטריונים שאינם מתקיימים ⇒ האבחנה נשללת/לא-נתמכת, ואינה מוצגת כאבחנה ראשית. אסור לקפוץ מ"ST/T גבולי" לאבחנה חמורה בלי מכלול הקריטריונים.
2. **אם המדידות (קצב, מרווחים, ציר, ST, T) בגבולות הנורמה ואין ולו קריטריון פתולוגי חיובי אחד — הפלט הוא "בגבולות הנורמה / ללא ממצא חד-משמעי" (severity=normal).** זו תשובה תקינה, שלמה וצפויה. אל תמציא פתולוגיה כדי "לא לפספס".
3. כל חריגה אמיתית שנצפתה — סווג והסבר. אך **תיאור חריגה ≠ אבחנה**: חריגה בודדת אינה מספיקה לאבחנה ספציפית.
4. בטיחות must-not-miss נשמרת: דפוס מסכן-חיים מוסלם **כאשר מאפייניו המגדירים נצפים בתרשים** — לא כברירת-מחדל ולא מ"חשש" כללי.
5. בספק — העדף "נדרש מתאם קליני / חזרה על תרשים" והצהרת אי-ודאות, על-פני קביעת אבחנה חמורה שאינה נתמכת. **אבחנת-יתר של מצב חמור על תרשים תקין היא נזק, לא זהירות.**

## סימון אזורי ממצא על התמונה
זהה אזורים בתמונה 1 בהם יש ממצא חריג או משמעותי. לכל אזור החזר תיבת תחום (bounding box) בקואורדינטות נורמליזציה — אחוזים (0-100): x, y, width, height, label. אם אין ממצא חריג ברור, החזר מערך ריק.

## פלט נדרש
- **criteria_analysis**: עבור כל אחד מ-5 המקרים התואמים המובילים — מערך קריטריונים עם סטטוס (met / not_met / indeterminate) וראיה, ציון criteria_confidence (0-100), והמלצה (מאושר / סביר / אפשרי / נשלל).
- **summary**: סיכום תמציתי של הממצא העיקרי (משפט אחד).
- **severity**: רמת חומרה — normal / mild / moderate / severe / urgent.
- **guideline**: המלצת טיפול/הפניה מקצועית תמציתית וספציפית.
- **analysis**: ניתוח מפורט ב-Markdown הכולל:
  * **מדידות שחולצו** — טבלת המדידות הכמותיות
  * **אימות קריטריונים** — עמידה בקריטריונים של האבחנה המובילה
  * **תיאור הממצאים** — המאפיינים העיקריים
  * **השוואה למאגר הידע** — טבלת המקרים התואמים עם דרגת ביטחון ונימוק
  * **אבחנה ראשית** ואבחנות מבדלות
  * **סימני דגל אדום** אם קיימים
  * **המלצות קליניות** — המשך טיפול / בירור / הפניה
- **findings**: מערך אזורי ממצא (תיבות תחום).
${langDirective}`,
    file_urls: [...fileUrls, ...referenceImages],
    response_json_schema: {
      type: "object",
      properties: {
        criteria_analysis: {
          type: "array",
          description: "אימות קריטריוני אבחון עבור המקרים התואמים המובילים",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              diagnosis: { type: "string" },
              criteria: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    criterion: { type: "string" },
                    status: { type: "string", enum: ["met", "not_met", "indeterminate"] },
                    evidence: { type: "string" },
                  },
                  required: ["criterion", "status"],
                },
              },
              criteria_confidence: { type: "number" },
              recommendation: { type: "string" },
            },
            required: ["title", "criteria", "criteria_confidence"],
          },
        },
        summary: { type: "string", description: "סיכום קצר של הממצאים" },
        severity: { type: "string", enum: ["normal", "mild", "moderate", "severe", "urgent"] },
        analysis: { type: "string", description: "ניתוח מפורט בפורמט Markdown" },
        guideline: { type: "string", description: "המלצת טיפול/הפניה מקצועית תמציתית" },
        findings: {
          type: "array",
          description: "אזורי ממצא חריגים על גבי התמונה (תיבות תחום בקואורדינטות נורמליזציה 0-100)",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "תיאור קצר של הממצא באזור" },
              x: { type: "number", description: "פינה שמאלית-עליונה X (0-100)" },
              y: { type: "number", description: "פינה שמאלית-עליונה Y (0-100)" },
              width: { type: "number", description: "רוחב (0-100)" },
              height: { type: "number", description: "גובה (0-100)" },
            },
            required: ["label", "x", "y", "width", "height"],
          },
        },
      },
      required: ["summary", "severity", "analysis", "findings"],
    },
    add_context_from_internet: false,
    // ⚡ שלב האבחנה עובר למודל המהיר (הצינור משמש כעת רק עור+רדיולוגיה).
    // המנוע המבנה כבר ביצע את התפיסה; שלב זה מנסח ומאמת קריטריונים — Sonnet מספיק ומהיר בהרבה.
    model: FAST_MODEL,
  });

  // ---------- numericGuard על הנרטיב ----------
  // שלב 2 קורא תמונה ולכן אינו יכול לעבור דרך groundedInvoke.
  // מה שכן ניתן — וחיוני — הוא לוודא שכל מספר בניתוח עוקב
  // למשהו שנצפה בפועל. ראה visionNarrativeGuard.js — ובפרט את מגבלת
  // הבדיקה: היא מאמתת עקיבות, לא נכונות.
  const guarded = guardVisionNarrative({
    diagnosis,
    measurements,
    engineStructured,
    clinicalContext,
    matchedCasesText,
    redFlags,
  });
  const guardedDiagnosis = guarded.diagnosis;
  const numericIntegrity = guarded.integrity;

  // ---------- Validate & clamp findings (normalized 0-100) ----------
  const defaultLabel = defaultFindingLabels[language] || defaultFindingLabels.he;
  const rawFindings = Array.isArray(diagnosis.findings) ? diagnosis.findings : [];
  const findings = rawFindings
    .map((f) => {
      const x = Math.max(0, Math.min(100, Number(f.x) || 0));
      const y = Math.max(0, Math.min(100, Number(f.y) || 0));
      const width = Math.max(0, Math.min(100 - x, Number(f.width) || 0));
      const height = Math.max(0, Math.min(100 - y, Number(f.height) || 0));
      return { label: String(f.label || defaultLabel), x, y, width, height };
    })
    .filter((f) => f.width > 0 && f.height > 0);

  // ---------- Merge criteria-based confidence into matched cases ----------
  const criteriaMap = {};
  (diagnosis.criteria_analysis || []).forEach((ca) => {
    if (ca.title) criteriaMap[ca.title] = ca;
  });
  const enrichedMatches = matches.slice(0, 8).map((m) => {
    const ca = criteriaMap[m.title];
    if (ca) {
      const conf = typeof ca.criteria_confidence === "number" ? ca.criteria_confidence : m.confidence;
      const rec = ca.recommendation ? ` — ${ca.recommendation}` : "";
      return { ...m, confidence: conf, reasoning: `${m.reasoning}${rec}` };
    }
    return m;
  });

  // ---------- Severity safety-net: never under-call an engine-flagged emergency ----------
  const severityRank = { normal: 0, mild: 1, moderate: 2, severe: 3, urgent: 4 };
  let finalSeverity = diagnosis.severity;
  if (engineStructured) {
    const urgencyFloor = { Normal: null, Urgent: "severe", Emergency: "urgent" };
    const floor = urgencyFloor[engineStructured.clinical_urgency];
    if (floor && (severityRank[floor] || 0) > (severityRank[finalSeverity] || 0)) {
      finalSeverity = floor;
    }
  }

  // ---------- Persist the analysis ----------
  // נשמר הנוסח שהרופא/ה רואה — אחרי ניטרול מספרים חסרי-מקור.
  // אחרת הרישומה הרפואית תכיל מספר שמעולם לא הוצג.
  const analysisRecord = await base44.entities.Analysis.create({
    type: analysisType,
    image_url: file_url,
    result: guardedDiagnosis.analysis,
    severity: finalSeverity,
    summary: guardedDiagnosis.summary,
    structured_json: engine
      ? JSON.stringify({ structured: engine.structured, confidence: engine.confidence, warnings: engine.warnings })
      : undefined,
    patient_ref: patientRef || undefined,
  });

  return {
    summary: guardedDiagnosis.summary,
    severity: finalSeverity,
    analysis: guardedDiagnosis.analysis,
    matchedCases: enrichedMatches,
    imageUrl: file_url,
    findings,
    uncertainty,
    guideline: guardedDiagnosis.guideline,
    measurements,
    ecgInterpretation: analysisType === "ecg" ? engine : null,
    structuredInterpretation: engine,
    analysisId: analysisRecord.id,
    // אילו מספרים בניתוח עוקבים לתצפית — ואילו לא.
    numericIntegrity,
  };
}
