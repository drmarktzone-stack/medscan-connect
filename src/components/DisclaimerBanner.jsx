import React from "react";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function DisclaimerBanner() {
  const { t } = useI18n();
  return (
    <div className="rounded-3xl bg-ink text-background p-4 flex items-start gap-3">
      <span className="w-8 h-8 shrink-0 rounded-full bg-primary grid place-items-center">
        <AlertTriangle className="w-4 h-4 text-primary-foreground" />
      </span>
      <p className="text-xs text-background/75 leading-relaxed">
        <span className="font-extrabold text-background">{t("disclaimer.title")}</span> {t("disclaimer.text")}
      </p>
    </div>
  );
}
