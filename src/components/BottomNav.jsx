import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutGrid, Stethoscope, Heart, Clock } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function BottomNav() {
  const { t } = useI18n();
  const tabs = [
    { to: "/", label: t("nav.tools"), icon: LayoutGrid, end: true },
    { to: "/doctorped", label: t("nav.workbench"), icon: Stethoscope, end: false },
    { to: "/parent", label: t("nav.parent"), icon: Heart, end: false },
    { to: "/history", label: t("nav.history"), icon: Clock, end: false },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-lg border-t border-slate-200 safe-bottom select-none">
      <div className="max-w-5xl mx-auto grid grid-cols-4">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
