import React, { useState, useEffect } from "react";
import { GitCompare, Loader2, ArrowLeftRight, AlertTriangle, TrendingUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { runEcgComparison } from "@/lib/ecgCompare";
import EmergencyTriageBanner from "@/components/EmergencyTriageBanner";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { createVisionInvokeLLM } from "@/lib/medscan/llmAdapter";

// ⚠ עובר דרך המתאם ולא ישירות ל-SDK — סכמה נכפית,
// הקשר-מהאינטרנט מושבת, ונקודת ניטור אחת.
const invokeComparison = createVisionInvokeLLM({ purpose: "ecg_comparison" });

function parseStructured(a) {
  try {
    const obj = JSON.parse(a.structured_json || "");
    return obj?.structured || null;
  } catch {
    return null;
  }
}

function labelFor(a) {
  const d = a.created_date ? new Date(a.created_date).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "";
  return `${d}${a.patient_ref ? ` · ${a.patient_ref}` : ""}${a.summary ? ` · ${a.summary.slice(0, 40)}` : ""}`;
}

const verdictStyle = {
  new_significant_changes: { cls: "bg-red-50 border-red-200 text-red-700", he: "שינויים מובהקים חדשים" },
  mixed: { cls: "bg-amber-50 border-amber-200 text-amber-700", he: "תמונה מעורבת" },
  improvement_resolution: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", he: "שיפור / היעלמות ממצא" },
  no_significant_change: { cls: "bg-emerald-50 border-emerald-200 text-emerald-700", he: "ללא שינוי מהותי" },
  uninterpretable: { cls: "bg-slate-50 border-slate-200 text-slate-600", he: "לא ניתן להשוות בוודאות" },
};

const sigStyle = {
  critical: "bg-red-100 text-red-700 border-red-200",
  significant: "bg-amber-100 text-amber-700 border-amber-200",
  minor: "bg-slate-100 text-slate-600 border-slate-200",
};

export default function ECGComparison() {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newId, setNewId] = useState("");
  const [priorIds, setPriorIds] = useState(new Set());
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    base44.entities.Analysis.filter({ type: "ecg" }, "-created_date", 100)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows.filter((a) => a.image_url) : [];
        setAnalyses(list);
        if (list.length > 0) setNewId(list[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Auto-suggest priors of the same patient when the "new" changes.
  useEffect(() => {
    const cur = analyses.find((a) => a.id === newId);
    if (!cur) return;
    const next = new Set();
    if (cur.patient_ref) {
      analyses.forEach((a) => {
        if (a.id !== newId && a.patient_ref === cur.patient_ref) next.add(a.id);
      });
    }
    setPriorIds(next);
  }, [newId, analyses]);

  const togglePrior = (id) => {
    setPriorIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toItem = (a) => ({ structured: parseStructured(a), image_url: a.image_url, label: labelFor(a), result: a.result });

  const handleCompare = async () => {
    const newA = analyses.find((a) => a.id === newId);
    const priors = analyses
      .filter((a) => priorIds.has(a.id) && a.id !== newId)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    if (!newA || priors.length === 0) {
      setError("יש לבחור תרשים חדש ולפחות תרשים קודם אחד להשוואה.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await runEcgComparison({
        newItem: toItem(newA),
        priorItems: priors.map(toItem),
        invokeLLM: invokeComparison,
        language: "he",
      });
      setResult(res);
    } catch (err) {
      setError(err.message || "ההשוואה נכשלה.");
    } finally {
      setRunning(false);
    }
  };

  const llm = result?.llm;
  const det = result?.deterministic;
  const vStyle = llm ? (verdictStyle[llm.overall_verdict] || verdictStyle.uninterpretable) : null;

  return (
    <div className="clinic-page">
      <ClinicHeader title="השוואת א.ק.ג" icon={GitCompare} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : analyses.length < 2 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            נדרשים לפחות שני ניתוחי ECG בהיסטוריה כדי להשוות. בצע/י ניתוחי ECG (עדיף עם "מזהה מטופל" זהה) וחזור/י לכאן.
          </div>
        ) : (
          <>
            {/* New ECG */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <label className="text-sm font-bold text-foreground mb-2 block">התרשים החדש</label>
              <select
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {analyses.map((a) => (
                  <option key={a.id} value={a.id}>{labelFor(a)}</option>
                ))}
              </select>
            </div>

            {/* Prior ECGs */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <label className="text-sm font-bold text-foreground mb-2 block">תרשימים קודמים להשוואה</label>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {analyses.filter((a) => a.id !== newId).map((a) => (
                  <label key={a.id} className="flex items-start gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={priorIds.has(a.id)} onChange={() => togglePrior(a.id)} className="mt-0.5" />
                    <span className="text-xs text-slate-700 leading-relaxed">
                      {labelFor(a)}
                      {!parseStructured(a) && <span className="text-[10px] text-amber-600"> · ללא נתונים מובנים</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <button
              onClick={handleCompare}
              disabled={running}
              className="w-full h-12 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {running ? <><Loader2 className="w-4 h-4 animate-spin" /> משווה...</> : <><ArrowLeftRight className="w-4 h-4" /> השווה</>}
            </button>

            {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>}

            {result && (
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm space-y-4">
                <EmergencyTriageBanner severity={null} urgency={result.urgency} />

                {/* Verdict */}
                {llm && (
                  <div className={`rounded-xl border p-4 ${vStyle.cls}`}>
                    <p className="text-xs font-bold mb-1">{vStyle.he}</p>
                    <p className="text-sm">{llm.verdict_he}</p>
                    {llm.comparison_possible === false && (
                      <p className="text-[11px] mt-1 opacity-80">⚠️ ההשוואה מוגבלת (נתונים/תמונות חלקיים) — יש לאמת ידנית.</p>
                    )}
                  </div>
                )}

                {/* New dangerous */}
                {det?.newCritical?.length > 0 && (
                  <div className="bg-red-600 text-white rounded-lg p-3">
                    <p className="text-[11px] font-bold mb-1 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> דפוסים מסכני-חיים חדשים</p>
                    <ul className="space-y-0.5">{det.newCritical.map((x, i) => <li key={i} className="text-[11px]">• {x}</li>)}</ul>
                  </div>
                )}

                {/* Deterministic delta */}
                {det && (
                  <div>
                    <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><TrendingUp className="w-4 h-4 text-blue-500" /> שינויים מדודים (מחושב בקוד)</h4>
                    {det.changes.length > 0 ? (
                      <div className="space-y-1">
                        {det.changes.map((c, i) => (
                          <div key={i} className={`text-[11px] rounded-md px-2 py-1.5 border ${sigStyle[c.significance] || sigStyle.minor}`}>{c.note_he}</div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">לא זוהו שינויי מרווח/קצב/ציר מובהקים.</p>
                    )}
                    {det.resolvedCritical?.length > 0 && (
                      <p className="text-[11px] text-emerald-600 mt-1.5">נעלמו: {det.resolvedCritical.join(", ")}</p>
                    )}
                    {det.comparable === false && (
                      <p className="text-[10px] text-amber-600 mt-1">לתרשים הקודם אין נתונים מובנים — הדלתא המדוד חלקי.</p>
                    )}
                  </div>
                )}

                {/* LLM changes */}
                {llm?.changes?.length > 0 && (
                  <div>
                    <h4 className="text-sm font-bold mb-2">שינויים שזוהו (ניתוח)</h4>
                    <div className="space-y-1.5">
                      {llm.changes.map((c, i) => (
                        <div key={i} className="bg-slate-50 rounded-md px-2 py-1.5">
                          <p className="text-[11px] font-semibold text-slate-700">
                            {c.category ? `[${c.category}] ` : ""}{c.description_he}
                            <span className={`ml-1 text-[9px] px-1.5 py-0.5 rounded-full border ${sigStyle[c.significance] || sigStyle.minor}`}>{c.significance}</span>
                          </p>
                          {(c.from_he || c.to_he) && <p className="text-[10px] text-slate-500 mt-0.5">{c.from_he || "—"} → {c.to_he || "—"}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {llm?.new_dangerous_findings?.length > 0 && (
                  <p className="text-[11px] text-red-600"><b>חדש ומסוכן:</b> {llm.new_dangerous_findings.join("، ")}</p>
                )}
                {llm?.resolved_findings?.length > 0 && (
                  <p className="text-[11px] text-emerald-600"><b>נפתר:</b> {llm.resolved_findings.join("، ")}</p>
                )}
                {llm?.clinical_significance_he && (
                  <div className="bg-primary/5 border border-primary/15 rounded-xl p-3">
                    <p className="text-[11px] font-bold text-primary mb-1">משמעות קלינית</p>
                    <p className="text-xs text-foreground/85 leading-relaxed">{llm.clinical_significance_he}</p>
                  </div>
                )}
                {llm?.recommended_next_steps_he?.length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-700 mb-1">צעדי המשך</h4>
                    <ul className="space-y-0.5">{llm.recommended_next_steps_he.map((s, i) => <li key={i} className="text-[11px] text-slate-600 flex gap-1.5"><span className="text-blue-400">•</span>{s}</li>)}</ul>
                  </div>
                )}

                {/* Images side by side */}
                <div>
                  <h4 className="text-[11px] font-bold text-slate-700 mb-1.5">תמונות (חדש מול קודמים)</h4>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    <figure className="shrink-0 w-40">
                      <img src={result.newImage} alt="new" className="w-40 h-28 object-cover rounded-lg border-2 border-blue-400" />
                      <figcaption className="text-[10px] text-blue-600 text-center mt-1">חדש</figcaption>
                    </figure>
                    {result.priorImages.map((u, i) => (
                      <figure key={i} className="shrink-0 w-40">
                        <img src={u} alt={`prior ${i + 1}`} className="w-40 h-28 object-cover rounded-lg border border-slate-200" />
                        <figcaption className="text-[10px] text-slate-500 text-center mt-1">קודם {i + 1}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground/70 text-center leading-relaxed border-t border-slate-100 pt-3">
                  {llm?.disclaimer_he || "MedScan הוא כלי תמיכה בהחלטות בלבד. אינו תחליף לשיקול דעת רפואי."}
                </p>
              </div>
            )}
          </>
        )}

        <DisclaimerBanner />
      </div>
    </div>
  );
}
