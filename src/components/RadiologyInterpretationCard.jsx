import React, { useState } from "react";
import {
  ScanLine, ChevronDown, ShieldAlert, AlertTriangle, Layers, ListChecks,
  Stethoscope, FileText, CheckCircle2, XCircle, HelpCircle, Ruler,
} from "lucide-react";
import { evaluateMeasurements } from "@/lib/radiologyMeasurements";
import { RADIOLOGY_CRITICAL_LABEL } from "@/lib/radiologyCritical";

/**
 * Structured radiology dashboard. `interpretation` is the engine result:
 *   { structured, warnings, confidence, uncertaintyLevel }
 */

const urgencyConfig = {
  Emergency: { label: "חירום", cls: "bg-red-100 text-red-700 border-red-200" },
  Urgent: { label: "דחוף", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  Normal: { label: "תקין", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

const statusIcon = (status) => {
  if (/abnormal|חריג/i.test(status || "")) return { Icon: XCircle, color: "text-red-500" };
  if (/indeterminate|לא/i.test(status || "")) return { Icon: HelpCircle, color: "text-amber-500" };
  return { Icon: CheckCircle2, color: "text-emerald-500" };
};

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

export default function RadiologyInterpretationCard({ interpretation }) {
  const [expanded, setExpanded] = useState(false);
  if (!interpretation || !interpretation.structured) return null;

  const st = interpretation.structured;
  const md = st.image_metadata || {};
  const warnings = interpretation.warnings || [];
  const confidence = interpretation.confidence;
  const sysF = st.systematic_findings || [];
  const abn = st.key_abnormalities || [];
  const dd = st.differential_diagnoses || [];
  const flags = (st.critical_red_flags || []).filter(Boolean);
  const urg = urgencyConfig[st.clinical_urgency] || urgencyConfig.Normal;
  const measEval = evaluateMeasurements(st.measurements || [], { ageMonths: st.patient_age_months });
  const cro = st.critical_rule_out || [];
  const croMet = cro.filter((x) => x.status === "met");
  const croIndet = cro.filter((x) => x.status === "indeterminate");

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 text-right">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0">
            <ScanLine className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-indigo-900">פענוח רדיולוגי מובנה</p>
            <p className="text-xs text-indigo-700 mt-0.5 truncate">
              {md.modality_detected || "הדמיה"} · {md.anatomical_region || ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urg.cls}`}>{urg.label}</span>
          {typeof confidence === "number" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{confidence}%</span>
          )}
          <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {/* Red-flag banner — always visible */}
      {flags.length > 0 && (
        <div className="mx-4 mb-3 bg-red-600 text-white rounded-lg p-3">
          <p className="text-[11px] font-bold mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> דגלים אדומים קריטיים
          </p>
          <ul className="space-y-0.5">
            {flags.map((f, i) => <li key={i} className="text-[11px] text-white/90">• {f}</li>)}
          </ul>
        </div>
      )}

      {/* Anti-hallucination warnings */}
      {warnings.length > 0 && (
        <div className="mx-4 mb-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[11px] font-bold text-amber-800 mb-1 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" /> בקרת אמינות
          </p>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-800/90 flex gap-1.5"><AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" /><span>{w}</span></li>
            ))}
          </ul>
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-indigo-100 pt-3">
          {st.primary_impression && (
            <Section icon={FileText} title="רושם ראשוני">
              <p className="text-xs text-indigo-900/80 leading-relaxed">{st.primary_impression}</p>
            </Section>
          )}

          <Section icon={ShieldAlert} title="פרטי הבדיקה">
            <p className="text-xs text-slate-600">
              {md.modality_detected || "—"} · {md.anatomical_region || "—"} · איכות: {md.technical_quality || "—"} · ניגוד: {md.contrast_used ? "כן" : "לא/לא ידוע"}
            </p>
          </Section>

          {sysF.length > 0 && (
            <Section icon={Layers} title="סריקה שיטתית לפי אזורים">
              <div className="space-y-1">
                {sysF.map((f, i) => {
                  const { Icon, color } = statusIcon(f.status);
                  return (
                    <div key={i} className="flex items-start gap-2 bg-white/60 rounded-md px-2 py-1.5">
                      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${color}`} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-slate-700">{f.anatomical_zone} <span className="text-slate-400">[{f.status}]</span></p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{f.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {abn.length > 0 && (
            <Section icon={ListChecks} title="אבנורמליות מרכזיות">
              <div className="space-y-1">
                {abn.map((a, i) => (
                  <div key={i} className="bg-white/70 rounded-md px-2 py-1.5">
                    <p className="text-[11px] font-semibold text-slate-700">
                      {a.finding} {a.severity && <span className="text-[9px] text-amber-600">({a.severity})</span>} {a.location && <span className="text-[9px] text-slate-400">@ {a.location}</span>}
                    </p>
                    {a.characteristics && <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{a.characteristics}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {dd.length > 0 && (
            <Section icon={Stethoscope} title="אבחנות מבדלות">
              <div className="space-y-1">
                {dd.map((d, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/60 rounded-md px-2 py-1">
                    <span className="text-[11px] text-slate-700">{d.diagnosis}</span>
                    <span className="text-[9px] font-bold text-indigo-600">{d.likelihood}</span>
                  </div>
                ))}
              </div>
            </Section>
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

          {measEval.length > 0 && (
            <Section icon={Ruler} title="מדידות מול נורמה לגיל (מחושב בקוד)">
              <div className="space-y-1">
                {measEval.map((m, i) => (
                  <div key={i} className={`flex items-center justify-between rounded-md px-2 py-1 ${m.verdict !== "normal" ? "bg-amber-50 border border-amber-200" : "bg-white/60"}`}>
                    <span className="text-[11px] text-slate-700">{m.label_he}: <b>{m.value}{m.unit}</b></span>
                    <span className={`text-[9px] font-bold ${m.verdict === "normal" ? "text-emerald-600" : "text-amber-600"}`}>
                      {m.verdict === "normal" ? "תקין" : m.verdict === "above_normal" ? "מעל נורמה" : m.verdict === "below_normal" ? "מתחת לנורמה" : "—"} ({m.normal[0] ?? ""}–{m.normal[1] ?? ""}{m.unit})
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-[9px] text-slate-400 mt-0.5">מקור: Caffey/OHSU · draft — טעון אימות</div>
            </Section>
          )}

          {(croMet.length > 0 || croIndet.length > 0) && (
            <Section icon={ShieldAlert} title="שלילת דפוסים מסכני-חיים">
              {croMet.length > 0 && (
                <div className="bg-red-600 text-white rounded-lg p-2 mb-1">
                  <p className="text-[11px] font-bold mb-0.5">🚨 זוהו ({croMet.length})</p>
                  <ul className="space-y-0.5">{croMet.map((x, i) => <li key={i} className="text-[10px]">• {RADIOLOGY_CRITICAL_LABEL[x.pattern_key] || x.pattern_key}{x.evidence ? ` — ${x.evidence}` : ""}</li>)}</ul>
                </div>
              )}
              {croIndet.length > 0 && (
                <div className="text-[10px] text-amber-700">לא ניתן לשלול: {croIndet.map((x) => RADIOLOGY_CRITICAL_LABEL[x.pattern_key] || x.pattern_key).join(", ")}</div>
              )}
            </Section>
          )}

          <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1 border-t border-indigo-100">
            כלי עזר מבוסס-AI. חובה אימות ע"י רדיולוג/ית או רופא/ה מוסמך/ת.
          </p>
        </div>
      )}
    </div>
  );
}
