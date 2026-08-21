import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Activity, Baby, Brain, LayoutGrid, Stethoscope } from "lucide-react";

const nav = [
  { to: "/", label: "סקירה", icon: LayoutGrid },
  { to: "/patients", label: "מטופלים", icon: Baby },
  { to: "/cases", label: "מקרים", icon: Activity },
  { to: "/assistant", label: "עוזר AI", icon: Brain },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="glass-card sticky top-4 z-40 flex flex-wrap items-center justify-between gap-4 px-4 py-3">
        <div className="glass-sheen" aria-hidden="true" />
        <Link to="/" className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-2xl border border-border bg-primary/25 backdrop-blur-xl">
            <Stethoscope className="size-5 text-foreground" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-aurora">DoctorPedAI</span>
        </Link>

        <nav className="relative flex flex-wrap items-center gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
              activeProps={{
                className:
                  "flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium bg-white/15 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35)]",
              }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="pb-2 text-center text-xs text-muted-foreground">
        DoctorPedAI · תמיכת החלטה קלינית ברפואת ילדים · אינו תחליף לשיקול דעת רפואי
      </footer>
    </div>
  );
}
