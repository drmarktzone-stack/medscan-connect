/**
 * בדיקות למנוע המדידה הדטרמיניסטי — כל מספר קליני מחושב מקואורדינטות+כיול,
 * לא מהערכת מודל. אלה החישובים שאסור להם לטעות.
 */
import assert from "node:assert";
import {
  msPerPx, mvPerPx, computeIntervals, heartRate, qtc, qrsAxis, interpretAxis, runMicroMeasure,
} from "./ecgMicroMeasure.js";

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); } };

console.log("\nECG Micro-Measure (deterministic)\n");

t("כיול: 10px/משבצת ב-25mm/s ⇒ 4ms/px", () => {
  assert.strictEqual(msPerPx({ small_box_px: 10, paper_speed_mm_s: 25 }), 4);
});
t("כיול 50mm/s ⇒ חצי מהזמן לפיקסל", () => {
  assert.strictEqual(msPerPx({ small_box_px: 10, paper_speed_mm_s: 50 }), 2);
});
t("כיול חסר ⇒ null (אין ניחוש)", () => {
  assert.strictEqual(msPerPx({ small_box_px: 0 }), null);
});
t("mV/px: 10px/משבצת ב-10mm/mV ⇒ 0.01mV/px", () => {
  assert.ok(Math.abs(mvPerPx({ small_box_px: 10, gain_mm_mv: 10 }) - 0.01) < 1e-9);
});

t("מרווחים: PR/QRS/QT מחושבים נכון מפיקסלים", () => {
  const iv = computeIntervals(
    { p_onset_x: 0, qrs_onset_x: 40, qrs_offset_x: 65, t_offset_x: 150 }, 4
  );
  assert.strictEqual(iv.pr_ms, 160);  // |40-0|*4
  assert.strictEqual(iv.qrs_ms, 100); // |65-40|*4
  assert.strictEqual(iv.qt_ms, 440);  // |150-40|*4
});
t("מרווח עם נקודה חסרה ⇒ null, לא אפס", () => {
  const iv = computeIntervals({ qrs_onset_x: 40, qrs_offset_x: 65 }, 4);
  assert.strictEqual(iv.pr_ms, null);
  assert.strictEqual(iv.qrs_ms, 100);
});

t("קצב: R–R 200px ב-4ms/px ⇒ 800ms ⇒ 75bpm", () => {
  const r = heartRate(200, 4);
  assert.strictEqual(r.rr_ms, 800);
  assert.strictEqual(r.hr_bpm, 75);
});

t("QTc: Bazett ו-Fridericia מחושבים", () => {
  const q = qtc({ qt_ms: 440, rr_ms: 800 });
  assert.strictEqual(q.bazett, 492);     // 440/sqrt(0.8)
  assert.strictEqual(q.fridericia, 474); // 440/cbrt(0.8)
});

t("ציר: I=+8, aVF=+4 ⇒ ~27° תקין", () => {
  const d = qrsAxis(8, 4);
  assert.ok(d >= 26 && d <= 27);
  assert.strictEqual(interpretAxis(d).category, "normal");
});
t("ציר: I שלילי, aVF חיובי ⇒ RAD", () => {
  assert.strictEqual(interpretAxis(qrsAxis(-6, 6)).category, "RAD");
});
t("ציר: I חיובי, aVF שלילי חזק ⇒ LAD", () => {
  assert.strictEqual(interpretAxis(qrsAxis(6, -6)).category, "LAD");
});

t("צנרת מלאה: מדידה שלמה מ-perception", () => {
  const out = runMicroMeasure({
    calibration: { small_box_px: 10, paper_speed_mm_s: 25, gain_mm_mv: 10, reliable: true },
    fiducials: { p_onset_x: 0, qrs_onset_x: 40, qrs_offset_x: 65, t_offset_x: 150, rr_px: 200 },
    leadNet: { net_I_mm: 8, net_aVF_mm: 4 },
  });
  assert.strictEqual(out.measurable, true);
  assert.strictEqual(out.intervals.pr_ms, 160);
  assert.strictEqual(out.rate.hr_bpm, 75);
  assert.strictEqual(out.qtc.bazett, 492);
  assert.strictEqual(out.axis.category, "normal");
});

t("צנרת ללא כיול: measurable=false, שום מספר מומצא", () => {
  const out = runMicroMeasure({ calibration: {}, fiducials: { qrs_onset_x: 40, qrs_offset_x: 65 } });
  assert.strictEqual(out.measurable, false);
  assert.strictEqual(out.intervals.qrs_ms, null);
  assert.ok(out.notes.length > 0);
});

console.log(`\n  ${pass} עברו, ${fail} נכשלו\n`);
process.exit(fail > 0 ? 1 : 0);
