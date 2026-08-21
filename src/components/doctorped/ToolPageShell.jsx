import React from "react";
import ClinicHeader from "@/components/clinic/ClinicHeader";
import DisclaimerBanner from "@/components/DisclaimerBanner";
import { useI18n } from "@/lib/i18n";

export default function ToolPageShell({ icon: Icon, titleKey, introKey, accent = "cyan", children }) {
  const { t } = useI18n();
  return (
    <div className="clinic-page">
      <ClinicHeader title={t(titleKey)} icon={Icon} tone={accent === "rose" ? "parent" : "tool"} />
      <div className="clinic-wrap py-6 space-y-5 pb-10">
        {introKey && (
          <p className="text-sm text-slate-600 leading-relaxed clinic-card p-4">
            {t(introKey)}
          </p>
        )}
        {children}
        <DisclaimerBanner />
      </div>
    </div>
  );
}
