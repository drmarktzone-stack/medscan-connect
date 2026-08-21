import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Activity, Baby, Brain, HeartHandshake, Languages, LogIn, LogOut, Stethoscope } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DecisionSupportBanner } from "@/components/DecisionSupportBanner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

const nav = [
  { to: "/doctorped", label: "שולחן קליני", icon: Stethoscope, clinicianOnly: true },
  { to: "/parent", label: "פורטל הורים", icon: HeartHandshake },
  { to: "/patients", label: "מטופלים", icon: Baby, clinicianOnly: true },
  { to: "/cases", label: "מקרים", icon: Activity, clinicianOnly: true },
  { to: "/assistant", label: "עוזר AI", icon: Brain, clinicianOnly: true },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [locale, setLocale] = useState<"he" | "en" | "ar">("he");

  useEffect(() => {
    const saved = window.localStorage.getItem("doctorped-locale");
    if (saved === "he" || saved === "en" || saved === "ar") setLocale(saved);
  }, []);

  const setLanguage = (next: "he" | "en" | "ar") => {
    setLocale(next);
    window.localStorage.setItem("doctorped-locale", next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "en" ? "ltr" : "rtl";
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-3 py-4 sm:px-5">
      <header className="glass-card sticky top-4 z-40 flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="glass-sheen" aria-hidden="true" />
        <Link to={role === "parent" ? "/parent" : "/doctorped"} className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl border border-border bg-primary/25 backdrop-blur-xl">
            <Stethoscope className="size-5 text-foreground" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-aurora">DoctorPedAI</span>
        </Link>

        <nav className="relative flex flex-wrap items-center gap-1">
          {nav.filter((item) => !("clinicianOnly" in item && item.clinicianOnly && role !== "clinician")).map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: true }}
              className="flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/60 hover:text-foreground"
              activeProps={{
                className:
                  "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium bg-white/75 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)]",
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="relative flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded-full border border-border bg-background/40 p-1 sm:flex" title="שפה">
            <Languages className="mx-1 size-4 text-muted-foreground" />
            {(["he", "en", "ar"] as const).map((lang) => (
              <Button key={lang} size="sm" variant={locale === lang ? "default" : "ghost"} className="h-7 rounded-full px-2" onClick={() => setLanguage(lang)}>{lang === "he" ? "עב" : lang === "ar" ? "عر" : "EN"}</Button>
            ))}
          </div>
          {user ? (
            <Button size="icon" variant="ghost" title="התנתקות" onClick={async () => { await supabase.auth.signOut(); await navigate({ to: "/auth" }); }}><LogOut /></Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => navigate({ to: "/auth" })}><LogIn /> כניסה</Button>
          )}
        </div>
      </header>

      <DecisionSupportBanner />
      <main className="flex-1">{children}</main>

      <footer className="pb-2 text-center text-xs text-muted-foreground">
        DoctorPedAI · תמיכת החלטה קלינית ברפואת ילדים · אינו תחליף לשיקול דעת רפואי
      </footer>
    </div>
  );
}
