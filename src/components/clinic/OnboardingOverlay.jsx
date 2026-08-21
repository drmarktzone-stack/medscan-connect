import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Stethoscope } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const KEY = "doctorped_onboarded_v1";

export default function OnboardingOverlay() {
  const { t } = useI18n();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 bg-foreground/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[2rem] bg-card border border-border p-6 space-y-3 shadow-2xl">
        <h2 className="text-2xl font-black tracking-tight">{t("clinic.onboard_title")}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed pb-1">{t("clinic.onboard_body")}</p>
        <Link
          to="/doctorped"
          onClick={dismiss}
          className="flex items-center gap-3 rounded-full bg-primary text-primary-foreground px-5 py-4 font-extrabold"
        >
          <Stethoscope className="w-5 h-5" />
          {t("clinic.onboard_clinician")}
        </Link>
        <Link
          to="/parent"
          onClick={dismiss}
          className="flex items-center gap-3 rounded-full bg-ink text-background px-5 py-4 font-extrabold"
        >
          <Heart className="w-5 h-5" />
          {t("clinic.onboard_parent")}
        </Link>
        <button type="button" onClick={dismiss} className="w-full text-sm font-bold text-muted-foreground py-2">
          {t("clinic.onboard_later")}
        </button>
      </div>
    </div>
  );
}
