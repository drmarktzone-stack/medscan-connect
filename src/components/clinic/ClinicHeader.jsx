import React from "react";
import BackButton from "@/components/BackButton";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { useClinicProfile } from "@/lib/clinic/profileContext";

const ACCENT = {
  clinic: "bg-primary text-primary-foreground",
  parent: "bg-background text-foreground",
  tool: "bg-primary text-primary-foreground",
};

export default function ClinicHeader({ title, icon: Icon, tone = "clinic", backTo = "/", extra = null }) {
  const { profile } = useClinicProfile();
  const subtitle = [profile.clinicName, profile.physicianName].filter(Boolean).join(" · ");

  return (
    <header className="sticky top-0 z-20 safe-top no-print bg-ink text-background">
      <div className="clinic-wrap py-3 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="[&_button]:text-background/80 [&_a]:text-background/80">
            <BackButton to={backTo} />
          </div>
          {Icon && (
            <div className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${ACCENT[tone] || ACCENT.clinic}`}>
              <Icon className="w-4.5 h-4.5" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-black text-base sm:text-lg tracking-tight truncate">{title}</h1>
          {subtitle ? <p className="text-[11px] text-background/60 truncate">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {extra}
          <div className="[&_button]:text-background/80">
            <LanguageSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
