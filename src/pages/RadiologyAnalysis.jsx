import React, { useState, useEffect, useMemo } from "react";
import { ScanLine, Loader2, BookOpen, ShieldCheck, Contrast, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { runDiagnosisPipeline } from "@/lib/analysisPipeline";
import ImageUploader from "@/components/ImageUploader";
import ClinicalContextForm from "@/components/ClinicalContextForm";
import ExamFindingsInput, { RADIOLOGY_EXAM_FIELDS } from "@/components/ExamFindingsInput";
import PediatricToggle from "@/components/PediatricToggle";
import AnalysisResult from "@/components/AnalysisResult";
import GroundedInterpretation from "@/components/GroundedInterpretation";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { useI18n } from "@/lib/i18n";
import { runGroundedVisionInterpretation } from "@/lib/medscan/engines/visionGrounded";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import RadiologyViewer from "@/components/RadiologyViewer";

export default function RadiologyAnalysis() {
  const { t, lang } = useI18n();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [kbCount, setKbCount] = useState(0);
  const [clinicalContext, setClinicalContext] = useState("");
  const [examFindings, setExamFindings] = useState("");
  const [pediatric, setPediatric] = useState(false);
  const [grounded, setGrounded] = useState(null);
  const [groundedLoading, setGroundedLoading] = useState(false);

  // מקור התמונה ללשונית הניגודית.
  // מעדיפים blob מקומי על פני ה-URL המרוחק: הקנבס קורא פיקסלים
  // (getImageData), ותמונה ממקור אחר עלולה להכתים אותו ולחסום את הקריאה.
  const viewerSrc = useMemo(() => {
    if (files.length > 0) return URL.createObjectURL(files[0]);
    return result?.imageUrl || null;
  }, [files, result]);

  useEffect(() => {
    if (files.length > 0 && viewerSrc?.startsWith("blob:")) {
      return () => URL.revokeObjectURL(viewerSrc);
    }
  }, [viewerSrc, files]);

  useEffect(() => {
    base44.entities.RadiologyCase.list("-created_date", 500).then((cases) => setKbCount(cases.length)).catch(() => {});
  }, []);

  const handleFilesChange = (newFiles) => {
    setFiles(newFiles);
    setResult(null);
    setGrounded(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    const fullContext = [clinicalContext, examFindings].filter(Boolean).join("\n");
    try {
      // ⚡ צינור-רדיולוגיה מהיר: קריאה שיטתית אחת (מודליות→ABCDE→אפיון),
      // ואז כל ההרכבה בקוד (הערכת-מדידות מול נורמות-גיל + השוואה למאגר).
      // מחליף את הצינור הרב-קריאתי (3-4 קריאות Opus טוריות ≈ 5 דקות).
      const res = await runRadiologyFastAnalysis({
        files,
        clinicalContext: fullContext,
        language: lang,
        pediatric,
        onStage: setStage,
      });
      setResult(res);

      // הצינור הישן והפרשנות המעוגנת נשמרים בקוד אך אינם בשימוש במסלול המהיר.
      void runDiagnosisPipeline;
      void runGroundedVisionInterpretation;
    } catch (err) {
      console.error(err);
      setError(err.message || t("analysis.error_fallback"));
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  const stageLabels = {
    extracting: t("analysis.stage_extracting"),
    matching: t("analysis.stage_matching"),
    verifying: t("analysis.stage_verifying"),
    diagnosing: t("analysis.stage_diagnosing"),
  };
  const stageLabel = stageLabels[stage] || t("analysis.stage_diagnosing");

  return (
    <div className="clinic-page">
      <ClinicHeader title={t("analysis.radiology_title")} icon={ScanLine} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {kbCount > 0 && (
          <Link to="/knowledge-base" className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            <BookOpen className="w-4 h-4" />
            {t("analysis.radiology_kb_link", { n: kbCount })}
          </Link>
        )}

        <ImageUploader
          files={files}
          onFilesChange={handleFilesChange}
          label={t("analysis.radiology_upload_label")}
          hint={t("analysis.radiology_upload_hint")}
        />

        {files.length > 0 && !result && (
          <>
            <ClinicalContextForm onChange={setClinicalContext} />
            <ExamFindingsInput onChange={setExamFindings} fields={RADIOLOGY_EXAM_FIELDS} title="התוויה קלינית ורקע" />
            <PediatricToggle value={pediatric} onChange={setPediatric} />
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-500/20"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {stageLabel}
                </span>
              ) : (
                t("analysis.radiology_button")
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
          <Tabs defaultValue="result" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="result" className="flex items-center gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5" />
                {t("viewer.tab_result")}
              </TabsTrigger>
              <TabsTrigger value="contrast" className="flex items-center gap-1.5 text-xs">
                <Contrast className="w-3.5 h-3.5" />
                {t("viewer.tab_contrast")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="result" className="mt-0">
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
                  analysisId={result.analysisId}
                  analysisType="radiology"
                  structuredInterpretation={result.structuredInterpretation}
                  numericIntegrity={result.numericIntegrity}
                />
              </div>
            </TabsContent>

            <TabsContent value="contrast" className="mt-0">
              <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
                {viewerSrc ? (
                  <RadiologyViewer src={viewerSrc} />
                ) : (
                  <p className="text-sm text-slate-500">{t("viewer.load_error")}</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
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
              <ShieldCheck className="w-5 h-5 text-indigo-500" />
              <div>
                <h3 className="font-bold text-sm">פרשנות מעוגנת</h3>
                <p className="text-[11px] text-slate-500">
                  עברה אימות מול בסיס הידע המאומת
                </p>
              </div>
            </div>
            <GroundedInterpretation data={grounded} />
          </div>
        )}

        <DisclaimerBanner />
      </div>
    </div>
  );
}