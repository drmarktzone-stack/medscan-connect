import React from "react";
import BackButton from "@/components/BackButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useClinicProfile } from "@/lib/clinic/profileContext";

const TONE = {
  clinic: "bg-gradient-to-l from-cyan-800 to-teal-700",
  parent: "bg-gradient-to-l from-rose-700 to-orange-600",
  tool: "bg-gradient-to-l from-slate-800 to-cyan-800",
};

export default function ClinicHeader({ title, icon: Icon, tone = "clinic", backTo = "/", extra = null }) {
  const { profile } = useClinicProfile();
  const subtitle = [profile.clinicName, profile.physicianName].filter(Boolean).join(" · ");

  return (
    <header className={`sticky top-0 z-20 ${TONE[tone] || TONE.clinic} text-white safe-top shadow-md no-print`}>
      <div className="clinic-wrap py-3 flex items-center gap-3">
        <div className="text-white">
          <BackButton to={backTo} className="text-white" />
        </div>
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-extrabold text-base sm:text-lg tracking-tight truncate">{title}</h1>
          {subtitle ? <p className="text-[11px] text-white/75 truncate">{subtitle}</p> : null}
        </div>
        {extra}
        <div className="text-white [&_button]:text-white/90">
          <LanguageSwitcher />
        </div>
      </div>
    </header>
  );
}
