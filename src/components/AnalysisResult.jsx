import React, { useRef, useState } from "react";
import DiagnosisBadge from "@/components/DiagnosisBadge";
import ReactMarkdown from "react-markdown";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import AnnotatedImage from "@/components/AnnotatedImage";
import ECGInterpretationCard from "@/components/ECGInterpretationCard";
import RadiologyInterpretationCard from "@/components/RadiologyInterpretationCard";
import SkinInterpretationCard from "@/components/SkinInterpretationCard";
import UncertaintyWarning from "@/components/UncertaintyWarning";
import NumericIntegrityNotice from "@/components/NumericIntegrityNotice";
import EmergencyTriageBanner from "@/components/EmergencyTriageBanner";
import FeedbackButtons from "@/components/FeedbackButtons";
import PrintableReport from "@/components/PrintableReport";
import { exportReportToPDF } from "@/lib/pdfExport";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

function confidenceStyle(conf) {
  if (conf >= 70) return "text-red-600 bg-red-50 border-red-200";
  if (conf >= 40) return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-slate-500 bg-slate-50 border-slate-200";
}

export default function AnalysisResult({ result, severity, summary, matchedCases, imageUrl, findings, uncertainty, guideline, analysisId, analysisType, ecgInterpretation, structuredInterpretation, numericIntegrity }) {
  const structured = structuredInterpretation || ecgInterpretation;
  const { t, dir } = useI18n();
  const printRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const primaryDiagnosis = matchedCases?.[0]?.diagnosis || matchedCases?.[0]?.title || summary || "";

  const handleExport = async () => {
    if (!printRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportReportToPDF(printRef.current);
    } catch (err) {
      console.error(err);
      setExportError(t("result.export_error"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="space-y-5">
        <EmergencyTriageBanner severity={severity} urgency={structured?.structured?.clinical_urgency} />

        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-lg font-bold text-foreground">{t("result.title")}</h3>
          <DiagnosisBadge diagnosis={primaryDiagnosis} severity={severity} />
        </div>

        {uncertainty && uncertainty.level !== "low" && (
          <UncertaintyWarning level={uncertainty.level} reason={uncertainty.reason} />
        )}

        {/* בדיקת המספרים מוצגת לפני הניתוח ולא אחריו: אם מספר נוטרל,
            צריך לדעת זאת לפני שקוראים את הטקסט, לא אחרי. */}
        <NumericIntegrityNotice integrity={numericIntegrity} />

        {summary && (
          <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
            <p className="text-sm font-semibold text-primary">{summary}</p>
          </div>
        )}

        {analysisType === "ecg" && structured && <ECGInterpretationCard interpretation={structured} />}
        {analysisType === "radiology" && structured && <RadiologyInterpretationCard interpretation={structured} />}
        {analysisType === "skin" && structured && <SkinInterpretationCard interpretation={structured} />}

        {imageUrl && findings && findings.length > 0 && (
          <AnnotatedImage imageUrl={imageUrl} findings={findings} />
        )}

        {matchedCases && matchedCases.length > 0 && (
          <div>
            <h4 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              {t("result.kb_match")}
            </h4>
            <div className="space-y-2">
              {matchedCases.map((m, i) => (
                <div key={i} className="flex items-start gap-3 bg-white border border-slate-200 rounded-lg p-3">
                  <div className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md border ${confidenceStyle(m.confidence)}`}>
                    {m.confidence}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{m.title}</p>
                    {m.diagnosis && <p className="text-xs text-muted-foreground mt-0.5">{m.diagnosis}</p>}
                    {m.reasoning && <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">{m.reasoning}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {guideline && (
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
            <h4 className="text-sm font-bold text-teal-800 mb-1">{t("result.guideline")}</h4>
            <p className="text-xs text-teal-700 leading-relaxed">{guideline}</p>
          </div>
        )}

        <div className="prose prose-sm max-w-none text-foreground/85 leading-relaxed select-text" dir={dir}>
          <ReactMarkdown>{result}</ReactMarkdown>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-[10px] text-muted-foreground/60 text-center leading-relaxed">{t("result.footer")}</p>
        </div>
      </div>

      <Button onClick={handleExport} disabled={exporting} variant="outline" className="w-full h-11 rounded-xl text-sm font-semibold">
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {exporting ? t("result.exporting") : t("result.export_pdf")}
      </Button>
      {exportError && <p className="text-xs text-red-500 text-center">{exportError}</p>}

      {analysisId && <FeedbackButtons analysisId={analysisId} analysisType={analysisType} />}

      {/* Off-screen print-optimized report for PDF export */}
      <div style={{ position: "fixed", left: "-99999px", top: 0, pointerEvents: "none" }} aria-hidden="true">
        <PrintableReport
          ref={printRef}
          summary={summary}
          severity={severity}
          imageUrl={imageUrl}
          findings={findings}
          matchedCases={matchedCases}
          guideline={guideline}
          result={result}
          analysisType={analysisType}
          analysisId={analysisId}
        />
      </div>
    </div>
  );
}