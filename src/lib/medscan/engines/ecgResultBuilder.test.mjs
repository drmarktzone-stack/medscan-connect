/**
 * End-to-end test of the ECG result assembly — the FULL code path that runs
 * after the single perception call, exercised exactly as the live pipeline
 * builds it (features → matchPathologies → assembleEcgResult).
 * Run: node src/lib/medscan/engines/ecgResultBuilder.test.mjs
 */
import { matchPathologies, featuresFromReading, buildPathologyBlock } from "./ecgPathologies.js";
import { assembleEcgResult } from "./ecgResultBuilder.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log("  ✓ " + name); pass++; } catch (e) { console.log("  ✗ " + name + "\n      " + e.message); fail++; } };
const assert = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };

// Reconstruct a `reading` exactly like runEcgMicroReading does.
function mkReading({ measured, interpretation, obs, findings = [], ageYears, sex }) {
  const observations = { regular: obs.regular, p_before_each_qrs: obs.p_before_each_qrs, ...obs };
  const pathologyMatch = matchPathologies(featuresFromReading({ measured, interpretation, observations, ageYears, sex }));
  const perception = {
    quality: { is_ecg: true, interpretable: measured.measurable !== false, issues_he: [] },
    calibration: { paper_speed_mm_s: 25, gain_mm_mv: 10, reliable: measured.measurable !== false },
    rhythm: { regular: obs.regular, p_before_each_qrs: obs.p_before_each_qrs },
    morphology: obs,
    findings,
  };
  return { measured, interpretation, perception, pathologyMatch, pathologyBlock: buildPathologyBlock(pathologyMatch) };
}

const KB = [
  { title: "STEMI תחתון (Inferior STEMI)", diagnosis: "Acute Inferior Wall Myocardial Infarction", image_url: "http://x/inf.png" },
  { title: "חסם צרור הולכה שמאלי", diagnosis: "LBBB complete", image_url: "http://x/lbbb.png" },
  { title: "קצב סינוס תקין במבוגר", diagnosis: "Normal Sinus Rhythm", image_url: "http://x/nsr.png" },
  { title: "QT ארוך מולד", diagnosis: "Congenital Long QT Syndrome", image_url: "http://x/lqt.png" },
];

console.log("\nECG Result Builder — end-to-end assembly\n");

t("תרשים תקין → severity normal, ללא ממצא, urgency Normal, מדידות נכונות", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 150, qrs_ms: 90, qt_ms: 360 }, rate: { hr_bpm: 75, rr_ms: 800 }, qtc: { bazett: 402, fridericia: 390 }, axis: { degrees: 45, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס תקין", sinus: true, severity: "normal" }, conduction: { type: "narrow", he: null, discordance_expected: false, severity: "normal" }, interval_warnings: [], summary_he: "בגבולות הנורמה" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [], pr_depression: false, peaked_t_leads: [], u_wave_leads: [] },
    ageYears: 30,
  });
  const r = assembleEcgResult(reading, KB, { sex: "male", fileUrl: "http://x/ecg.png" });
  assert(r.severity === "normal", "severity should be normal, got " + r.severity);
  assert(r.matchedCases.length === 0, "no matched cases for normal, got " + r.matchedCases.map(c=>c.title));
  assert(r.structuredInterpretation.structured.clinical_urgency === "Normal", "urgency Normal");
  assert(r.structuredInterpretation.structured.intervals.qrs_ms === 90, "QRS carried through");
  assert(r.structuredInterpretation.structured.rhythm_and_rate.heart_rate_bpm === 75, "HR carried");
  assert(/בגבולות הנורמה/.test(r.analysis), "analysis states normal");
  assert(r.measurements.length >= 4, "measurements list built");
  assert(/HR 75/.test(r.summary) && /ללא ממצא פתולוגי/.test(r.summary), "informative normal headline: " + r.summary);
});

t("STEMI תחתון → severity urgent, top=STEMI, מותאם לתיק KB עם תמונת-ייחוס, critical_rule_out", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 160, qrs_ms: 95, qt_ms: 380 }, rate: { hr_bpm: 80, rr_ms: 750 }, qtc: { bazett: 438, fridericia: 420 }, axis: { degrees: 60, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס", sinus: true, severity: "normal" }, conduction: { type: "narrow", he: null, discordance_expected: false }, interval_warnings: [], summary_he: "" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [{lead:"II",mm:2},{lead:"III",mm:2.5},{lead:"aVF",mm:2}], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [] },
    findings: [{ label: "עליית ST תחתונה", x: 10, y: 60, width: 30, height: 20 }],
    ageYears: 55,
  });
  const r = assembleEcgResult(reading, KB, { sex: "male", fileUrl: "http://x/ecg.png" });
  assert(r.severity === "urgent", "STEMI → urgent, got " + r.severity);
  assert(/STEMI/i.test(r.summary), "summary mentions STEMI: " + r.summary);
  // Displayed diagnosis is the tool's OWN finding, not a KB case name.
  assert(r.matchedCases[0] && r.matchedCases[0].diagnosis === "STEMI pattern", "chip shows the finding, not a KB name: " + JSON.stringify(r.matchedCases[0]));
  assert(/STEMI/.test(r.matchedCases[0].title), "title is the finding name_he");
  assert(r.matchedCases[0].image_url === "http://x/inf.png", "reference image attached on strong match");
  const cro = r.structuredInterpretation.structured.critical_rule_out;
  assert(cro.some(x => x.pattern_key === "stemi" && x.status === "met"), "STEMI in critical_rule_out");
  assert(r.findings.length === 1, "bounding box carried");
  assert(r.structuredInterpretation.structured.clinical_urgency === "Emergency", "urgency Emergency");
});

t("LBBB + עליית ST → אין STEMI דחוף, יש Sgarbossa+LBBB, severity moderate", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 170, qrs_ms: 140, qt_ms: 420 }, rate: { hr_bpm: 78, rr_ms: 770 }, qtc: { bazett: 478, fridericia: 450 }, axis: { degrees: -20, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס", sinus: true }, conduction: { type: "LBBB", he: "חסם צרור שמאלי (LBBB)", discordance_expected: true, severity: "yellow" }, interval_warnings: [], summary_he: "" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [{lead:"II",mm:2},{lead:"III",mm:2},{lead:"aVF",mm:2}], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [], v1_qrs_pattern: "dominant_s", lateral_broad_notched_r: true },
    ageYears: 60,
  });
  const r = assembleEcgResult(reading, KB, { sex: "female", fileUrl: "http://x/ecg.png" });
  const keys = reading.pathologyMatch.candidates.map(c => c.key);
  assert(!keys.includes("stemi"), "STEMI suppressed under LBBB: " + keys.join(","));
  assert(keys.includes("stemi_in_lbbb_sgarbossa"), "Sgarbossa present");
  assert(keys.includes("lbbb"), "LBBB present");
  assert(r.severity === "moderate", "severity moderate, got " + r.severity);
});

t("QTc 520 → long_qt אדום, severity urgent", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 160, qrs_ms: 90, qt_ms: 520 }, rate: { hr_bpm: 70, rr_ms: 857 }, qtc: { bazett: 520, fridericia: 490 }, axis: { degrees: 40, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס" }, conduction: { type: "narrow" }, interval_warnings: ["QTc מוארך"], summary_he: "" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [] },
    ageYears: 25,
  });
  const r = assembleEcgResult(reading, KB, { sex: "female", fileUrl: "http://x/ecg.png" });
  assert(r.severity === "urgent", "long QT red → urgent, got " + r.severity);
  assert(/QT/i.test(r.summary), "summary mentions QT: " + r.summary);
});

t("תרשים לא-מכויל (measurable:false) → uncertainty high, אך מזהה STEMI ממורפולוגיה", () => {
  const reading = mkReading({
    measured: { measurable: false, intervals: { pr_ms: null, qrs_ms: null, qt_ms: null }, rate: { hr_bpm: null, rr_ms: null }, qtc: { bazett: null, fridericia: null }, axis: { degrees: null, label_he: "לא ניתן לחשב" } },
    interpretation: { rhythm: { rhythm_he: "לא ניתן לקבוע קצב" }, conduction: { type: "unknown" }, interval_warnings: [], summary_he: "" },
    obs: { regular: null, p_before_each_qrs: null, st_elevation_leads: [{lead:"V2",mm:3},{lead:"V3",mm:3},{lead:"V4",mm:2}], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [] },
  });
  const r = assembleEcgResult(reading, KB, { sex: "male", fileUrl: "http://x/ecg.png" });
  assert(r.uncertainty && r.uncertainty.level === "high", "uncertainty high when uncalibrated");
  assert(reading.pathologyMatch.candidates.some(c => c.key === "stemi"), "still detects STEMI from morphology");
  assert(r.severity === "urgent", "morphology STEMI still urgent");
});

t("assembleEcgResult תמיד מחזיר את כל השדות שה-UI צורך", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 150, qrs_ms: 90, qt_ms: 360 }, rate: { hr_bpm: 75, rr_ms: 800 }, qtc: { bazett: 402 }, axis: { degrees: 45, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס תקין" }, conduction: { type: "narrow" }, interval_warnings: [], summary_he: "בגבולות הנורמה" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [] },
    ageYears: 40,
  });
  const r = assembleEcgResult(reading, KB, { sex: "male", fileUrl: "http://x/ecg.png" });
  for (const k of ["summary","severity","analysis","matchedCases","imageUrl","findings","guideline","measurements","ecgInterpretation","structuredInterpretation"]) {
    assert(k in r, "missing field " + k);
  }
  assert(r.structuredInterpretation.structured, "structured nested present");
  assert(r.imageUrl === "http://x/ecg.png", "imageUrl set");
});

t("רגרסיה: HR 77 + גל J מפוקפק → לא מסווג כהיפותרמיה, ואין שם-KB סותר בצ'יפ", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 160, qrs_ms: 92, qt_ms: 380 }, rate: { hr_bpm: 77, rr_ms: 779 }, qtc: { bazett: 430 }, axis: { degrees: 40, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס תקין", sinus: true }, conduction: { type: "narrow" }, interval_warnings: [], summary_he: "" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [], osborn_j_wave: true },
    ageYears: 40,
  });
  const keys = reading.pathologyMatch.candidates.map(c => c.key);
  assert(!keys.includes("hypothermia_osborn"), "HR 77 must NOT trigger hypothermia: " + keys.join(","));
  const r = assembleEcgResult(reading, [{ title: "היפותרמיה", diagnosis: "Bradycardia secondary to Hypothermia", image_url: "http://x/hypo.png" }], { sex: "male", fileUrl: "http://x/e.png" });
  const dEnglish = (r.matchedCases[0]?.diagnosis) || "";
  assert(!/hypothermia/i.test(dEnglish), "no hypothermia KB name leaks into the chip: " + dEnglish);
});

t("התאמת-KB אמינה: LBBB → מצרף תמונת-ייחוס נכונה דרך hints", () => {
  const kb = [
    { title: "קצב סינוס תקין", diagnosis: "Normal Sinus Rhythm", image_url: "http://x/nsr.png" },
    { title: "חסם צרור הולכה שמאלי", diagnosis: "LBBB complete", image_url: "http://x/lbbb.png" },
  ];
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 160, qrs_ms: 145, qt_ms: 420 }, rate: { hr_bpm: 72, rr_ms: 833 }, qtc: { bazett: 460 }, axis: { degrees: -10, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס" }, conduction: { type: "LBBB", he: "חסם צרור שמאלי (LBBB)", discordance_expected: true, severity: "yellow" }, interval_warnings: [], summary_he: "" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [], v1_qrs_pattern: "dominant_s", lateral_broad_notched_r: true },
    ageYears: 60,
  });
  const r = assembleEcgResult(reading, kb, { sex: "male", fileUrl: "http://x/e.png" });
  const lbbbRow = r.matchedCases.find(c => c.title.includes("LBBB"));
  assert(lbbbRow && lbbbRow.image_url === "http://x/lbbb.png", "LBBB reference image attached: " + JSON.stringify(lbbbRow));
});

t("רגרסיה: ממצא דטרמיניסטי מוצג גם כשאין התאמת-KB חזקה (אין תמונה, אבל יש ממצא)", () => {
  const reading = mkReading({
    measured: { measurable: true, intervals: { pr_ms: 240, qrs_ms: 90, qt_ms: 360 }, rate: { hr_bpm: 70, rr_ms: 857 }, qtc: { bazett: 402 }, axis: { degrees: 45, label_he: "ציר תקין" } },
    interpretation: { rhythm: { rhythm_he: "קצב סינוס" }, conduction: { type: "narrow" }, interval_warnings: [], summary_he: "" },
    obs: { regular: true, p_before_each_qrs: true, st_elevation_leads: [], st_depression_leads: [], t_inversion_leads: [], pathological_q_leads: [] },
    ageYears: 50,
  });
  const r = assembleEcgResult(reading, [], { sex: "male", fileUrl: "http://x/e.png" });
  assert(r.matchedCases.some(c => /AV/i.test(c.diagnosis) || /חסם/.test(c.title)), "1st-deg AVB shown as finding");
  assert(r.matchedCases.every(c => c.image_url === undefined), "no KB → no reference image, but finding still present");
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
if (fail > 0) process.exit(1);
