import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill } from "@/components/glass";
import { cases, severityLabel, statusLabel, type CaseStatus } from "@/lib/doctorped-data";

export const Route = createFileRoute("/cases")({
  head: () => ({
    meta: [
      { title: "מקרים קליניים — DoctorPedAI" },
      { name: "description", content: "כל המקרים הקליניים שנותחו על ידי DoctorPedAI, מסוננים לפי סטטוס ודחיפות." },
      { property: "og:title", content: "מקרים קליניים — DoctorPedAI" },
      { property: "og:description", content: "מקרים שנותחו על ידי המנוע, לפי סטטוס ודחיפות." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CasesPage,
});

const filters: Array<{ key: CaseStatus | "all"; label: string }> = [
  { key: "all", label: "הכול" },
  { key: "open", label: "פתוח" },
  { key: "in_review", label: "בבדיקה" },
  { key: "closed", label: "סגור" },
];

function CasesPage() {
  const [filter, setFilter] = useState<CaseStatus | "all">("all");
  const visible = filter === "all" ? cases : cases.filter((c) => c.status === filter);

  return (
    <AppShell>
      <div className="grid gap-4">
        <GlassCard glow="pink" className="p-7">
          <h1 className="text-3xl font-semibold tracking-tight">מקרים קליניים</h1>
          <div className="mt-5 flex flex-wrap gap-2">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? "rounded-full border border-border bg-white/20 px-4 py-1.5 text-sm font-semibold backdrop-blur-xl"
                    : "rounded-full border border-border bg-white/5 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-xl transition-colors hover:bg-white/15 hover:text-foreground"
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </GlassCard>

        <div className="grid gap-4 lg:grid-cols-2">
          {visible.map((c) => (
            <GlassCard key={c.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{c.patient_name}</h2>
                  <p className="text-xs text-muted-foreground">{c.chief_complaint}</p>
                </div>
                <div className="flex gap-2">
                  <Pill tone={c.severity}>{severityLabel[c.severity]}</Pill>
                  <Pill>{statusLabel[c.status]}</Pill>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
              <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-linear-to-r from-aurora-blue via-aurora-violet to-aurora-pink"
                  style={{ width: `${Math.round(c.confidence * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[0.7rem] text-muted-foreground">
                ודאות {Math.round(c.confidence * 100)}% · {new Date(c.created_at).toLocaleString("he-IL")}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
