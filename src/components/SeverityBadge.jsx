import React from "react";
import { useI18n } from "@/lib/i18n";

const config = {
  normal: { labelKey: "severity.normal", bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
  mild: { labelKey: "severity.mild", bg: "bg-sky-100", text: "text-sky-700", dot: "bg-sky-500" },
  moderate: { labelKey: "severity.moderate", bg: "bg-amber-100", text: "text-amber-700", dot: "bg-amber-500" },
  severe: { labelKey: "severity.severe", bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  urgent: { labelKey: "severity.urgent", bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
};

export default function SeverityBadge({ severity }) {
  const { t } = useI18n();
  const c = config[severity] || config.normal;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {t(c.labelKey)}
    </span>
  );
}