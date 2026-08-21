import React, { useState, useEffect } from "react";
import { GitBranch, Loader2, ShieldCheck, AlertTriangle, ChevronLeft, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import GroundedInterpretation from "@/components/GroundedInterpretation";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { runProtocolStep } from "@/lib/medscan/engines/protocolRunner";
import { listProtocols } from "@/lib/medscan/llmAdapter";

export default function ProtocolRunner() {
  const [protocols, setProtocols] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState(null);
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState("years");
  const [weight, setWeight] = useState("");
  const [stepId, setStepId] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listProtocols()
      .then(setProtocols)
      .catch(() => setProtocols([]))
      .finally(() => setLoadingList(false));
  }, []);

  const verified = protocols.filter((p) => p.verification_status === "verified");
  const unverified = protocols.filter((p) => p.verification_status !== "verified");

  const runStep = async (targetStepId) => {
    setLoading(true);
    setError(null);
    try {
      const patient = {
        [ageUnit === "days" ? "age_days" : ageUnit === "months" ? "age_months" : "age_years"]:
          Number(ageValue),
        weight_kg: weight ? Number(weight) : undefined,
      };
      const res = await runProtocolStep({
        protocolKey: selected.protocol_key,
        patient,
        currentStepId: targetStepId,
      });
      setResult(res);
      setStepId(targetStepId);
    } catch (e) {
      console.error(e);
      setError(e.message || "אירעה שגיאה בהרצת הפרוטוקול.");
    } finally {
      setLoading(false);
    }
  };

  const start = () => { setHistory([]); runStep(null); };

  const goToBranch = (nextId) => {
    setHistory((h) => [...h, stepId]);
    runStep(nextId);
  };

  const goBack = () => {
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    runStep(prev ?? null);
  };

  return (
    <div className="clinic-page">
      <ClinicHeader title="הרצת פרוטוקול" icon={GitBranch} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        <div className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
          <p>
            הפרוטוקול הוא <strong>נתון מובנה</strong> — הניווט בעץ נעשה בקוד.
            מנוע הנימוק מסביר את השלב בלבד; הוא אינו בורא צעדים ואינו מחשב מינון.
          </p>
          <p className="text-amber-700">
            ⚠ בסתירה בין הפרוטוקול המחלקתי / משרד הבריאות לבין נלסון —
            <strong> הפרוטוקול המקומי גובר</strong>.
          </p>
        </div>

        {/* בחירת פרוטוקול */}
        {!selected && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <h3 className="text-sm font-bold">בחר פרוטוקול</h3>

            {loadingList && (
              <div className="flex items-center gap-2 text-xs text-slate-500 py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> טוען…
              </div>
            )}

            {!loadingList && protocols.length === 0 && (
              <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 leading-relaxed">
                אין פרוטוקולים במערכת. יש להוסיף רשומות לישות <code>Protocol</code>,
                לאמת אותן מול הפרוטוקול המחלקתי, ורק אז ניתן להריץ.
              </div>
            )}

            {verified.map((p) => (
              <button
                key={p.protocol_key}
                onClick={() => setSelected(p)}
                className="w-full text-right rounded-xl border border-slate-200 hover:border-sky-300 p-3 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{p.title_he}</span>
                  <span className="text-[10px] text-slate-400">{p.step_count} שלבים</span>
                </div>
                {p.entry_criteria_he?.length > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    קריטריוני כניסה: {p.entry_criteria_he.join(", ")}
                  </p>
                )}
              </button>
            ))}

            {unverified.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 mb-2">
                  פרוטוקולים שאינם מאומתים — לא ניתנים להרצה
                </p>
                {unverified.map((p) => (
                  <div key={p.protocol_key} className="flex items-center gap-2 py-1.5 opacity-60">
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs text-slate-600">{p.title_he}</span>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                  פרוטוקול קליני לא-מאומת אינו רץ. יש לאמת אותו מול הפרוטוקול המחלקתי.
                </p>
              </div>
            )}
          </div>
        )}

        {/* פרטי מטופל + התחלה */}
        {selected && !result && (
          <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">{selected.title_he}</h3>
              <button onClick={() => setSelected(null)} className="text-[11px] text-sky-600">
                החלף
              </button>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">
                גיל <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <Input type="number" inputMode="numeric" value={ageValue}
                  onChange={(e) => setAgeValue(e.target.value)} className="flex-1" />
                <select value={ageUnit} onChange={(e) => setAgeUnit(e.target.value)}
                  className="rounded-md border border-slate-200 text-sm px-2 bg-white">
                  <option value="years">שנים</option>
                  <option value="months">חודשים</option>
                  <option value="days">ימים</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-slate-500 block mb-1">משקל (ק"ג)</label>
              <Input type="number" inputMode="decimal" value={weight}
                onChange={(e) => setWeight(e.target.value)} />
              <p className="text-[10px] text-slate-400 mt-1">
                נדרש למחשבונים. בלעדיו הם יסרבו לחשב — והסירוב יוצג לך.
              </p>
            </div>

            <Button onClick={start} disabled={!ageValue || loading}
              className="w-full h-11 rounded-xl text-sm font-semibold bg-sky-600 hover:bg-sky-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "התחל פרוטוקול"}
            </Button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

        {result?.status === "protocol_error" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800">לא ניתן להריץ</p>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">{result.message_he}</p>
          </div>
        )}

        {/* השלב */}
        {result && result.status !== "protocol_error" && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-sky-600" />
                <div>
                  <h3 className="font-bold text-sm">{result.protocol?.title_he}</h3>
                  <p className="text-[11px] text-slate-500">
                    שלב: {result.step_from_protocol?.title_he}
                  </p>
                </div>
              </div>
              {history.length > 0 && (
                <button onClick={goBack} className="flex items-center gap-1 text-[11px] text-sky-600">
                  <ChevronLeft className="w-3.5 h-3.5" /> אחורה
                </button>
              )}
            </div>

            {result.protocol?.local_protocol_ref && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p className="text-[11px] text-amber-900 leading-relaxed">
                  פרוטוקול מקומי: <strong>{result.protocol.local_protocol_ref}</strong> —
                  בסתירה, הוא גובר על נלסון.
                </p>
              </div>
            )}

            {/* הפעולות — מהפרוטוקול, לא מהמודל */}
            {result.step_from_protocol?.actions_he?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">פעולות בשלב זה</h4>
                <ul className="space-y-1.5">
                  {result.step_from_protocol.actions_he.map((a, i) => (
                    <li key={i} className="text-xs text-slate-700 leading-relaxed flex gap-2">
                      <span className="text-sky-500 font-bold shrink-0">{i + 1}.</span>
                      <span>{a}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  הפעולות מוצגות כפי שהן בפרוטוקול. מנוע הנימוק אינו רשאי להוסיף להן.
                </p>
              </div>
            )}

            {result.calculator_refusals?.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <h4 className="text-[11px] font-bold text-amber-800 mb-1">ערכים שלא חושבו</h4>
                <ul className="space-y-1">
                  {result.calculator_refusals.map((r, i) => (
                    <li key={i} className="text-[11px] text-amber-900 leading-snug">· {r.message_he}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.broken_branches?.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <h4 className="text-[11px] font-bold text-red-800 mb-1">פגם בפרוטוקול</h4>
                <p className="text-[11px] text-red-900 leading-relaxed">
                  הסתעפויות שמפנות לשלב שאינו קיים:{" "}
                  {result.broken_branches.map((b) => b.next_step_id).join(", ")}.
                  יש לתקן את רשומת הפרוטוקול.
                </p>
              </div>
            )}

            {/* הסתעפויות — בחירת הרופא/ה */}
            {result.branch_options_from_protocol?.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2">המשך לפי המצב הקליני</h4>
                <div className="space-y-2">
                  {result.branch_options_from_protocol.map((b, i) => (
                    <button
                      key={i}
                      onClick={() => goToBranch(b.next_step_id)}
                      disabled={!b.exists || loading}
                      className="w-full text-right rounded-lg border border-slate-200 hover:border-sky-300 disabled:opacity-40 p-2.5 text-xs transition-colors"
                    >
                      {b.condition_he}
                      {!b.exists && <span className="text-red-500"> (שלב חסר)</span>}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  ההכרעה בין הענפים היא שלך. הכלי מציג את התנאים ואינו בוחר עבורך.
                </p>
              </div>
            )}

            <GroundedInterpretation data={result} />
          </div>
        )}

        <DisclaimerBanner />
      </div>
    </div>
  );
}
