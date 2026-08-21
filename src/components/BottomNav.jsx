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
    <nav className="no-print fixed bottom-0 inset-x-0 z-30 safe-bottom select-none px-3 pb-3 pointer-events-none">
      <div className="pointer-events-auto max-w-md mx-auto grid grid-cols-4 gap-1 rounded-full bg-ink p-1.5 shadow-[0_18px_40px_-20px_rgba(0,0,0,0.7)]">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 rounded-full py-2 transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "text-background/60 hover:text-background"
              }`
            }
          >
            <Icon className="w-[18px] h-[18px]" />
            <span className="text-[10px] font-bold">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
