import React from "react";

const severityStyles = {
  normal: "bg-emerald-100 text-emerald-700",
  mild: "bg-sky-100 text-sky-700",
  moderate: "bg-amber-100 text-amber-700",
  severe: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

const severityDots = {
  normal: "bg-emerald-500",
  mild: "bg-sky-500",
  moderate: "bg-amber-500",
  severe: "bg-orange-500",
  urgent: "bg-red-500",
};

export default function DiagnosisBadge({ diagnosis, severity }) {
  const style = severityStyles[severity] || severityStyles.normal;
  const dot = severityDots[severity] || severityDots.normal;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${style} max-w-[260px]`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="truncate">{diagnosis}</span>
    </span>
  );
}