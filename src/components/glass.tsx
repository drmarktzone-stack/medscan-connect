import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  children,
  glow,
}: {
  className?: string | undefined;
  children: ReactNode;
  glow?: "blue" | "violet" | "pink" | "amber" | "mint" | undefined;
}) {
  return (
    <div className={cn("glass-card", glow && `glow-${glow}`, className)}>
      <div className="glass-sheen" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "low" | "medium" | "high";
}) {
  return <span className={cn("glass-pill", `pill-${tone}`)}>{children}</span>;
}

export function StatTile({
  label,
  value,
  sub,
  glow,
}: {
  label: string;
  value: string;
  sub?: string | undefined;
  glow?: "blue" | "violet" | "pink" | "amber" | "mint" | undefined;
}) {
  return (
    <GlassCard glow={glow} className="p-5">
      <p className="text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-foreground">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </GlassCard>
  );
}
