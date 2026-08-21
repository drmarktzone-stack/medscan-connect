/**
 * End-to-end tests for the radiology result assembly.
 * Run: node src/lib/medscan/engines/radiologyResultBuilder.test.mjs
 */
import { assembleRadiologyResult, mapRadiologySeverity, matchRadiologyKb, buildRadiologyMatches } from "./radiologyResultBuilder.js";

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log("  ✓ " + n); pass++; } catch (e) { console.log("  ✗ " + n + "\n      " + e.message); fail++; } };
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

const KB = [
  { title: "דלקת ריאות אונתית", diagnosis: "Lobar Pneumonia", image_url: "http://x/pna.png" },
  { title: "פנאומוטורקס", diagnosis: "Pneumothorax", image_url: null },
  { title: "אפנדיציטיס חריפה", diagnosis: "Acute Appendicitis", image_url: null },
];

console.log("\nRadiology Result Builder — end-to-end assembly\n");

t("בדיקה תקינה → severity normal, ללא ממצא, כותרת מודליות", () => {
  const engine = {
    structured: {
      image_metadata: { modality_detected: "X-Ray", anatomical_region: "Chest", technical_quality: "Adequate" },
      systematic_findings: [{ anatomical_zone: "Lungs", status: "Normal", description: "שדות ריאה נקיים" }],
      key_abnormalities: [], differential_diagnoses: [], primary_impression: "",
      clinical_urgency: "Normal", critical_red_flags: [], recommended_next_steps: [], regions: [],
    },
    warnings: [], confidence: 88, uncertaintyLevel: null, measurement_eval: [],
  };
  const r = assembleRadiologyResult(engine, KB, { fileUrl: "http://x/cxr.png" });
  assert(r.severity === "normal", "normal severity, got " + r.severity);
  assert(r.matchedCases.length === 0, "no matches when no differentials");
  assert(/X-Ray/.test(r.summary) || /ללא ממצא/.test(r.summary), "summary reflects normal: " + r.summary);
  assert(/בגבולות הנורמה/.test(r.analysis), "analysis states normal");
});

t("פנאומוטורקס (Emergency) → urgent, דגל אדום, תיבת-תחום, KB match", () => {
  const engine = {
    structured: {
      image_metadata: { modality_detected: "X-Ray", anatomical_region: "Chest", technical_quality: "Adequate" },
      systematic_findings: [{ anatomical_zone: "Pleura", status: "Abnormal", description: "קו פלאורלי + היעדר סימני ריאה" }],
      key_abnormalities: [{ finding: "Pneumothorax", severity: "Severe", location: "ריאה ימנית", characteristics: "קריסה ~30%" }],
      differential_diagnoses: [{ diagnosis: "Pneumothorax", likelihood: "High", reasoning: "קו פלאורלי ברור" }],
      primary_impression: "Right-sided pneumothorax",
      clinical_urgency: "Emergency", critical_red_flags: ["Tension physiology — decompress if unstable"],
      recommended_next_steps: ["הערכה מיידית", "שקול ניקוז"], regions: [{ label: "PTX", x: 60, y: 10, width: 30, height: 40 }],
    },
    warnings: [], confidence: 82, uncertaintyLevel: null, measurement_eval: [],
  };
  const r = assembleRadiologyResult(engine, KB, { fileUrl: "http://x/cxr.png" });
  assert(r.severity === "urgent", "emergency → urgent, got " + r.severity);
  assert(/Pneumothorax|pneumothorax/.test(r.summary), "summary: " + r.summary);
  assert(r.matchedCases[0] && r.matchedCases[0].diagnosis === "Pneumothorax", "top match is the tool's dx");
  assert(r.matchedCases[0].kb_reference === "פנאומוטורקס", "KB reference matched by text");
  assert(r.findings.length === 1, "bounding box carried");
  assert(/דגלים אדומים/.test(r.analysis), "red flags section present");
});

t("מדידה חריגה מוצגת עם verdict מהקוד", () => {
  const engine = {
    structured: {
      image_metadata: { modality_detected: "Ultrasound", anatomical_region: "Abdomen", technical_quality: "Adequate" },
      systematic_findings: [], key_abnormalities: [{ finding: "Dilated appendix", severity: "Moderate", location: "RLQ" }],
      differential_diagnoses: [{ diagnosis: "Acute Appendicitis", likelihood: "High" }],
      primary_impression: "Findings consistent with acute appendicitis",
      clinical_urgency: "Urgent", critical_red_flags: [], recommended_next_steps: ["התייעצות כירורגית"], regions: [],
    },
    warnings: [], confidence: 80, uncertaintyLevel: "medium",
    measurement_eval: [{ key: "appendix_diameter_us", label_he: "קוטר תוספתן (US)", value: 9, unit: "mm", normal: [null, 6], age_band: "≤6מ\"מ", verdict: "above_normal", note_he: "" }],
  };
  const r = assembleRadiologyResult(engine, KB, { fileUrl: "http://x/us.png" });
  assert(r.severity === "severe", "Urgent → severe, got " + r.severity);
  assert(r.measurements.some(m => /תוספתן/.test(m.parameter) && /↑/.test(m.value)), "abnormal measurement flagged up");
  assert(/מעל הנורמה/.test(r.analysis), "analysis shows above-normal verdict");
  assert(r.matchedCases[0].kb_reference === "אפנדיציטיס חריפה", "KB text match for appendicitis");
  assert(r.uncertainty && r.uncertainty.level === "medium", "uncertainty surfaced");
});

t("severity mapping — Normal עם ממצא קל → mild", () => {
  const s = mapRadiologySeverity({ clinical_urgency: "Normal", key_abnormalities: [{ finding: "Mild scoliosis", severity: "Mild" }] });
  assert(s.severity === "mild", "mild abnormality → mild, got " + s.severity);
});

t("matchRadiologyKb — דורש חפיפה ≥2, אחרת null", () => {
  assert(matchRadiologyKb("Lobar Pneumonia", KB)?.title === "דלקת ריאות אונתית", "pneumonia matched");
  assert(matchRadiologyKb("Glioblastoma multiforme", KB) === null, "unrelated → null");
});

t("assembleRadiologyResult מחזיר את כל שדות ה-UI", () => {
  const engine = { structured: { image_metadata: {}, systematic_findings: [], key_abnormalities: [], differential_diagnoses: [], primary_impression: "x", clinical_urgency: "Normal", regions: [] }, warnings: [], confidence: 70, measurement_eval: [] };
  const r = assembleRadiologyResult(engine, KB, { fileUrl: "http://x/i.png" });
  for (const k of ["summary","severity","analysis","matchedCases","imageUrl","findings","guideline","measurements","structuredInterpretation"]) assert(k in r, "missing " + k);
  assert(r.structuredInterpretation.structured, "structured nested for the card");
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
if (fail > 0) process.exit(1);
