/** בדיקות למנוע-היסודות הדטרמיניסטי של האק"ג. */
import assert from "node:assert";
import { classifyRhythm, classifyConduction, morphologyFindings, interpretFundamentals } from "./ecgFundamentals.js";
import { ecgBandForAge } from "../../ecgNormals.js";

let pass = 0, fail = 0;
const t = (n, fn) => { try { fn(); pass++; console.log("  ✓ " + n); } catch (e) { fail++; console.log("  ✗ " + n + "\n      " + e.message); } };

console.log("\nECG Fundamentals (deterministic)\n");

const adult = ecgBandForAge(30);

t("קצב סינוס תקין: P לפני כל QRS, סדיר, דופק בטווח", () => {
  const r = classifyRhythm({ hr_bpm: 75, regular: true, p_before_each_qrs: true, band: adult });
  assert.strictEqual(r.sinus, true);
  assert.strictEqual(r.rhythm_he, "קצב סינוס תקין");
  assert.strictEqual(r.severity, "normal");
});
t("ברדיקרדיה סינוסלית: דופק מתחת לטווח", () => {
  const r = classifyRhythm({ hr_bpm: 45, regular: true, p_before_each_qrs: true, band: adult });
  assert.ok(/ברדיקרדיה/.test(r.rhythm_he));
});
t("טכיקרדיה סינוסלית: דופק מעל הטווח", () => {
  const r = classifyRhythm({ hr_bpm: 130, regular: true, p_before_each_qrs: true, band: adult });
  assert.ok(/טכיקרדיה/.test(r.rhythm_he));
});
t("לא-סדיר בלי P → חשד AF", () => {
  const r = classifyRhythm({ hr_bpm: 110, regular: false, p_before_each_qrs: false, band: adult });
  assert.strictEqual(r.sinus, false);
  assert.ok(/פרפור עליות/.test(r.rhythm_he));
});
t("דופק חסר → לא ניתן לקבוע", () => {
  const r = classifyRhythm({ hr_bpm: null, regular: true, p_before_each_qrs: true, band: adult });
  assert.strictEqual(r.severity, "unknown");
});

t("מורפולוגיה: עליית ST ב-2 לידים → חשד STEMI (urgent)", () => {
  const f = morphologyFindings({ st_elevation_leads: [{ lead: "II", mm: 2 }, { lead: "III", mm: 2 }] });
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].severity, "urgent");
  assert.ok(/STEMI|אוטם/.test(f[0].meaning_he));
});
t("מורפולוגיה: עלייה מפושטת + ירידת PR → דפוס פריקרדיטיס (yellow, לא אבחנה)", () => {
  const f = morphologyFindings({
    st_elevation_leads: ["I","II","aVF","V4","V5","V6"].map((l) => ({ lead: l, mm: 1.5 })),
    pr_depression: true,
  });
  assert.ok(/פריקרדיטיס/.test(f[0].finding_he + f[0].meaning_he));
  assert.strictEqual(f[0].severity, "yellow");
  assert.ok(/אינו אבחנה/.test(f[0].meaning_he));
});
t("מורפולוגיה תקינה → אין ממצאים", () => {
  assert.strictEqual(morphologyFindings({}).length, 0);
});

t("אינטגרציה: תרשים תקין → severity normal, summary תקין", () => {
  const out = interpretFundamentals({
    measured: { rate: { hr_bpm: 72 }, intervals: { pr_ms: 150, qrs_ms: 90 }, qtc: { bazett: 410 }, axis: { category: "normal", degrees: 40 } },
    observations: { regular: true, p_before_each_qrs: true },
    ageYears: 30,
  });
  assert.strictEqual(out.severity, "normal");
  assert.ok(/בגבולות הנורמה/.test(out.summary_he));
  assert.strictEqual(out.morphology.length, 0);
});

t("אינטגרציה: עליית ST → severity urgent", () => {
  const out = interpretFundamentals({
    measured: { rate: { hr_bpm: 80 }, intervals: { pr_ms: 150, qrs_ms: 90 }, qtc: { bazett: 420 }, axis: { category: "normal" } },
    observations: { regular: true, p_before_each_qrs: true, st_elevation_leads: [{ lead: "V2", mm: 3 }, { lead: "V3", mm: 3 }] },
    ageYears: 55,
  });
  assert.strictEqual(out.severity, "urgent");
  assert.ok(out.morphology.length >= 1);
});

t("אינטגרציה: QTc מוארך → אזהרת-מרווח מנורמות-הגיל", () => {
  const out = interpretFundamentals({
    measured: { rate: { hr_bpm: 70 }, intervals: { pr_ms: 150, qrs_ms: 90 }, qtc: { bazett: 500 }, axis: { category: "normal" } },
    observations: { regular: true, p_before_each_qrs: true },
    ageYears: 30,
  });
  assert.ok(out.interval_warnings.some((w) => /QTc/.test(w)));
  assert.notStrictEqual(out.severity, "normal");
});

t("הולכה: QRS צר → narrow", () => {
  assert.strictEqual(classifyConduction({ qrs_ms: 90 }).type, "narrow");
});
t("הולכה: QRS רחב + S דומיננטי ב-V1 + R רחב לטרלי → LBBB (discordance צפוי)", () => {
  const c = classifyConduction({ qrs_ms: 145, v1_pattern: "dominant_s", lateral_broad_r: true });
  assert.strictEqual(c.type, "LBBB");
  assert.strictEqual(c.discordance_expected, true);
});
t("הולכה: QRS רחב + RSR' ב-V1 → RBBB", () => {
  assert.strictEqual(classifyConduction({ qrs_ms: 130, v1_pattern: "rsr_prime" }).type, "RBBB");
});

t("בטיחות: עליית ST בנוכחות LBBB → discordance/Sgarbossa (לא STEMI דחוף)", () => {
  const c = { type: "LBBB", he: "חסם צרור שמאלי (LBBB)", discordance_expected: true, severity: "yellow" };
  const f = morphologyFindings({ st_elevation_leads: [{ lead: "V2", mm: 2 }, { lead: "V3", mm: 2 }] }, { conduction: c });
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].severity, "yellow");
  assert.ok(/Sgarbossa|discordance/.test(f[0].meaning_he));
});

t("אינטגרציה: LBBB עם עליית ST → לא מסווג כ-STEMI דחוף", () => {
  const out = interpretFundamentals({
    measured: { rate: { hr_bpm: 80 }, intervals: { pr_ms: 160, qrs_ms: 150 }, qtc: { bazett: 460 }, axis: { category: "normal" } },
    observations: {
      regular: true, p_before_each_qrs: true,
      st_elevation_leads: [{ lead: "V2", mm: 2 }, { lead: "V3", mm: 2 }],
      v1_qrs_pattern: "dominant_s", lateral_broad_notched_r: true,
    },
    ageYears: 60,
  });
  assert.strictEqual(out.conduction.type, "LBBB");
  assert.notStrictEqual(out.severity, "urgent");
  assert.ok(out.morphology.some((m) => /Sgarbossa|discordance/.test(m.meaning_he)));
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
