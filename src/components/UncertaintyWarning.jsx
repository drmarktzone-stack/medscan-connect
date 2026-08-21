import React from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function UncertaintyWarning({ level, reason }) {
  const { t } = useI18n();
  if (!level || level === "low") return null;

  const styles = {
    high: "bg-red-50 border-red-200 text-red-800",
    medium: "bg-amber-50 border-amber-200 text-amber-800",
  };

  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${styles[level] || styles.medium}`}>
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold">{t("uncertainty.title")}</p>
        <p className="text-xs mt-1 leading-relaxed opacity-90">{reason}</p>
      </div>
    </div>
  );
}