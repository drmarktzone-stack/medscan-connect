/**
 * ============================================================================
 *  MedScan AI — Structured ECG Report → PDF (deterministic, no LLM)
 * ============================================================================
 *  Renders the engine's structured output into a clean, RTL Hebrew clinical
 *  report and exports it as an A4 PDF for the patient chart.
 *
 *  Approach: build a self-contained, inline-styled report node off-screen, then
 *  rasterize with html2canvas → jsPDF. Rasterizing the DOM is what lets Hebrew
 *  RTL render correctly without embedding a Hebrew font into jsPDF. A short
 *  English disclaimer line is stamped by jsPDF on EVERY page (default font is
 *  Latin-only, so the Hebrew disclaimer lives inside the rasterized content).
 *
 *  100% deterministic: every value comes from `structured` — no model call.
 * ============================================================================
 */

import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { CRITICAL_RULE_OUT } from "./ecgEngine";

const CRIT_LABEL = Object.fromEntries(CRITICAL_RULE_OUT.map((c) => [c.key, c.label]));

const DISCLAIMER_HE =
  'MedScan הוא כלי תמיכה בהחלטות בלבד. אינו מהווה אבחנה או תחליף לשיקול דעת רפואי. כל החלטה טעונה אימות ע"י רופא/ה מוסמך/ת.';
const DISCLAIMER_EN =
  "MedScan - clinical decision support only. Not a diagnosis. Verify with a licensed physician.";

const URG_HE = { Emergency: "חירום", Urgent: "דחוף", Normal: "תקין" };
const URG_COLOR = { Emergency: "#dc2626", Urgent: "#d97706", Normal: "#059669" };

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function row(label, value) {
  if (value === undefined || value === null || value === "" || value === "—") return "";
  return `<tr><td style="padding:3px 8px;font-weight:700;color:#3730a3;white-space:nowrap;vertical-align:top">${esc(
    label
  )}</td><td style="padding:3px 8px;color:#334155">${esc(value)}</td></tr>`;
}

function section(title, inner) {
  if (!inner) return "";
  return `<div style="margin:10px 0;break-inside:avoid">
    <div style="font-weight:800;color:#312e81;font-size:13px;border-bottom:1px solid #e0e7ff;padding-bottom:3px;margin-bottom:5px">${esc(
      title
    )}</div>${inner}</div>`;
}

function buildReportHtml({ structured, warnings, confidence, uncertaintyLevel, imageUrl, patientRef, model, stamp }) {
  const st = structured || {};
  const iv = st.intervals || {};
  const rr = st.rhythm_and_rate || {};
  const tc = st.technical_check || {};
  const morph = st.wave_and_segment_morphology || {};
  const urg = st.clinical_urgency || "Normal";
  const cro = st.critical_rule_out || [];
  const met = cro.filter((x) => x.status === "met");
  const indet = cro.filter((x) => x.status === "indeterminate");
  const notMet = cro.filter((x) => x.status === "not_met").length;

  const intervalsTable = `<table style="border-collapse:collapse;font-size:12px;width:100%">
    ${row("דופק (HR)", rr.heart_rate_bpm ? `${rr.heart_rate_bpm} bpm` : null)}
    ${row("קצב", rr.rhythm_type)}
    ${row("רגולריות", rr.regularity)}
    ${row("ציר חשמלי", `${st.axis?.degrees !== undefined ? st.axis.degrees + "° " : ""}${st.axis?.interpretation || ""}`.trim())}
    ${row("PR", iv.pr_ms != null ? `${iv.pr_ms} ms` : null)}
    ${row("QRS", iv.qrs_ms != null ? `${iv.qrs_ms} ms` : null)}
    ${row("QT", iv.qt_ms != null ? `${iv.qt_ms} ms` : null)}
    ${row("RR", iv.rr_ms != null ? `${iv.rr_ms} ms` : null)}
    ${row("QTc (Bazett)", iv.qtc_bazett_ms != null ? `${iv.qtc_bazett_ms} ms` : null)}
    ${row("QTc (Fridericia)", iv.qtc_fridericia_ms != null ? `${iv.qtc_fridericia_ms} ms` : null)}
    ${row("סטטוס QTc", iv.qtc_status ? `${iv.qtc_status} (מחושב בקוד)` : null)}
  </table>`;

  const stDev = (st.st_deviations || []).length
    ? `<div style="margin-top:5px;font-size:11px;color:#334155">סטיות ST (מ"מ): ${st.st_deviations
        .map((d) => `${esc(d.lead)} ${esc(d.direction || "")} ${esc(d.mm)}`)
        .join(" · ")}</div>`
    : "";

  const flags = (st.age_normal_flags || []).length
    ? `<ul style="margin:4px 0;padding-inline-start:18px;font-size:11px;color:#b45309">${st.age_normal_flags
        .map((f) => `<li>${esc(typeof f === "string" ? f : f.message_he || JSON.stringify(f))}</li>`)
        .join("")}</ul>`
    : "";

  let croHtml = "";
  if (met.length) {
    croHtml += `<div style="background:#dc2626;color:#fff;border-radius:6px;padding:8px;margin-bottom:6px">
      <div style="font-weight:800;font-size:12px;margin-bottom:3px">🚨 דפוסים מסכני-חיים שזוהו (${met.length})</div>
      <ul style="margin:0;padding-inline-start:18px;font-size:11px">${met
        .map((x) => `<li>${esc(CRIT_LABEL[x.pattern_key] || x.pattern_key)}${x.evidence ? " — " + esc(x.evidence) : ""}${x.leads ? " [" + esc(x.leads) + "]" : ""}</li>`)
        .join("")}</ul></div>`;
  }
  if (indet.length) {
    croHtml += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:8px;margin-bottom:6px;font-size:11px;color:#92400e">
      <b>לא ניתן לשלול (${indet.length}):</b> ${indet.map((x) => esc(CRIT_LABEL[x.pattern_key] || x.pattern_key)).join(", ")}</div>`;
  }
  if (!met.length && !indet.length && notMet) {
    croHtml += `<div style="font-size:11px;color:#059669">✓ כל ${notMet} הדפוסים המסכני-חיים נשללו.</div>`;
  }

  const warnHtml = (warnings || []).length
    ? `<ul style="margin:4px 0;padding-inline-start:18px;font-size:11px;color:#b45309">${warnings
        .map((w) => `<li>${esc(w)}</li>`)
        .join("")}</ul>`
    : "";

  const ddx = (st.differential_diagnoses || []).length
    ? `<div style="font-size:11px;color:#334155">${st.differential_diagnoses.map(esc).join(" · ")}</div>`
    : "";

  const nextSteps = (st.recommended_next_steps || []).length
    ? `<ul style="margin:4px 0;padding-inline-start:18px;font-size:11px;color:#334155">${st.recommended_next_steps
        .map((s) => `<li>${esc(s)}</li>`)
        .join("")}</ul>`
    : "";

  const img = imageUrl
    ? `<img src="${esc(imageUrl)}" crossorigin="anonymous" style="max-width:100%;max-height:220px;border:1px solid #e2e8f0;border-radius:6px;margin-top:6px" />`
    : "";

  const uncHe = uncertaintyLevel === "high" ? "גבוהה" : uncertaintyLevel === "medium" ? "בינונית" : "נמוכה";

  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#1e293b;padding:28px;width:100%;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #4f46e5;padding-bottom:8px;margin-bottom:12px">
      <div>
        <div style="font-size:18px;font-weight:800;color:#312e81">MedScan — דו״ח פענוח ECG</div>
        <div style="font-size:11px;color:#64748b">תמיכה בהחלטות קלינית · לא אבחנה סופית</div>
      </div>
      <div style="text-align:left;font-size:11px;color:#64748b">
        <div>${esc(fmtDate(stamp))}</div>
        <div>מזהה מטופל: ${patientRef ? esc(patientRef) : "—"}</div>
      </div>
    </div>

    <div style="display:flex;gap:10px;align-items:center;margin-bottom:6px">
      <span style="background:${URG_COLOR[urg] || "#059669"};color:#fff;font-weight:800;font-size:12px;padding:3px 12px;border-radius:999px">דחיפות: ${esc(URG_HE[urg] || urg)}</span>
      ${typeof confidence === "number" ? `<span style="font-size:12px;color:#3730a3;font-weight:700">ביטחון מכויל: ${confidence}%</span>` : ""}
      <span style="font-size:11px;color:#64748b">רמת אי-ודאות: ${uncHe}</span>
    </div>
    ${img}

    ${section("מדדים ומרווחים", intervalsTable + stDev)}
    ${flags ? section("חריגות מנורמת גיל/מין", flags) : ""}
    ${section("בדיקה טכנית ומורפולוגיה", `<table style="border-collapse:collapse;font-size:12px;width:100%">
      ${row("איכות תרשים", tc.quality)}
      ${row("מהירות/כיול", `${tc.speed_mm_s ?? 25}mm/s · ${tc.calibration_mm_mv ?? 10}mm/mV`)}
      ${row("מקטע ST", morph.st_segment)}
      ${row("גלי T", morph.t_waves)}
      ${row("גלי Q", morph.q_waves)}
    </table>`)}
    ${croHtml ? section("שלילת דפוסים מסכני-חיים", croHtml) : ""}
    ${ddx ? section("אבחנות מבדלות", ddx) : ""}
    ${warnHtml ? section("בקרת אמינות — אזהרות אנטי-הזיה", warnHtml) : ""}
    ${nextSteps ? section("צעדי המשך מומלצים", nextSteps) : ""}

    <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:8px;font-size:10px;color:#64748b;line-height:1.5">
      ${esc(DISCLAIMER_HE)}<br/>מנוע: ${esc(model || "claude_opus_4_8")} · MedScan CDS
    </div>
  </div>`;
}

/**
 * Build the report and export it as a PDF (triggers a download).
 * @returns {Promise<void>} resolves when saved; rejects on render failure.
 */
export async function exportEcgReportPdf({
  structured,
  warnings = [],
  confidence,
  uncertaintyLevel,
  imageUrl = null,
  patientRef = null,
  model = "claude_opus_4_8",
  filename,
} = {}) {
  if (!structured) throw new Error("No structured ECG data to export.");
  const stamp = new Date();

  const container = document.createElement("div");
  container.setAttribute("dir", "rtl");
  container.style.cssText =
    "position:fixed;left:-99999px;top:0;width:794px;background:#ffffff;z-index:-1;";
  container.innerHTML = buildReportHtml({
    structured,
    warnings,
    confidence,
    uncertaintyLevel,
    imageUrl,
    patientRef,
    model,
    stamp,
  });
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const imgH = (canvas.height * pw) / canvas.width;

    const footer = () => {
      pdf.setFontSize(7);
      pdf.setTextColor(120);
      pdf.text(DISCLAIMER_EN, pw / 2, ph - 5, { align: "center" });
    };

    let heightLeft = imgH;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, pw, imgH);
    footer();
    heightLeft -= ph;
    while (heightLeft > 0) {
      position -= ph;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pw, imgH);
      footer();
      heightLeft -= ph;
    }

    const p = (n) => String(n).padStart(2, "0");
    const dateStr = `${stamp.getFullYear()}${p(stamp.getMonth() + 1)}${p(stamp.getDate())}`;
    pdf.save(filename || `ECG-${patientRef ? patientRef + "-" : ""}${dateStr}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}
