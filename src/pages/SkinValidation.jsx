import React, { useState } from "react";
import { ShieldCheck, Play, AlertTriangle } from "lucide-react";
import { SKIN_SMOKE_CASES, scoreCaseSkin, aggregateSkin } from "@/lib/skinValidation";
import ClinicHeader from "@/components/clinic/ClinicHeader";

/**
 * מנגנון ולידציה — עור. עמוד פיתוח/מנהל.
 * המדד המרכזי שכלי-עור אחרים מסתירים: ביצועים בפילוח לפי גוון-עור
 * (Fitzpatrick I–VI). פער גדול בין עור בהיר לכהה הוא כשל-הוגנות שחייבים
 * לתקן, לא למצע. כל הניקוד בקוד, ללא LLM. המקרים המובנים סינתטיים.
 */

function Metric({ label, value, suffix = "", danger = false }) {
  return (
    <div className={`rounded-lg p-3 border ${danger ? "bg-red-50 border-red-200" : "bg-white border-slate-200"}`}>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${danger ? "text-red-600" : "text-slate-800"}`}>
        {value == null ? "—" : `${value}${suffix}`}
      </p>
    </div>
  );
}

const FITZ_HE = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI" };

export default function SkinValidation() {
  const [agg, setAgg] = useState(null);
  const [rows, setRows] = useState([]);

  const run = () => {
    const results = SKIN_SMOKE_CASES.map((c) => scoreCaseSkin(c.engineOutput, c));
    setRows(results);
    setAgg(aggregateSkin(results));
  };

  return (
    <div dir="rtl" className="clinic-page">
      <ClinicHeader title="מנגנון ולידציה — עור" icon={ShieldCheck} tone="tool" />
      <div className="max-w-3xl mx-auto p-4 space-y-4">

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800 flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          עמוד פיתוח/מנהל. ההרצה המובנית משתמשת ב-<b>מקרי-עשן סינתטיים</b> להוכחת צינור הניקוד הדטרמיניסטי בלבד —
          <b> אינה ביצועים אמיתיים</b>. נתונים מתויגים אמיתיים (סט של רופא/ה או ISIC/PAD-UFES/DDI/Fitzpatrick17k)
          יוזנו דרך <code className="mx-1">runSkinValidation()</code>. כל הניקוד בקוד, ללא LLM.
        </span>
      </div>

      <button
        onClick={run}
        className="inline-flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
      >
        <Play className="w-4 h-4" /> הרץ בדיקת-עשן
      </button>

      {agg && (
        <>
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">ביצועי ממאירות (כולל)</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="רגישות (מלנומה/ממאיר)" value={agg.overall.sensitivity} suffix="%" />
              <Metric label="סגוליות" value={agg.overall.specificity} suffix="%" />
              <Metric label="שיעור-הזיות (FP)" value={agg.overall.hallucination_rate} suffix="%" danger={agg.overall.hallucination_rate > 0} />
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">
              הוגנות לפי גוון-עור (Fitzpatrick) — המדד המרכזי
              {agg.fairness_gap_sensitivity != null && (
                <span className={`mr-2 text-[11px] px-2 py-0.5 rounded-full ${agg.fairness_gap_sensitivity > 10 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                  פער רגישות: {agg.fairness_gap_sensitivity} נק'
                </span>
              )}
            </p>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="text-slate-500 border-b">
                  <th className="text-right py-1">Fitzpatrick</th>
                  <th className="text-right py-1">n</th>
                  <th className="text-right py-1">רגישות</th>
                  <th className="text-right py-1">סגוליות</th>
                  <th className="text-right py-1">הזיות</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(agg.by_fitzpatrick).map(([f, m]) => (
                  <tr key={f} className="border-b border-slate-100">
                    <td className="py-1 font-semibold">{FITZ_HE[f]}</td>
                    <td className="py-1 text-slate-400">{m.n}</td>
                    <td className="py-1">{m.sensitivity == null ? "—" : `${m.sensitivity}%`}</td>
                    <td className="py-1">{m.specificity == null ? "—" : `${m.specificity}%`}</td>
                    <td className={`py-1 ${m.hallucination_rate > 0 ? "text-red-600" : ""}`}>{m.hallucination_rate == null ? "—" : `${m.hallucination_rate}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
              פער רגישות גדול בין גוונים = כשל-הוגנות. יש לאזן נתונים כהי-עור (DDI/Fitzpatrick17k) עד לסגירת הפער.
            </p>
          </div>

          <table className="w-full text-[11px] border-collapse mt-2">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="text-right py-1">מקרה</th>
                <th className="text-right py-1">Fitz</th>
                <th className="text-right py-1">הומצא ממאיר</th>
                <th className="text-right py-1">פוספסה ממאירות</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.case_id} className="border-b border-slate-100">
                  <td className="py-1">{r.case_id}</td>
                  <td className="py-1 text-slate-400">{FITZ_HE[r.fitzpatrick] || "—"}</td>
                  <td className="py-1 text-red-600">{r.hallucinated ? "כן" : "—"}</td>
                  <td className="py-1 text-amber-600">{r.missed ? "כן" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
    </div>
  );
}
