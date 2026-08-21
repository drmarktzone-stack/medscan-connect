import React, { useState, useEffect } from "react";
import { Activity, Loader2, BookOpen, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { runDiagnosisPipeline } from "@/lib/analysisPipeline";
import { runEcgFastAnalysis } from "@/lib/medscan/engines/ecgFastPipeline";
import ImageUploader from "@/components/ImageUploader";
import ClinicalContextForm from "@/components/ClinicalContextForm";
import ExamFindingsInput, { ECG_EXAM_FIELDS } from "@/components/ExamFindingsInput";
import PediatricToggle from "@/components/PediatricToggle";
import AnalysisResult from "@/components/AnalysisResult";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import GroundedInterpretation from "@/components/GroundedInterpretation";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { useI18n } from "@/lib/i18n";
import { runGroundedVisionInterpretation } from "@/lib/medscan/engines/visionGrounded";
import { downscaleImageFile } from "@/lib/imageOptimize";
import { runEcgComparison } from "@/lib/ecgCompare";
import { createVisionInvokeLLM } from "@/lib/medscan/llmAdapter";
import { runEcgMicroReading, buildMeasuredBlock } from "@/lib/medscan/engines/ecgPerception";

export default function ECGAnalysis() {
  const { t, lang } = useI18n();
  const [files, setFiles] = useState([]);
  const [uploadedUrls, setUploadedUrls] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState(null);
  const [grounded, setGrounded] = useState(null);
  const [groundedLoading, setGroundedLoading] = useState(false);
  const [error, setError] = useState(null);
  const [kbCount, setKbCount] = useState(0);
  const [clinicalContext, setClinicalContext] = useState("");
  const [examFindings, setExamFindings] = useState("");
  const [pediatric, setPediatric] = useState(false);
  const [patientMeta, setPatientMeta] = useState({});
  const [priorFiles, setPriorFiles] = useState([]);
  const [priorUrls, setPriorUrls] = useState([]);
  const [priorUploading, setPriorUploading] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [microReading, setMicroReading] = useState(null);
  const [microLoading, setMicroLoading] = useState(false);

  const updateUploadedUrls = (urls) => {
    setUploadedUrls(urls);
    if (urls.length > 0) {
      sessionStorage.setItem("ecg_file_urls", JSON.stringify(urls));
    } else {
      sessionStorage.removeItem("ecg_file_urls");
    }
  };

  useEffect(() => {
    const saved = sessionStorage.getItem("ecg_file_urls");
    if (saved) {
      try {
        const urls = JSON.parse(saved);
        if (Array.isArray(urls) && urls.length > 0) setUploadedUrls(urls);
      } catch {}
    }
    base44.entities.ECGCase.list("-created_date", 500).then((cases) => setKbCount(cases.length)).catch(() => {});
  }, []);

  const handleFilesChange = async (newFiles) => {
    setFiles(newFiles);
    setResult(null);
    setGrounded(null);
    setError(null);
    updateUploadedUrls([]);

    if (newFiles.length > 0) {
      setUploading(true);
      try {
        // הקטנה למהירות + סיבוב אוטומטי של תרשים מצולם לאורך → לרוחב, לפני העלאה.
        const urls = await Promise.all(
          newFiles.map(async (f) => {
            const optimized = await downscaleImageFile(f, { autoLandscape: true });
            return base44.integrations.Core.UploadFile({ file: optimized });
          })
        );
        const fileUrls = urls.map((r) => r.file_url);
        updateUploadedUrls(fileUrls);
      } catch (err) {
        console.error("Upload failed", err);
      } finally {
        setUploading(false);
      }
    }
  };

  const handlePriorChange = async (newFiles) => {
    setPriorFiles(newFiles);
    setComparison(null);
    if (newFiles.length > 0) {
      setPriorUploading(true);
      try {
        const urls = await Promise.all(
          newFiles.map(async (f) => {
            const optimized = await downscaleImageFile(f, { autoLandscape: true });
            return base44.integrations.Core.UploadFile({ file: optimized });
          })
        );
        setPriorUrls(urls.map((r) => r.file_url));
      } catch (err) {
        console.error("prior upload failed", err);
      } finally {
        setPriorUploading(false);
      }
    } else {
      setPriorUrls([]);
    }
  };

  const handleAnalyze = async () => {
    if (uploadedUrls.length === 0 && files.length === 0) return;
    setLoading(true);
    setError(null);
    setComparison(null);
    setMicroReading(null);
    try {
      const fullContext = [clinicalContext, examFindings].filter(Boolean).join("\n");

      // ⚡ צינור-אק"ג מהיר: קריאת-תפיסה אחת בלבד, ואז כל הפענוח מחושב בקוד
      // (מדידות → יסודות → התאמת-פתולוגיות מול קריטריונים → השוואה למאגר).
      // מחליף את הצינור הרב-קריאתי הישן (3-4 קריאות Opus טוריות ≈ 5 דקות).
      setMicroLoading(true);
      const res = await runEcgFastAnalysis({
        files,
        preUploadedUrls: uploadedUrls,
        clinicalContext: fullContext,
        language: lang,
        patientAgeYears: patientMeta.age ? Number(patientMeta.age) : undefined,
        patientSex: patientMeta.sex || undefined,
        patientRef: patientMeta.patient_ref || undefined,
        onStage: setStage,
      });
      setResult(res);
      if (res.microReading) setMicroReading(res.microReading);
      setMicroLoading(false);

      // הצינור הישן והפרשנות המעוגנת נשמרים בקוד אך אינם בשימוש במסלול-האק"ג המהיר.
      void runDiagnosisPipeline;
      void runGroundedVisionInterpretation;
      void createVisionInvokeLLM;
      void runEcgMicroReading;
      void buildMeasuredBlock;

      // השוואה לתרשים קודם — רץ אחרי שהפענוח הוצג, ורק אם הועלה תרשים קודם.
      if (priorUrls.length > 0 && res?.imageUrl) {
        setComparisonLoading(true);
        const invokeCompare = createVisionInvokeLLM({ purpose: "ecg_compare" });
        runEcgComparison({
          newItem: { structured: res.structuredInterpretation?.structured || null, image_url: res.imageUrl, label: "נוכחי" },
          priorItems: priorUrls.map((u, i) => ({ structured: null, image_url: u, label: `קודם ${i + 1}` })),
          invokeLLM: invokeCompare,
          language: lang,
        })
          .then(setComparison)
          .catch((e) => { console.error("ecg comparison failed", e); setComparison(null); })
          .finally(() => setComparisonLoading(false));
      }
      sessionStorage.removeItem("ecg_file_urls");
    } catch (err) {
      console.error(err);
      setError(err.message || t("analysis.error_fallback"));
    } finally {
      setLoading(false);
      setMicroLoading(false);
      setStage("");
    }
  };

  const stageLabels = {
    extracting: t("analysis.stage_extracting"),
    matching: t("analysis.stage_matching"),
    interpreting: t("analysis.stage_interpreting"),
    verifying: t("analysis.stage_verifying"),
    diagnosing: t("analysis.stage_diagnosing"),
  };
  const stageLabel = stageLabels[stage] || t("analysis.stage_diagnosing");

  return (
    <div className="clinic-page">
      <ClinicHeader title={t("analysis.ecg_title")} icon={Activity} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {kbCount > 0 && (
          <Link to="/knowledge-base" className="flex items-center gap-2 text-xs text-primary bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
            <BookOpen className="w-4 h-4" />
            {t("analysis.ecg_kb_link", { n: kbCount })}
          </Link>
        )}

        <ImageUploader
          files={files}
          onFilesChange={handleFilesChange}
          label={t("analysis.ecg_upload_label")}
          hint={t("analysis.ecg_upload_hint")}
          imageUrls={uploadedUrls}
          onImageUrlsChange={updateUploadedUrls}
        />

        {(files.length > 0 || uploadedUrls.length > 0) && !result && (
          <>
            <ClinicalContextForm onChange={setClinicalContext} onMeta={setPatientMeta} />
            <ExamFindingsInput onChange={setExamFindings} fields={ECG_EXAM_FIELDS} title="הקשר קליני (תסמינים/תרופות/אלקטרוליטים)" />
            <PediatricToggle value={pediatric} onChange={setPediatric} />

            <Button
              onClick={handleAnalyze}
              disabled={loading || uploading}
              className="w-full h-12 rounded-xl text-sm font-semibold shadow-md shadow-primary/20"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  מעלה תמונות...
                </span>
              ) : loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {stageLabel}
                </span>
              ) : (
                t("analysis.ecg_button")
              )}
            </Button>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <AnalysisResult
              result={result.analysis}
              severity={result.severity}
              summary={result.summary}
              matchedCases={result.matchedCases}
              imageUrl={result.imageUrl}
              findings={result.findings}
              uncertainty={result.uncertainty}
              guideline={result.guideline}
              ecgInterpretation={result.ecgInterpretation}
              structuredInterpretation={result.structuredInterpretation}
              analysisId={result.analysisId}
              analysisType="ecg"
              numericIntegrity={result.numericIntegrity}
            />
          </div>
        )}

        {microLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> מודד מקטעים בקוד (מנוע דטרמיניסטי)…
          </div>
        )}

        {microReading?.measured?.measurable && (() => {
          const m = microReading.measured;
          const cells = [
            { k: "HR", v: m.rate?.hr_bpm != null ? `${m.rate.hr_bpm}` : "—", u: "bpm" },
            { k: "PR", v: m.intervals?.pr_ms != null ? `${m.intervals.pr_ms}` : "—", u: "ms" },
            { k: "QRS", v: m.intervals?.qrs_ms != null ? `${m.intervals.qrs_ms}` : "—", u: "ms" },
            { k: "QT", v: m.intervals?.qt_ms != null ? `${m.intervals.qt_ms}` : "—", u: "ms" },
            { k: "QTc", v: m.qtc?.bazett != null ? `${m.qtc.bazett}` : "—", u: "ms" },
            { k: "ציר", v: m.axis?.degrees != null ? `${m.axis.degrees}°` : "—", u: m.axis?.label_he || "" },
          ];
          return (
            <div className="bg-white rounded-2xl border border-teal-200 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-slate-100">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <div>
                  <h3 className="font-bold text-sm">מדידות מחושבות (מנוע דטרמיניסטי)</h3>
                  <p className="text-[11px] text-slate-500">חושבו מקואורדינטות+כיול — לא הוערכו מהעין</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {cells.map((c, i) => (
                  <div key={i} className="bg-slate-50 rounded-lg px-2 py-2 text-center">
                    <div className="text-[10px] text-slate-500">{c.k}</div>
                    <div className="text-lg font-extrabold text-slate-800 leading-tight">{c.v}</div>
                    <div className="text-[10px] text-slate-400 truncate">{c.u}</div>
                  </div>
                ))}
              </div>
              {microReading.interpretation && (
                <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                  {microReading.interpretation.rhythm?.rhythm_he && (
                    <div className="text-sm font-bold text-slate-800">קצב: {microReading.interpretation.rhythm.rhythm_he}</div>
                  )}
                  {microReading.interpretation.conduction?.he && (
                    <div className="text-sm font-bold text-slate-800">
                      הולכה: {microReading.interpretation.conduction.he}
                      {microReading.interpretation.conduction.discordance_expected && (
                        <span className="block text-[11px] font-normal text-amber-700 mt-0.5">
                          ⚠ בנוכחות חסם צרור צפויה discordance מתאים — ספי-STEMI הרגילים אינם תקפים; להערכת איסכמיה יש להשתמש בקריטריוני Sgarbossa.
                        </span>
                      )}
                    </div>
                  )}
                  {(microReading.interpretation.morphology || []).map((f, i) => (
                    <div key={i} className={`rounded-lg px-3 py-2 text-xs border ${f.severity === "urgent" ? "bg-red-50 text-red-800 border-red-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
                      <span className="font-semibold">{f.finding_he}</span> — {f.meaning_he}
                    </div>
                  ))}
                  {(microReading.interpretation.interval_warnings || []).map((w, i) => (
                    <div key={`w${i}`} className="text-[11px] text-amber-700">• {w}</div>
                  ))}
                  {(microReading.pathologyMatch?.candidates || []).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <div className="text-[11px] font-bold text-slate-600 mb-1">דפוסים שקריטריוניהם התקיימו (מנוע דטרמיניסטי):</div>
                      {microReading.pathologyMatch.candidates.slice(0, 6).map((c, i) => (
                        <div key={`p${i}`} className={`rounded-lg px-3 py-2 text-xs border mb-1 ${c.severity === "red" ? "bg-red-50 text-red-800 border-red-200" : c.severity === "normal" ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
                          <span className="font-semibold">{c.name_he}</span>
                          <span className="opacity-70"> — {c.criteria.map((x) => `${x.ok === false ? "✗" : x.ok === null ? "?" : "✓"} ${x.text}`).join(" · ")}</span>
                          {c.note_he && <span className="block text-[10.5px] opacity-80 mt-0.5">{c.note_he}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-500">{microReading.interpretation.summary_he}</div>
                </div>
              )}
              {Array.isArray(m.notes) && m.notes.length > 0 && (
                <ul className="mt-3 space-y-1 text-[11px] text-amber-700">
                  {m.notes.map((n, i) => <li key={i}>• {n}</li>)}
                </ul>
              )}
            </div>
          );
        })()}

        {microReading && microReading.measured && microReading.measured.measurable === false && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            לא ניתן למדוד בקוד: כיול או נקודות-ציון לא זוהו בביטחון. צלם עם רשת ברורה וכיול 25mm/s. {(microReading.measured.notes || []).join(" ")}
          </div>
        )}

        {groundedLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            מריץ אימות עיגון על הפרשנות…
          </div>
        )}

        {grounded && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
              <div>
                <h3 className="font-bold text-sm">פרשנות מעוגנת</h3>
                <p className="text-[11px] text-slate-500">עברה אימות מול בסיס הידע המאומת</p>
              </div>
            </div>
            <GroundedInterpretation data={grounded} />
          </div>
        )}

        {/* שונבה השוואת-אק"ג (תרשים קודם) הוסרה מהממשק לפי בקשה. */}
        {false && comparisonLoading && (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500 py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> משווה מול התרשים הקודם…
          </div>
        )}

        {false && comparison && (() => {
          const llm = comparison.llm || {};
          const urg = comparison.urgency || llm.urgency || "Normal";
          const urgColor = urg === "Emergency" ? "bg-red-100 text-red-700" : urg === "Urgent" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
          const urgLabel = urg === "Emergency" ? "חירום" : urg === "Urgent" ? "דחוף" : "יציב";
          return (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-500" /><h3 className="font-bold text-sm">השוואה לתרשים קודם</h3></div>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${urgColor}`}>{urgLabel}</span>
              </div>
              {llm.verdict_he && <p className="text-sm font-semibold mb-3">{llm.verdict_he}</p>}
              {Array.isArray(llm.new_dangerous_findings) && llm.new_dangerous_findings.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-3">
                  <p className="text-xs font-bold text-red-700 mb-1">⚠ ממצאים מסוכנים חדשים</p>
                  <ul className="list-disc pr-4 text-xs text-red-800 space-y-0.5">{llm.new_dangerous_findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
                </div>
              )}
              {Array.isArray(llm.changes) && llm.changes.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs font-bold text-slate-700 mb-1">שינויים שזוהו</p>
                  <ul className="space-y-1.5">{llm.changes.map((c, i) => (
                    <li key={i} className="text-xs text-slate-700 bg-slate-50 rounded-md px-2.5 py-1.5">
                      <span className={`font-bold ${c.significance === "critical" ? "text-red-600" : c.significance === "significant" ? "text-amber-600" : "text-slate-500"}`}>[{c.significance}]</span> {c.description_he}
                    </li>
                  ))}</ul>
                </div>
              )}
              {Array.isArray(llm.resolved_findings) && llm.resolved_findings.length > 0 && (
                <p className="text-xs text-emerald-700 mb-2">ממצאים שנעלמו: {llm.resolved_findings.join(", ")}</p>
              )}
              {llm.clinical_significance_he && <p className="text-xs text-slate-600 mb-2">{llm.clinical_significance_he}</p>}
              {Array.isArray(llm.recommended_next_steps_he) && llm.recommended_next_steps_he.length > 0 && (
                <div className="text-xs text-slate-700"><span className="font-bold">המשך: </span>{llm.recommended_next_steps_he.join(" · ")}</div>
              )}
              {comparison.deterministic && comparison.deterministic.comparable === false && (
                <p className="text-[11px] text-amber-600 mt-2">הערה: לתרשים הקודם אין קריאה מובנית — ההשוואה מבוססת-תמונה ומוגבלת.</p>
              )}
              {llm.disclaimer_he && <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-100">{llm.disclaimer_he}</p>}
            </div>
          );
        })()}

        <DisclaimerBanner />
      </div>
    </div>
  );
}