import { base44 } from "@/api/base44Client";
import { buildCasesForMatching } from "./knowledgeBase";
import { GENERATION_MODEL } from "./aiConfig";
import { createVisionInvokeLLM } from "./medscan/llmAdapter";

// ⚠ עובר דרך המתאם ולא ישירות ל-SDK.
// שינוי התנהגות מכוון: add_context_from_internet היה true בשני המקומות
// וכעת מושבת. בהערכה זו אינה החמרה אלא תיקון: המבחן אמור
// למדוד את איכות ההתאמה מול ה-KB, וגישה לאינטרנט מנפחת את הדיוק
// הנמדד — המודל מחפש במקום להתאים.
const invokeEval = createVisionInvokeLLM({ purpose: "evaluation_match" });
const invokeGenerate = createVisionInvokeLLM({ purpose: "case_generation" });

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[^\w\s\u0590-\u05FF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyDiagnosisMatch(ai, correct) {
  const a = normalize(ai);
  const c = normalize(correct);
  if (!a || !c) return false;
  if (a === c) return true;
  if (a.includes(c) || c.includes(a)) return true;
  const cWords = new Set(c.split(" ").filter((w) => w.length > 2));
  const aWords = new Set(a.split(" ").filter((w) => w.length > 2));
  if (cWords.size === 0) return false;
  let overlap = 0;
  cWords.forEach((w) => { if (aWords.has(w)) overlap++; });
  return overlap / cWords.size >= 0.5;
}

export async function runEvaluation({ type, onProgress, onUpdate }) {
  const entityName = { ecg: "ECGCase", skin: "SkinCase", radiology: "RadiologyCase" }[type];
  const domainRole = { ecg: "קרדיולוג מומחה", skin: "דרמטולוג מומחה", radiology: "רדיולוג מומחה" }[type];

  const kbCases = await base44.entities[entityName].list("-created_date", 100);
  if (!kbCases || kbCases.length === 0) {
    throw new Error("מאגר הידע ריק. יש להוסיף מקרים לפני ביצוע הערכה.");
  }

  const allGold = await base44.entities.GoldStandardCase.filter({ type });
  const testable = allGold.filter((c) => c.image_url);
  if (testable.length === 0) {
    throw new Error("אין מקרי זהב עם תמונות לבדיקה. הוסף מקרים עם תמונות לסט הזהב.");
  }

  const casesForMatching = buildCasesForMatching(kbCases);
  const results = [];
  let correct = 0;
  let tp = 0, fn = 0, tn = 0, fp = 0;
  let confidentErrors = 0; // wrong AND asserted with high confidence == hallucination proxy

  for (let i = 0; i < testable.length; i++) {
    const gs = testable[i];

    const matchingResult = await invokeEval({
      prompt: `אתה ${domainRole}. התאם את התמונה מול כל מקרי מאגר הידע והחזר את התואם ביותר.

## מאגר הידע
${casesForMatching}

## הוראות
- הערך את מידת ההתאמה מול כל מקרה.
- החזר מערך matches מסודר מהתואם ביותר לפחות. כל פריט: case_id, title, diagnosis, confidence (0-100).`,
      file_urls: [gs.image_url],
      response_json_schema: {
        type: "object",
        properties: {
          matches: {
            type: "array",
            items: {
              type: "object",
              properties: {
                case_id: { type: "string" },
                title: { type: "string" },
                diagnosis: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["case_id", "title", "confidence"],
            },
          },
        },
        required: ["matches"],
      },
      model: GENERATION_MODEL,
    });

    const matches = (matchingResult.matches || [])
      .filter((m) => m.case_id)
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const topMatch = matches[0];
    const matchedCase = topMatch ? kbCases.find((c) => c.id === topMatch.case_id) : null;
    const isCorrect = matchedCase ? fuzzyDiagnosisMatch(matchedCase.diagnosis, gs.correct_diagnosis) : false;
    const aiUrgent = matchedCase?.urgent || (topMatch?.confidence || 0) >= 70;

    if (gs.urgent) {
      if (isCorrect) tp++; else fn++;
    } else {
      if (isCorrect && !aiUrgent) tn++; else fp++;
    }
    if (isCorrect) correct++;
    if (!isCorrect && (topMatch?.confidence || 0) >= 70) confidentErrors++;

    results.push({
      title: gs.title,
      correct_diagnosis: gs.correct_diagnosis,
      ai_diagnosis: matchedCase?.diagnosis || topMatch?.title || "לא זוהה",
      confidence: topMatch?.confidence || 0,
      is_correct: isCorrect,
      urgent: gs.urgent,
    });

    onProgress?.(i + 1, testable.length);
    onUpdate?.([...results]);
  }

  const total = testable.length;
  const accuracy = Math.round((correct / total) * 100);
  const sensitivity = tp + fn > 0 ? Math.round((tp / (tp + fn)) * 100) : 0;
  const specificity = tn + fp > 0 ? Math.round((tn / (tn + fp)) * 100) : 0;
  // Hallucination rate: share of cases the AI got WRONG while asserting high confidence.
  const hallucination_rate = total > 0 ? Math.round((confidentErrors / total) * 100) : 0;

  await base44.entities.TestRun.create({
    type, total_cases: total, correct, accuracy, sensitivity, specificity,
    results: JSON.stringify(results),
  });

  return { total, correct, accuracy, sensitivity, specificity, hallucination_rate, confident_errors: confidentErrors, results };
}

export async function generateCasesWithAI({ type, target, topic, count = 10 }) {
  const categoriesByType = {
    ecg: "rhythm, conduction, ischemic, chamber_abnormality, electrolyte, syndrome, drug_effect, other",
    skin: "benign, malignant, inflammatory, infectious, autoimmune, pigmentation, vascular, precancerous, other",
    radiology: "chest, abdominal, musculoskeletal, neurological, cardiac, vascular, genitourinary, other",
  };
  const domainByType = {
    ecg: "קרדיולוגיה ופענוח ECG",
    skin: "דרמטולוגיה",
    radiology: "רדיולוגיה והדמיה רפואית",
  };
  const categories = categoriesByType[type];
  const domain = domainByType[type];

  // ⚠ הערת בטיחות: הפונקציה מייצרת מקרי ייחוס קליניים — אבחנות,
  // מאפיינים ודירוג דחיפות — מתוך ידע המודל, ללא עוגן למקור.
  // המקרים האלה נכנסים ל-ECGCase/SkinCase/RadiologyCase ומזינים את
  // שלב ההתאמה בצינור הקליני. זהו ידע שהמודל המציא ואז מסתמך
  // עליו כעל ייחוס. יש להשתמש בו למילוי ראשוני בלבד, וכל מקרה
  // חייב סקירה רפואית לפני שהוא משמש בפועל.
  const result = await invokeGenerate({
    prompt: `אתה מומחה רפואי בתחום ${domain}.
צור ${count} מקרים קליניים מגוונים ומדויקים${topic ? ` בנושא: ${topic}` : ""}.

## דרישות
- כל מקרה כולל: title, diagnosis, category (אחת מ: ${categories}), key_features, description, urgent (boolean).
- המאפיינים והתיאור צריכים להיות מפורטים וקליניים מדויקים.
- כלול מגוון רחב של מקרים — הן שכיחים והן נדירים, הן דחופים והן לא.
- הפץ את המקרים על פני קטגוריות שונות.
- בכל מקרה דחוף, ציין מדוע בתיאור.`,
    response_json_schema: {
      type: "object",
      properties: {
        cases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              diagnosis: { type: "string" },
              category: { type: "string" },
              key_features: { type: "string" },
              description: { type: "string" },
              urgent: { type: "boolean" },
            },
            required: ["title", "diagnosis", "category", "key_features", "description", "urgent"],
          },
        },
      },
      required: ["cases"],
    },
    model: GENERATION_MODEL,
  });

  return result.cases || [];
}