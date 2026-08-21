import React from "react";
import { Monitor } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { isLocalClinicSession } from "@/lib/clinic/localMode";
import { appParams } from "@/lib/app-params";

export default function LocalClinicBanner() {
  const { t } = useI18n();
  const local = isLocalClinicSession({ appId: appParams.appId, token: appParams.token });
  if (!local) return null;
  return (
    <div className="no-print bg-cyan-50 border-b border-cyan-100 text-cyan-950">
      <div className="clinic-wrap py-1.5 flex items-center gap-2 text-[11px] font-medium">
        <Monitor className="w-3.5 h-3.5 shrink-0" />
        <span>{t("clinic.local_banner")}</span>
      </div>
    </div>
  );
}
