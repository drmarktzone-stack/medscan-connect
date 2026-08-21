import React, { useState, useEffect } from "react";
import { Stethoscope, Loader2, BookOpen, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { runDiagnosisPipeline } from "@/lib/analysisPipeline";
import { runSkinFastAnalysis } from "@/lib/medscan/engines/skinFastPipeline";
import ImageUploader from "@/components/ImageUploader";
import ClinicalContextForm from "@/components/ClinicalContextForm";
import ExamFindingsInput from "@/components/ExamFindingsInput";
import PediatricToggle from "@/components/PediatricToggle";
import AnalysisResult from "@/components/AnalysisResult";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import GroundedInterpretation from "@/components/GroundedInterpretation";
import LesionMorphometry from "@/components/LesionMorphometry";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import { useI18n } from "@/lib/i18n";
import { runGroundedVisionInterpretation } from "@/lib/medscan/engines/visionGrounded";

export default function SkinAnalysis() {
  const { t, lang } = useI18n();
  const [files, setFiles] = useState([]);
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

  useEffect(() => {
    base44.entities.SkinCase.list("-created_date", 500).then((cases) => setKbCount(cases.length)).catch(() => {});
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
      // ⚡ צינור-עור מהיר: קריאה מורפולוגית אחת + ניקוד דרמוסקופי בקוד + השוואה למאגר.
      const res = await runSkinFastAnalysis({
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
      <ClinicHeader title={t("analysis.skin_title")} icon={Stethoscope} tone="tool" />

      <div className="max-w-lg mx-auto px-5 py-6 space-y-5">
        {kbCount > 0 && (
          <Link to="/knowledge-base" className="flex items-center gap-2 text-xs text-teal-600 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
            <BookOpen className="w-4 h-4" />
            {t("analysis.skin_kb_link", { n: kbCount })}
          </Link>
        )}

        <ImageUploader
          files={files}
          onFilesChange={handleFilesChange}
          label={t("analysis.skin_upload_label")}
          hint={t("analysis.skin_upload_hint")}
        />

        {files.length > 0 && !result && (
          <>
            <ClinicalContextForm onChange={setClinicalContext} />
            <ExamFindingsInput onChange={setExamFindings} />
            <PediatricToggle value={pediatric} onChange={setPediatric} />
            <Button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full h-12 rounded-xl text-sm font-semibold bg-teal-600 hover:bg-teal-700 shadow-md shadow-teal-500/20"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {stageLabel}
                </span>
              ) : (
                t("analysis.skin_button")
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
              analysisId={result.analysisId}
              analysisType="skin"
              structuredInterpretation={result.structuredInterpretation}
              numericIntegrity={result.numericIntegrity}
            />
          </div>
        )}

        {result && result.imageUrl && (
          <LesionMorphometry imageUrl={result.imageUrl} />
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
              <ShieldCheck className="w-5 h-5 text-teal-500" />
              <div>
                <h3 className="font-bold text-sm">פרשנות מעוגנת</h3>
                <p className="text-[11px] text-slate-500">עברה אימות מול בסיס הידע המאומת</p>
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