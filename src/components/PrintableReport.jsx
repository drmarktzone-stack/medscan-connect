import React, { forwardRef } from "react";
import ReactMarkdown from "react-markdown";
import { Heart } from "lucide-react";
import moment from "moment";
import { useI18n } from "@/lib/i18n";
import SeverityBadge from "@/components/SeverityBadge";

const typeTitleKey = {
  ecg: "analysis.ecg_title",
  skin: "analysis.skin_title",
  radiology: "analysis.radiology_title",
};

/**
 * Print-optimized, doctor-facing diagnostic report.
 * Rendered off-screen and captured by html2canvas for PDF export.
 */
const PrintableReport = forwardRef(function PrintableReport(
  { summary, severity, imageUrl, findings, matchedCases, guideline, result, analysisType, analysisId },
  ref
) {
  const { t, dir } = useI18n();
  const hasFindings = findings && findings.length > 0;

  return (
    <div
      ref={ref}
      dir={dir}
      style={{ width: 794, padding: 48, background: "#ffffff", fontFamily: "Heebo, sans-serif", color: "#1e293b" }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">MedScan AI</h1>
            <p className="text-xs text-slate-500">{t("report.subtitle")}</p>
          </div>
        </div>
        <div className="text-left">
          <p className="text-xs text-slate-500">{t("report.date")}</p>
          <p className="text-sm font-semibold text-slate-700">{moment().format("DD/MM/YYYY HH:mm")}</p>
        </div>
      </div>

      {/* Type + severity */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{t("report.type")}</p>
          <p className="text-base font-bold text-slate-900">{t(typeTitleKey[analysisType] || "analysis.ecg_title")}</p>
        </div>
        {severity && <SeverityBadge severity={severity} />}
      </div>

      {/* Final diagnosis */}
      {summary && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-bold text-blue-700 mb-1">{t("report.final_diagnosis")}</p>
          <p className="text-sm font-semibold text-blue-900 leading-relaxed">{summary}</p>
        </div>
      )}

      {/* Annotated image */}
      {imageUrl && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">{t("report.image")}</h4>
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img src={imageUrl} crossOrigin="anonymous" className="w-full block" />
            {hasFindings && findings.map((f, i) => {
              const labelAbove = f.y >= 8;
              return (
                <div
                  key={i}
                  className="absolute border-2 border-red-500 rounded"
                  style={{ left: `${f.x}%`, top: `${f.y}%`, width: `${f.width}%`, height: `${f.height}%` }}
                >
                  <span
                    className={`absolute right-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap ${
                      labelAbove ? "top-0 -translate-y-full" : "top-0.5"
                    }`}
                  >
                    {f.label}
                  </span>
                </div>
              );
            })}
          </div>
          {hasFindings && (
            <p className="text-xs text-slate-500 mt-1.5 text-center">{t("annotated.count", { n: findings.length })}</p>
          )}
        </div>
      )}

      {/* Treatment recommendations */}
      {guideline && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
          <h4 className="text-sm font-bold text-teal-800 mb-1">{t("report.recommendations")}</h4>
          <p className="text-sm text-teal-900 leading-relaxed">{guideline}</p>
        </div>
      )}

      {/* Matched / differential cases */}
      {matchedCases && matchedCases.length > 0 && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">{t("result.kb_match")}</h4>
          <div className="space-y-1.5">
            {matchedCases.map((m, i) => (
              <div key={i} className="flex items-start gap-3 border border-slate-200 rounded-lg p-2.5">
                <span className="text-xs font-bold text-slate-600 shrink-0 w-10 text-center">{m.confidence}%</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{m.title}</p>
                  {m.diagnosis && <p className="text-xs text-slate-500">{m.diagnosis}</p>}
                  {m.reasoning && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{m.reasoning}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed analysis */}
      {result && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">{t("report.detailed_analysis")}</h4>
          <div className="prose prose-sm max-w-none text-slate-800 leading-relaxed">
            <ReactMarkdown>{result}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-slate-200 pt-4">
        <p className="text-[10px] text-slate-400 leading-relaxed">{t("result.footer")}</p>
        {analysisId && <p className="text-[10px] text-slate-400 mt-1">{t("report.id")}: {analysisId}</p>}
      </div>
    </div>
  );
});

export default PrintableReport;