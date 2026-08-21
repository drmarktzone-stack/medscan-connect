import { useState } from "react";
import { Dna, FlaskConical, Baby, ScanLine, ClipboardList, Sparkles, Waves } from "lucide-react";
import { GlassCard, Pill } from "@/components/glass";
import { instrumentCards, medscanModules } from "@/lib/clinical-data";
import { cn } from "@/lib/utils";

const icons = {
  labs: FlaskConical,
  derm: ScanLine,
  ultrasound: Waves,
  genetics: Dna,
  milestones: Baby,
  questionnaires: ClipboardList,
} as const;

const statusTone = { normal: "low", watch: "medium", alert: "high" } as const;

export function MedScanRail() {
  const [active, setActive] = useState(medscanModules[0]!.id);
  const activeModule = medscanModules.find((m) => m.id === active)!;
  const ActiveIcon = icons[activeModule.icon];

  return (
    <div className="flex flex-col gap-4">
      <GlassCard glow="blue" className="p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">מודולי MedScan</h2>
          <Pill>
            <Sparkles className="size-3" />
            6 מנועים
          </Pill>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {medscanModules.map((m) => {
            const Icon = icons[m.icon];
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setActive(m.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border border-border px-2 py-3 text-center text-[0.65rem] font-medium transition-colors",
                  m.id === active ? "bg-primary/15 text-foreground" : "bg-white/40 text-muted-foreground hover:bg-white/70",
                )}
              >
                <Icon className="size-4" />
                {m.title.split(" ")[0]}
              </button>
            );
          })}
        </div>

        <div className="glass-panel mt-4 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <ActiveIcon className="size-4 text-primary" />
            {activeModule.title}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{activeModule.summary}</p>

          <ul className="mt-3 space-y-1.5">
            {activeModule.findings.map((f) => (
              <li key={f.label} className="flex items-center justify-between gap-2 rounded-xl bg-white/55 px-3 py-2">
                <span className="text-xs text-muted-foreground">{f.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular-nums">{f.value}</span>
                  <Pill tone={statusTone[f.status]}>
                    {f.status === "normal" ? "תקין" : f.status === "watch" ? "מעקב" : "חריג"}
                  </Pill>
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-3 rounded-xl border border-border bg-primary/10 p-3 text-xs leading-relaxed">
            <span className="font-semibold">תובנת AI: </span>
            {activeModule.aiNote}
          </p>
        </div>
      </GlassCard>

      <GlassCard glow="violet" className="p-5">
        <h2 className="text-lg font-semibold">שאלונים סטנדרטיים</h2>
        <p className="mt-1 text-xs text-muted-foreground">M-CHAT · Vanderbilt · Conners · ASD/ADHD</p>
        <ul className="mt-4 space-y-2">
          {instrumentCards.map((q) => (
            <li key={q.id} className="glass-panel p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{q.title}</p>
                <Pill tone={q.status === "done" ? "low" : q.status === "pending" ? "medium" : "neutral"}>
                  {q.status === "done" ? "הושלם" : q.status === "pending" ? "ממתין" : "זמין"}
                </Pill>
              </div>
              <p className="mt-1 text-[0.7rem] text-muted-foreground">
                {q.ageRange} · {q.items} פריטים {q.score ? `· ציון ${q.score}` : ""}
              </p>
              <p className="mt-2 text-xs">{q.interpretation}</p>
              <button
                type="button"
                className="mt-3 w-full rounded-full border border-border bg-white/60 px-3 py-2 text-xs font-semibold transition-colors hover:bg-white/85"
              >
                {q.status === "done" ? "צפה בתוצאות" : "שלח שאלון להורים"}
              </button>
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
