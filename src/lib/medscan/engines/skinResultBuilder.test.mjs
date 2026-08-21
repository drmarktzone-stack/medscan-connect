/**
 * End-to-end tests for skin result assembly.
 * Run: node src/lib/medscan/engines/skinResultBuilder.test.mjs
 */
import { assembleSkinResult, mapSkinSeverity, matchSkinKb } from "./skinResultBuilder.js";

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); console.log("  ✓ " + n); pass++; } catch (e) { console.log("  ✗ " + n + "\n      " + e.message); fail++; } };
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

const KB = [
  { title: "מלנומה ממאירה", diagnosis: "Malignant Melanoma", image_url: "http://x/mel.png" },
  { title: "דלקת עור אטופית", diagnosis: "Atopic Dermatitis", image_url: null },
];

console.log("\nSkin Result Builder — end-to-end assembly\n");

t("נגע חשוד עם ניקוד דרמוסקופי גבוה → severity severe + KB melanoma", () => {
  const engine = {
    structured: {
      dermatological_descriptors: { primary_lesions: ["macule"], distribution_pattern: "back", color_and_border: "asymmetric, irregular" },
      differential_diagnoses: [{ diagnosis: "Malignant Melanoma", likelihood: "High", supporting_features: "ABCD חיובי" }],
      primary_impression: "Suspicious pigmented lesion — melanoma cannot be excluded",
      clinical_urgency: "Urgent", critical_red_flags: ["asymmetry + multiple colors"], recommended_next_steps: ["הפניה דחופה לדרמטולוג"],
    },
    warnings: [], confidence: 78, uncertaintyLevel: null,
    dermoscopy: { risk: { level: "high", reasons: ["blue-white veil", "atypical network"], referral_he: "הפניה להערכה דחופה" } },
    suspected_allergens: [],
  };
  const r = assembleSkinResult(engine, KB, { fileUrl: "http://x/lesion.png" });
  assert(r.severity === "severe" || r.severity === "urgent", "high-risk → severe/urgent, got " + r.severity);
  assert(r.matchedCases[0].diagnosis === "Malignant Melanoma", "top dx is the tool's own");
  assert(r.matchedCases[0].image_url === "http://x/mel.png", "melanoma KB reference image attached");
  assert(/ניקוד דרמוסקופי/.test(r.analysis), "dermoscopy score section present");
});

t("פריחה שפירה → severity mild/normal, אבחנה מבדלת מוצגת", () => {
  const engine = {
    structured: {
      dermatological_descriptors: { primary_lesions: ["erythematous patches"], distribution_pattern: "flexural" },
      differential_diagnoses: [{ diagnosis: "Atopic Dermatitis", likelihood: "High", supporting_features: "flexural + pruritus" }],
      primary_impression: "Atopic dermatitis",
      clinical_urgency: "Normal", critical_red_flags: [], recommended_next_steps: ["אמוליינטים"],
    },
    warnings: [], confidence: 82, uncertaintyLevel: null, dermoscopy: null, suspected_allergens: ["ניקל"],
  };
  const r = assembleSkinResult(engine, KB, { fileUrl: "http://x/rash.png" });
  assert(r.severity === "mild" || r.severity === "normal", "benign rash → mild/normal, got " + r.severity);
  assert(r.matchedCases[0].kb_reference === "דלקת עור אטופית", "KB text match");
  assert(/ניקל/.test(r.analysis), "allergen listed");
});

t("Emergency → urgent", () => {
  const s = mapSkinSeverity({ structured: { clinical_urgency: "Emergency", differential_diagnoses: [] } });
  assert(s.severity === "urgent", "emergency → urgent, got " + s.severity);
});

t("matchSkinKb — טקסט חד-מילי מובחן מתאים", () => {
  assert(matchSkinKb("Melanoma", KB)?.title === "מלנומה ממאירה", "melanoma matched");
  assert(matchSkinKb("Psoriasis vulgaris", KB) === null, "unrelated → null");
});

t("assembleSkinResult מחזיר את כל שדות ה-UI + structured לכרטיס", () => {
  const engine = { structured: { dermatological_descriptors: {}, differential_diagnoses: [], primary_impression: "x", clinical_urgency: "Normal" }, warnings: [], confidence: 60, dermoscopy: null, suspected_allergens: [] };
  const r = assembleSkinResult(engine, KB, { fileUrl: "http://x/i.png" });
  for (const k of ["summary","severity","analysis","matchedCases","imageUrl","findings","guideline","structuredInterpretation"]) assert(k in r, "missing " + k);
  assert(r.structuredInterpretation.structured, "structured nested for card");
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
if (fail > 0) process.exit(1);
