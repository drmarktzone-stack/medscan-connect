import React, { useState } from "react";
import {
  Stethoscope, ChevronDown, ShieldAlert, AlertTriangle, Tag, ListChecks,
  FileText, ThumbsUp, ThumbsDown,
} from "lucide-react";

/**
 * Structured dermatology dashboard. `interpretation` is the engine result:
 *   { structured, warnings, confidence, uncertaintyLevel }
 */

const urgencyConfig = {
  Emergency: { label: "חירום", cls: "bg-red-100 text-red-700 border-red-200" },
  Urgent: { label: "דחוף", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  Normal: { label: "שגרתי", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

function Chips({ items, cls }) {
  const list = (items || []).filter(Boolean);
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((x, i) => (
        <span key={i} className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{x}</span>
      ))}
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-teal-800 mb-1.5 flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {title}
      </p>
      {children}
    </div>
  );
}

export default function SkinInterpretationCard({ interpretation }) {
  const [expanded, setExpanded] = useState(false);
  if (!interpretation || !interpretation.structured) return null;

  const st = interpretation.structured;
  const md = st.image_metadata || {};
  const d = st.dermatological_descriptors || {};
  const warnings = interpretation.warnings || [];
  const confidence = interpretation.confidence;
  const dd = st.differential_diagnoses || [];
  const dermo = interpretation.dermoscopy;
  const allergens = interpretation.suspected_allergens || [];
  const flags = (st.critical_red_flags || []).filter(Boolean);
  const urg = urgencyConfig[st.clinical_urgency] || urgencyConfig.Normal;
  const primaryLesion = (d.primary_lesions || [])[0];

  return (
    <div className="bg-gradient-to-br from-teal-50 to-emerald-50 border border-teal-200 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between p-4 text-right">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-teal-500 flex items-center justify-center shrink-0">
            <Stethoscope className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-teal-900">פענוח דרמטולוגי מובנה</p>
            <p className="text-xs text-teal-700 mt-0.5 truncate">
              {md.anatomical_location || "עור"}{primaryLesion ? ` · ${primaryLesion}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urg.cls}`}>{urg.label}</span>
          {typeof confidence === "number" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-700">{confidence}%</span>
          )}
          <ChevronDown className={`w-4 h-4 text-teal-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
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
        <div className="px-4 pb-4 space-y-4 border-t border-teal-100 pt-3">
          {st.primary_impression && (
            <Section icon={FileText} title="רושם ראשוני">
              <p className="text-xs text-teal-900/80 leading-relaxed">{st.primary_impression}</p>
            </Section>
          )}

          <Section icon={Tag} title="תיאור מורפולוגי">
            <div className="space-y-2">
              {(d.primary_lesions || []).length > 0 && (
                <div><p className="text-[10px] text-slate-500 mb-1">נגעים ראשוניים</p><Chips items={d.primary_lesions} cls="bg-white text-teal-700 border-teal-200" /></div>
              )}
              {(d.secondary_lesions || []).length > 0 && (
                <div><p className="text-[10px] text-slate-500 mb-1">נגעים משניים</p><Chips items={d.secondary_lesions} cls="bg-white text-slate-600 border-slate-200" /></div>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                {d.configuration && <div className="bg-white/60 rounded-md px-2 py-1"><p className="text-[9px] text-slate-400">תצורה</p><p className="text-[11px] text-slate-700">{d.configuration}</p></div>}
                {d.distribution_pattern && <div className="bg-white/60 rounded-md px-2 py-1"><p className="text-[9px] text-slate-400">פיזור</p><p className="text-[11px] text-slate-700">{d.distribution_pattern}</p></div>}
              </div>
              {d.color_and_border && <p className="text-[11px] text-slate-600">צבע/גבול: {d.color_and_border}</p>}
              {(md.estimated_fitzpatrick_type || md.technical_quality) && (
                <p className="text-[10px] text-slate-400">Fitzpatrick: {md.estimated_fitzpatrick_type || "—"} · איכות: {md.technical_quality || "—"}</p>
              )}
            </div>
          </Section>

          {(st.key_findings_summary || []).length > 0 && (
            <Section icon={ListChecks} title="סיכום ממצאים">
              <ul className="space-y-0.5">
                {st.key_findings_summary.map((s, i) => (
                  <li key={i} className="text-[11px] text-slate-600 flex gap-1.5"><span className="text-teal-400">•</span><span>{s}</span></li>
                ))}
              </ul>
            </Section>
          )}

          {dd.length > 0 && (
            <Section icon={Stethoscope} title="אבחנות מבדלות (תומך / שולל)">
              <div className="space-y-1.5">
                {dd.map((x, i) => (
                  <div key={i} className="bg-white/70 rounded-md px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-700">{x.diagnosis}</span>
                      <span className="text-[9px] font-bold text-teal-600">{x.likelihood}</span>
                    </div>
                    {x.supporting_features && (
                      <p className="text-[10px] text-emerald-600 mt-0.5 flex gap-1"><ThumbsUp className="w-2.5 h-2.5 mt-0.5 shrink-0" />{x.supporting_features}</p>
                    )}
                    {x.refuting_features && (
                      <p className="text-[10px] text-red-500 mt-0.5 flex gap-1"><ThumbsDown className="w-2.5 h-2.5 mt-0.5 shrink-0" />{x.refuting_features}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {st.recommended_next_steps && st.recommended_next_steps.length > 0 && (
            <Section icon={ListChecks} title="צעדי המשך מומלצים">
              <ul className="space-y-0.5">
                {st.recommended_next_steps.map((s, i) => (
                  <li key={i} className="text-[11px] text-slate-600 flex gap-1.5"><span className="text-teal-400">•</span><span>{s}</span></li>
                ))}
              </ul>
            </Section>
          )}

          {dermo && (
            <Section icon={Stethoscope} title="ניקוד דרמוסקופי (מחושב בקוד)">
              <div className="text-[11px] text-slate-700 space-y-0.5 bg-white/60 rounded-md px-2 py-1.5">
                <div>7-point checklist: <b>{dermo.seven.score}</b>{dermo.seven.flagged ? <span className="text-red-600"> ⚠️ ≥3</span> : null}</div>
                <div>ABCD-TDS: <b>{dermo.tds.tds}</b> <span className="text-slate-500">({dermo.tds.band})</span></div>
                {dermo.chaos?.excise && <div className="text-red-600">Chaos &amp; Clues → שקילת כריתה</div>}
                <div className="font-semibold">סיכון ממאירות: {dermo.risk.level} — {dermo.risk.referral_he}</div>
                <div className="text-[10px] text-slate-400">{dermo.risk.disclaimer_he}</div>
              </div>
            </Section>
          )}

          {allergens.length > 0 && (
            <Section icon={Tag} title="אלרגנים אפשריים לפי פיזור">
              <div className="text-[11px] text-slate-700">{allergens.flatMap((a) => a.allergens).join(" · ")}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">רלוונטיות קלינית נקבעת ע"י הרופא/ה מול חשיפה בפועל.</div>
            </Section>
          )}

          <p className="text-[10px] text-muted-foreground/70 leading-relaxed pt-1 border-t border-teal-100">
            כלי עזר מבוסס-AI. הערכה צילומית אינה מחליפה מישוש ודרמוסקופיה — חובה אימות ע"י רופא/ה מוסמך/ת.
          </p>
        </div>
      )}
    </div>
  );
}
