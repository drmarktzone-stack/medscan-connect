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
    <div className="fixed inset-0 z-40 bg-slate-900/55 flex items-end sm:items-center justify-center p-4">
      <div className="clinic-card w-full max-w-md p-6 space-y-4 shadow-2xl">
        <h2 className="text-xl font-extrabold text-slate-900">{t("clinic.onboard_title")}</h2>
        <p className="text-sm text-slate-600 leading-relaxed">{t("clinic.onboard_body")}</p>
        <Link
          to="/doctorped"
          onClick={dismiss}
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-l from-cyan-800 to-teal-600 text-white p-4 font-bold"
        >
          <Stethoscope className="w-6 h-6" />
          {t("clinic.onboard_clinician")}
        </Link>
        <Link
          to="/parent"
          onClick={dismiss}
          className="flex items-center gap-3 rounded-2xl bg-gradient-to-l from-rose-700 to-orange-500 text-white p-4 font-bold"
        >
          <Heart className="w-6 h-6" />
          {t("clinic.onboard_parent")}
        </Link>
        <button type="button" onClick={dismiss} className="w-full text-sm text-slate-500 py-2">
          {t("clinic.onboard_later")}
        </button>
      </div>
    </div>
  );
}
