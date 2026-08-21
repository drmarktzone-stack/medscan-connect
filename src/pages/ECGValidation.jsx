import React, { useState } from "react";
import { ShieldCheck, Play, AlertTriangle } from "lucide-react";
import { SMOKE_CASES, scoreCase, aggregate } from "@/lib/ecgValidation";
import ClinicHeader from "@/components/clinic/ClinicHeader";

/**
 * ECG Validation Harness — DEV/ADMIN page.
 * Measures the engine's accuracy + HALLUCINATION RATE against labeled cases.
 * The built-in run uses synthetic SMOKE_CASES to prove the (deterministic)
 * scoring pipeline — it is NOT real performance. Real labeled ECGs (physician
 * set or an open set such as PTB-XL) plug into runValidationSuite().
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

export default function ECGValidation() {
  const [agg, setAgg] = useState(null);
  const [rows, setRows] = useState([]);

  const run = () => {
    const results = SMOKE_CASES.map((c) => scoreCase(c.engineOutput, c));
    setRows(results);
    setAgg(aggregate(results));
  };

  return (
    <div dir="rtl" className="clinic-page">
      <ClinicHeader title="מנגנון ולידציה — ECG" icon={ShieldCheck} tone="tool" />
      <div className="max-w-3xl mx-auto p-4 space-y-4">

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800 flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <span>
          עמוד פיתוח/מנהל. ההרצה המובנית משתמשת ב-<b>מקרי-עשן סינתטיים</b> להוכחת צינור הניקוד הדטרמיניסטי בלבד —
          <b> אינה ביצועים אמיתיים</b>. נתונים מתויגים אמיתיים (סט של רופא/ה או PTB-XL) יוזנו דרך
          <code className="mx-1">runValidationSuite()</code>. כל הניקוד בקוד, ללא LLM.
        </span>
      </div>

      <button
        onClick={run}
        className="inline-flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-semibold"
      >
        <Play className="w-4 h-4" /> הרץ בדיקת-עשן
      </button>

      {agg && (
        <>
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">שיעור-הזיות (המדד המרכזי)</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="הזיות ברמת מקרה" value={agg.hallucination.case_rate} suffix="%" danger={agg.hallucination.case_rate > 0} />
              <Metric label="הזיות ברמת טענה" value={agg.hallucination.assertion_rate} suffix="%" danger={agg.hallucination.assertion_rate > 0} />
              <Metric label="מקרים עם המצאה" value={agg.hallucination.cases_with_hallucination} />
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">דפוסים מסכני-חיים</p>
            <div className="grid grid-cols-4 gap-2">
              <Metric label="רגישות" value={agg.critical_patterns.sensitivity} suffix="%" />
              <Metric label="סגוליות" value={agg.critical_patterns.specificity} suffix="%" />
              <Metric label="PPV" value={agg.critical_patterns.ppv} suffix="%" />
              <Metric label="NPV" value={agg.critical_patterns.npv} suffix="%" />
            </div>
          </div>

          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">דיוק מדידה (MAE) ו-abstain</p>
            <div className="grid grid-cols-4 gap-2">
              <Metric label="HR MAE" value={agg.interval_mae.hr} suffix=" bpm" />
              <Metric label="QRS MAE" value={agg.interval_mae.qrs} suffix=" ms" />
              <Metric label="QTc MAE" value={agg.interval_mae.qtc} suffix=" ms" />
              <Metric label="שיעור abstain" value={agg.abstain.rate} suffix="%" />
            </div>
          </div>

          <div className="text-[11px] text-slate-500">
            נבדקו {agg.n_cases} מקרים · confusion (דפוסים קריטיים): TP {agg.critical_patterns.confusion.TP} · FP{" "}
            {agg.critical_patterns.confusion.FP} · FN {agg.critical_patterns.confusion.FN} · TN{" "}
            {agg.critical_patterns.confusion.TN}
          </div>

          <table className="w-full text-[11px] border-collapse mt-2">
            <thead>
              <tr className="text-slate-500 border-b">
                <th className="text-right py-1">מקרה</th>
                <th className="text-right py-1">מקור</th>
                <th className="text-right py-1">הומצא</th>
                <th className="text-right py-1">פוספס</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.case_id} className="border-b border-slate-100">
                  <td className="py-1">{r.case_id}</td>
                  <td className="py-1 text-slate-400">{r.source}</td>
                  <td className="py-1 text-red-600">{r.hallucinated.join(", ") || "—"}</td>
                  <td className="py-1 text-amber-600">{r.missed.join(", ") || "—"}</td>
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
