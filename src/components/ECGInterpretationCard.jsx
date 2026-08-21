import React, { useState } from "react";
import {
  Brain, ShieldAlert, AlertTriangle, Ruler, Heart, Zap, Waves,
  Activity, ListChecks, Stethoscope, FileText, Download,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CRITICAL_RULE_OUT } from "@/lib/ecgEngine";

const CRIT_LABEL = Object.fromEntries(CRITICAL_RULE_OUT.map((c) => [c.key, c.label]));

/**
 * ECG structured dashboard (per engine spec Part 3).
 * `interpretation` is the engine result:
 *   { structured, warnings, confidence, uncertaintyLevel }
 * Header bar (Rate / Rhythm / Axis / Urgency) + tabbed clinical breakdown.
 */

const urgencyConfig = {
  Emergency: { label: "חירום", cls: "bg-red-100 text-red-700 border-red-200" },
  Urgent: { label: "דחוף", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  Normal: { label: "תקין", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

function Row({ label, value }) {
  if (value === undefined || value === null || value === "" || value === "—") return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="font-semibold text-indigo-700 shrink-0 min-w-[92px]">{label}</span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-indigo-800 mb-1.5 flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {title}
      </p>
      {children}
    </div>
  );
}

function HeaderStat({ label, value }) {
  return (
    <div className="text-center px-2 py-1 rounded-lg bg-white/70 min-w-0">
      <p className="text-[9px] text-indigo-400 uppercase tracking-wide truncate">{label}</p>
      <p className="text-[11px] font-bold text-indigo-900 truncate">{value ?? "—"}</p>
    </div>
  );
}

export default function ECGInterpretationCard({ interpretation }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  if (!interpretation || !interpretation.structured) return null;

  const st = interpretation.structured;
  const warnings = interpretation.warnings || [];
  const confidence = interpretation.confidence;
  const iv = st.intervals || {};
  const rr = st.rhythm_and_rate || {};
  const tc = st.technical_check || {};
  const morph = st.wave_and_segment_morphology || {};
  const hyp = st.hypertrophy_and_enlargement || {};
  const evidence = st.finding_evidence || [];
  const primary = (st.primary_findings || []).filter(Boolean);
  const urg = urgencyConfig[st.clinical_urgency] || urgencyConfig.Normal;
  const boolHe = (b) => (b ? "כן" : "לא");

  const handleExportPdf = async () => {
    try {
      setPdfBusy(true);
      const { exportEcgReportPdf } = await import("@/lib/ecgReportPdf");
      await exportEcgReportPdf({
        structured: st,
        warnings,
        confidence,
        uncertaintyLevel: interpretation.uncertaintyLevel,
        imageUrl: interpretation.imageUrl,
        patientRef: interpretation.patientRef,
      });
    } catch (e) {
      alert("יצירת ה-PDF נכשלה: " + (e?.message || e));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="p-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 flex-1 min-w-0">
          <HeaderStat label="דופק" value={rr.heart_rate_bpm ? `${rr.heart_rate_bpm}` : "—"} />
          <HeaderStat label="קצב" value={rr.rhythm_type} />
          <HeaderStat label="ציר" value={st.axis?.interpretation} />
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urg.cls}`}>{urg.label}</span>
          {typeof confidence === "number" && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{confidence}%</span>
          )}
          <button
            onClick={handleExportPdf}
            disabled={pdfBusy}
            title="ייצוא דו״ח PDF"
            className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1 disabled:opacity-50"
          >
            <Download className="w-3 h-3" /> {pdfBusy ? "..." : "PDF"}
          </button>
        </div>
      </div>

      {/* Anti-hallucination warnings — always visible */}
      {warnings.length > 0 && (
        <div className="mx-3 mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[11px] font-bold text-amber-800 mb-1 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> בקרת אמינות — שים לב
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-800/90 leading-relaxed flex gap-1.5">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-3 pb-3">
        <Tabs defaultValue="steps">
          <TabsList className="grid grid-cols-3 w-full rounded-lg h-8">
            <TabsTrigger value="steps" className="text-[11px] rounded-md">7 שלבים</TabsTrigger>
            <TabsTrigger value="primary" className="text-[11px] rounded-md">אבחנה ראשית</TabsTrigger>
            <TabsTrigger value="ddx" className="text-[11px] rounded-md">מבדלת ודגלים</TabsTrigger>
          </TabsList>

          {/* Tab 1 — 7-step analysis */}
          <TabsContent value="steps" className="mt-3 space-y-4">
            <Section icon={ShieldAlert} title="1. בדיקה טכנית וכיול">
              <div className="space-y-1">
                <Row label="איכות" value={tc.quality} />
                <Row label="מהירות נייר" value={tc.speed_mm_s ? `${tc.speed_mm_s} mm/s` : null} />
                <Row label="כיול" value={tc.calibration_mm_mv ? `${tc.calibration_mm_mv} mm/mV` : null} />
                <Row label="ארטיפקטים" value={tc.artifacts} />
              </div>
            </Section>

            <Section icon={Heart} title="2. קצב וריתמוס">
              <div className="space-y-1">
                <Row label="דופק" value={rr.heart_rate_bpm ? `${rr.heart_rate_bpm} bpm` : null} />
                <Row label="קצב" value={rr.rhythm_type} />
                <Row label="רגולריות" value={rr.regularity} />
                <Row label="גל P" value={rr.p_wave_present === undefined ? null : boolHe(rr.p_wave_present)} />
                <Row label="יחס P:QRS" value={rr.p_qrs_relationship} />
              </div>
            </Section>

            {(st.axis?.degrees !== undefined || st.axis?.interpretation) && (
              <Section icon={Zap} title="3. ציר חשמלי">
                <Row label="ציר QRS" value={`${st.axis?.degrees !== undefined ? st.axis.degrees + "° " : ""}${st.axis?.interpretation || ""}`.trim()} />
              </Section>
            )}

            <Section icon={Ruler} title="4. מרווחים ומתחים">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  ["PR", iv.pr_ms, "תקין 120–200ms"],
                  ["QRS", iv.qrs_ms, "תקין <120ms"],
                  ["QT", iv.qt_ms, "נמדד מתחילת QRS לסוף גל T"],
                  ["RR", iv.rr_ms, "מרווח בין פעימות — בסיס לחישוב QTc"],
                  ["QTc Bazett", iv.qtc_bazett_ms, "QTc = QT / שורש(RR בשניות)"],
                  ["QTc Fridericia", iv.qtc_fridericia_ms, "QTc = QT / (RR בשניות)^(1/3)"],
                ].map(([k, v, tip]) =>
                  v !== undefined && v !== null ? (
                    <div key={k} className="bg-white/60 rounded-md px-2 py-1" title={tip}>
                      <p className="text-[10px] font-semibold text-indigo-700">{k}</p>
                      <p className="text-[11px] text-slate-700">{v} ms</p>
                    </div>
                  ) : null
                )}
              </div>
              {iv.qtc_status && (
                <p className="text-[10px] text-slate-500 mt-1.5">סטטוס QTc: <span className="font-semibold">{iv.qtc_status}</span> (מחושב בקוד)</p>
              )}
              {(st.st_deviations || []).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-slate-400 mb-1">סטיות ST מדודות (מ"מ)</p>
                  <div className="flex flex-wrap gap-1">
                    {st.st_deviations.map((d, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${/elev|הגבה/i.test(d.direction || "") ? "bg-red-50 text-red-600 border-red-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>{d.lead}: {d.mm}מ"מ {d.direction || ""}</span>
                    ))}
                  </div>
                </div>
              )}
            </Section>

            <Section icon={Activity} title="5. היפרטרופיה והגדלה">
              <div className="space-y-1">
                <Row label="LVH" value={hyp.lvh_present === undefined ? null : boolHe(hyp.lvh_present)} />
                <Row label="RVH" value={hyp.rvh_present === undefined ? null : boolHe(hyp.rvh_present)} />
                <Row label="הגדלת עליות" value={hyp.atrial_enlargement} />
              </div>
            </Section>

            <Section icon={Waves} title="6. מורפולוגיה — ST / T / Q">
              <div className="space-y-1">
                <Row label="מקטע ST" value={morph.st_segment} />
                <Row label="גלי T" value={morph.t_waves} />
                <Row label="גלי Q" value={morph.q_waves} />
              </div>
            </Section>
          </TabsContent>

          {/* Tab 2 — primary diagnosis */}
          <TabsContent value="primary" className="mt-3 space-y-4">
            {st.reasoning && (
              <Section icon={FileText} title="נימוק על בסיס מדידות">
                <p className="text-xs text-indigo-900/80 leading-relaxed">{st.reasoning}</p>
              </Section>
            )}

            {primary.length > 0 ? (
              <Section icon={ListChecks} title="ממצאים עיקריים וראיות">
                <div className="space-y-1.5">
                  {primary.map((f, i) => {
                    const ev = evidence.find((e) => e.finding === f || (e.finding && (f.includes(e.finding) || e.finding.includes(f))));
                    const unproven = (st.unevidenced_findings || []).includes(f);
                    return (
                      <div key={i} className={`rounded-md px-2 py-1.5 ${unproven ? "bg-amber-50 border border-amber-200" : "bg-white/70"}`}>
                        <p className="text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                          {f}
                          {unproven && <span className="text-[9px] text-amber-600">(לא מבוסס)</span>}
                        </p>
                        {ev && <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">↳ {ev.evidence}{ev.leads ? ` [${ev.leads}]` : ""}</p>}
                      </div>
                    );
                  })}
                </div>
              </Section>
            ) : (
              <p className="text-xs text-slate-500">לא זוהו ממצאים עיקריים ספציפיים.</p>
            )}

            {st.recommended_next_steps && st.recommended_next_steps.length > 0 && (
              <Section icon={ListChecks} title="צעדי המשך מומלצים">
                <ul className="space-y-0.5">
                  {st.recommended_next_steps.map((s, i) => (
                    <li key={i} className="text-[11px] text-slate-600 flex gap-1.5"><span className="text-indigo-400">•</span><span>{s}</span></li>
                  ))}
                </ul>
              </Section>
            )}
          </TabsContent>

          {/* Tab 3 — differential & red flags */}
          <TabsContent value="ddx" className="mt-3 space-y-4">
            <div className={`rounded-lg p-3 border ${urg.cls}`}>
              <p className="text-[11px] font-bold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> דרגת דחיפות: {urg.label}
              </p>
            </div>

            {(() => {
              const cro = st.critical_rule_out || [];
              const met = cro.filter((x) => x.status === "met");
              const indet = cro.filter((x) => x.status === "indeterminate");
              const notMet = cro.filter((x) => x.status === "not_met").length;
              if (cro.length === 0) return null;
              return (
                <Section icon={ShieldAlert} title="שלילת דפוסים מסכני-חיים">
                  {met.length > 0 && (
                    <div className="mb-2 bg-red-600 text-white rounded-lg p-2.5">
                      <p className="text-[11px] font-bold mb-1">🚨 זוהו ({met.length})</p>
                      <ul className="space-y-1">
                        {met.map((x, i) => (
                          <li key={i} className="text-[11px]">• {CRIT_LABEL[x.pattern_key] || x.pattern_key}{x.evidence ? ` — ${x.evidence}` : ""}{x.leads ? ` [${x.leads}]` : ""}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {indet.length > 0 && (
                    <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      <p className="text-[11px] font-bold text-amber-800 mb-1">לא ניתן לשלול ({indet.length})</p>
                      <div className="flex flex-wrap gap-1">
                        {indet.map((x, i) => (
                          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white text-amber-700 border border-amber-200">{CRIT_LABEL[x.pattern_key] || x.pattern_key}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {met.length === 0 && indet.length === 0 && (
                    <p className="text-[11px] text-emerald-600">✓ כל {notMet} הדפוסים המסכני-חיים נשללו.</p>
                  )}
                </Section>
              );
            })()}

            {st.differential_diagnoses && st.differential_diagnoses.length > 0 ? (
              <Section icon={Stethoscope} title="אבחנות מבדלות">
                <div className="flex flex-wrap gap-1">
                  {st.differential_diagnoses.map((d, i) => (
                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-slate-600 border border-indigo-100">{d}</span>
                  ))}
                </div>
              </Section>
            ) : (
              <p className="text-xs text-slate-500">לא צוינו אבחנות מבדלות.</p>
            )}

            {warnings.length > 0 && (
              <Section icon={ShieldAlert} title="דגלים / אזהרות בקרה">
                <ul className="space-y-1">
                  {warnings.map((w, i) => (
                    <li key={i} className="text-[11px] text-amber-700 flex gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span>{w}</span></li>
                  ))}
                </ul>
              </Section>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
