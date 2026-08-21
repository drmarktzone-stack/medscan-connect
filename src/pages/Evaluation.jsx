import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Activity, Stethoscope, Loader2, Trash2, Play, TrendingUp, Target, ImageOff, Flag, ScanLine, AlertTriangle, Inbox, PlusCircle, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { base44 } from "@/api/base44Client";
import { runEvaluation } from "@/lib/evaluation";
import GoldStandardForm from "@/components/evaluation/GoldStandardForm";
import MetricsChart from "@/components/evaluation/MetricsChart";
import BulkImport from "@/components/knowledge/BulkImport";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { computeCalibration } from "@/lib/calibration";
import { runRedTeamSuite } from "@/lib/redTeamSuite";
import { useI18n } from "@/lib/i18n";

export default function Evaluation() {
  const { t } = useI18n();
  const [tab, setTab] = useState("ecg");
  const [goldCases, setGoldCases] = useState([]);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [liveResults, setLiveResults] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [promoted, setPromoted] = useState(new Set());
  const [redTeam, setRedTeam] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [gold, testRuns, feedback] = await Promise.all([
        base44.entities.GoldStandardCase.filter({ type: tab }),
        base44.entities.TestRun.filter({ type: tab }, "-created_date", 50),
        base44.entities.Feedback.filter({ analysis_type: tab, is_correct: false }, "-created_date", 50).catch(() => []),
      ]);
      setGoldCases(gold);
      setRuns(testRuns);
      setFeedbackItems(feedback || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [tab]);

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setLiveResults([]);
    setLastResult(null);
    setProgress({ done: 0, total: 0 });
    try {
      const result = await runEvaluation({
        type: tab,
        onProgress: (done, total) => setProgress({ done, total }),
        onUpdate: setLiveResults,
      });
      setLastResult(result);
      loadData();
    } catch (err) {
      setError(err.message || t("eval.error"));
    } finally {
      setRunning(false);
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.GoldStandardCase.delete(id);
    loadData();
  };

  // Closed feedback loop: promote a user correction into a labeled gold-standard test case.
  const handlePromote = async (fb) => {
    try {
      let image_url = "";
      if (fb.analysis_id) {
        try {
          const a = await base44.entities.Analysis.get(fb.analysis_id);
          image_url = a?.image_url || "";
        } catch { /* image optional */ }
      }
      await base44.entities.GoldStandardCase.create({
        type: tab,
        title: (fb.corrected_diagnosis || "תיקון משתמש").slice(0, 60),
        correct_diagnosis: fb.corrected_diagnosis || "",
        description: fb.notes || "נוצר מתיקון משתמש (משוב)",
        image_url,
      });
      setPromoted((p) => new Set(p).add(fb.id));
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const testableCount = goldCases.filter((c) => c.image_url).length;

  // Deterministic confidence-calibration from the just-completed run (no LLM).
  const calibration = React.useMemo(() => {
    if (!liveResults.length) return null;
    return computeCalibration(
      liveResults
        .filter((r) => Number.isFinite(Number(r.confidence)) && typeof r.is_correct === "boolean")
        .map((r) => ({ confidence: Number(r.confidence), correct: r.is_correct }))
    );
  }, [liveResults]);

  return (
    <div className="clinic-page">
      <ClinicHeader title={t("eval.title")} icon={Target} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-3 w-full rounded-xl">
            <TabsTrigger value="ecg" className="rounded-xl"><Activity className="w-4 h-4 ml-1.5" /> {t("eval.tab_ecg")}</TabsTrigger>
            <TabsTrigger value="skin" className="rounded-xl"><Stethoscope className="w-4 h-4 ml-1.5" /> {t("eval.tab_skin")}</TabsTrigger>
            <TabsTrigger value="radiology" className="rounded-xl"><ScanLine className="w-4 h-4 ml-1.5" /> {t("eval.tab_radiology")}</TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" /> בדיקת מעקות (Red-Team)</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">מוודא ששערי-הבטיחות מסרבים/מסלימים כנדרש. דטרמיניסטי, ללא LLM.</p>
                </div>
                <button onClick={() => setRedTeam(runRedTeamSuite())}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-semibold">
                  <ShieldCheck className="w-4 h-4" /> הרץ
                </button>
              </div>
              {redTeam && (
                <div className={`rounded-lg p-3 ${redTeam.all_guards_ok ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
                  <p className={`text-sm font-bold ${redTeam.all_guards_ok ? "text-emerald-700" : "text-red-700"}`}>
                    {redTeam.all_guards_ok ? "✓ כל המעקות תקינים" : `⚠ ${redTeam.failed_count} פרצות בגבול-הבטיחות`} · {redTeam.passed}/{redTeam.total} ({redTeam.pass_rate}%)
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Object.entries(redTeam.by_domain).map(([d, s]) => (
                      <span key={d} className={`text-[10px] px-2 py-0.5 rounded-full ${s.passed === s.total ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{d}: {s.passed}/{s.total}</span>
                    ))}
                  </div>
                  {redTeam.failures.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {redTeam.failures.map((f) => (
                        <p key={f.id} className="text-[11px] text-red-700">✗ {f.description_he} — {f.detail_he}</p>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">{redTeam.note_he}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Link to="/ecg-validate" className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" /> ולידציה ECG
              </Link>
              <Link to="/skin-validate" className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-[11px] font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" /> ולידציה עור (הוגנות)
              </Link>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold">{t("eval.run")}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("eval.testable", { n: testableCount, m: goldCases.length })}</p>
                </div>
                <button onClick={handleRun} disabled={running || testableCount === 0}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-purple-600 text-white text-sm font-semibold disabled:opacity-50">
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {running ? t("eval.running") : t("eval.run_btn")}
                </button>
              </div>

              {running && (
                <div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5 text-center">{t("eval.analyzing", { n: progress.done, m: progress.total })}</p>
                </div>
              )}

              {error && <p className="text-xs text-red-500 text-center">{error}</p>}

              {testableCount === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    לא ניתן להפעיל הערכה: אין מקרי זהב עם תמונה. הוסף תמונה לכל מקרה זהב (או צור מקרים חדשים עם תמונה) — הערכה דורשת תמונות מתויגות כדי למדוד דיוק, רגישות ושיעור הזיות. אפשר גם לקדם תיקוני משתמשים לסט הזהב (למטה).
                  </p>
                </div>
              )}
            </div>

            {lastResult && (
              <div className="bg-white rounded-xl border border-purple-200 p-4">
                <h4 className="text-sm font-bold mb-3">{t("eval.last_result")}</h4>
                <div className="grid grid-cols-2 gap-2">
                  <MetricCard label={t("eval.accuracy")} value={lastResult.accuracy} color="text-blue-600" />
                  <MetricCard label={t("eval.sensitivity")} value={lastResult.sensitivity} color="text-red-600" />
                  <MetricCard label={t("eval.specificity")} value={lastResult.specificity} color="text-teal-600" />
                  <MetricCard label="שיעור הזיות" value={lastResult.hallucination_rate ?? 0} color={(lastResult.hallucination_rate ?? 0) > 15 ? "text-red-600" : "text-amber-600"} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 text-center leading-relaxed">שיעור הזיות = אחוז המקרים שבהם האבחון שגוי אך הוצג בביטחון גבוה (≥70%). ככל שנמוך יותר — טוב יותר.</p>
                <p className="text-xs text-muted-foreground mt-2 text-center">{t("eval.correct_count", { n: lastResult.correct, m: lastResult.total })}</p>
              </div>
            )}

            {calibration && calibration.n > 0 && (
              <div className="bg-white rounded-xl border border-indigo-200 p-4">
                <h4 className="text-sm font-bold mb-1">כיול ביטחון (Calibration)</h4>
                <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">
                  האם ה-% שהמערכת מציגה אמין? משווה ביטחון מוצהר מול דיוק בפועל על {calibration.n} מקרים. מחושב בקוד, ללא LLM.
                </p>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <MetricCard label="ECE (שגיאת כיול)" value={calibration.ece} color={calibration.ece > 15 ? "text-red-600" : "text-indigo-600"} />
                  <MetricCard label="MCE (מקסימלית)" value={calibration.mce} color={calibration.mce > 25 ? "text-red-600" : "text-indigo-600"} />
                  <div className="text-center bg-slate-50 rounded-lg py-2">
                    <p className="text-2xl font-extrabold text-slate-700">{calibration.brier}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Brier</p>
                  </div>
                </div>
                <div className={`text-[11px] rounded-lg p-2 leading-relaxed ${calibration.verdict === "overconfident" ? "bg-red-50 text-red-700" : calibration.verdict === "underconfident" ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700"}`}>
                  {calibration.verdict_he} (ביטחון ממוצע {calibration.avg_confidence}% · דיוק בפועל {calibration.accuracy}%)
                </div>
                {calibration.reliability?.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {calibration.reliability.map((b, i) => (
                      <div key={i} className="flex items-center gap-2 text-[10px]">
                        <span className="w-16 shrink-0 text-muted-foreground">{b.range}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full ${b.gap > 15 ? "bg-red-400" : "bg-indigo-400"}`} style={{ width: `${b.accuracy}%` }} />
                        </div>
                        <span className="w-24 shrink-0 text-left text-muted-foreground">דיוק {b.accuracy}% (n={b.count})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {liveResults.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="text-sm font-bold mb-2">{t("eval.live")}</h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {liveResults.map((r, i) => (
                    <div key={i} className={`text-xs rounded-lg p-2 flex items-center justify-between ${r.is_correct ? "bg-green-50" : "bg-red-50"}`}>
                      <span className="font-semibold truncate">{r.title}</span>
                      <span className={`shrink-0 mr-2 ${r.is_correct ? "text-green-600" : "text-red-600"}`}>
                        {r.is_correct ? t("eval.correct") : t("eval.incorrect")} ({r.confidence}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-500" /> {t("eval.trends")}
              </h4>
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
              ) : (
                <MetricsChart runs={runs} />
              )}
            </div>

            <div>
              <h4 className="text-sm font-bold text-foreground mb-2">{t("eval.gold_set", { n: goldCases.length })}</h4>
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-muted-foreground animate-spin" /></div>
              ) : goldCases.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">{t("eval.gold_empty")}</p>
              ) : (
                <div className="space-y-2">
                  {goldCases.map((c) => (
                    <div key={c.id} className={`bg-white rounded-lg border p-3 flex items-start gap-2 ${c.urgent ? "border-red-200" : "border-slate-200"}`}>
                      <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center shrink-0">
                        {c.image_url ? <img src={c.image_url} alt={c.title} className="w-full h-full object-cover" /> : <ImageOff className="w-4 h-4 text-muted-foreground/30" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold truncate">{c.title}</p>
                          {c.urgent && <Flag className="w-3 h-3 text-red-500 fill-current shrink-0" />}
                          {!c.image_url && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">{t("eval.no_image")}</span>}
                        </div>
                        <p className="text-[11px] text-primary font-medium">{c.correct_diagnosis}</p>
                      </div>
                      <button onClick={() => handleDelete(c.id)} className="text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {feedbackItems.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <Inbox className="w-4 h-4 text-purple-500" /> תיקוני משתמשים ({feedbackItems.length})
                </h4>
                <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed">
                  תיקונים שדיווחו משתמשים כאשר האבחון היה שגוי. קדם אותם לסט הזהב כדי להפוך אותם למקרי בדיקה מתויגים (סגירת לולאת המשוב).
                </p>
                <div className="space-y-2">
                  {feedbackItems.map((fb) => (
                    <div key={fb.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground truncate">{fb.corrected_diagnosis || "(ללא אבחנה מתוקנת)"}</p>
                        {fb.notes && <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{fb.notes}</p>}
                      </div>
                      <button
                        onClick={() => handlePromote(fb)}
                        disabled={promoted.has(fb.id) || !fb.corrected_diagnosis}
                        className="flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 disabled:opacity-50 shrink-0"
                      >
                        <PlusCircle className="w-3.5 h-3.5" />
                        {promoted.has(fb.id) ? "נוסף" : "לסט הזהב"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-sm font-bold text-foreground mb-2">{t("eval.add_gold")}</h4>
              <GoldStandardForm type={tab} onSaved={loadData} />
            </div>

            <div>
              <h4 className="text-sm font-bold text-foreground mb-2">{t("eval.bulk_gold")}</h4>
              <BulkImport type={tab} target="gold" onSaved={loadData} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div className="text-center bg-slate-50 rounded-lg py-2">
      <p className={`text-2xl font-extrabold ${color}`}>{value}%</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}