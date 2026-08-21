import { Activity, CalendarDays, HeartPulse, Ruler, ShieldAlert, Syringe, FlaskConical, Pill as PillIcon, NotebookPen } from "lucide-react";
import { GlassCard, Pill } from "@/components/glass";
import { ageLabel, clinicalPatients, type ClinicalPatient } from "@/lib/clinical-data";
import { cn } from "@/lib/utils";

const statusTone = { normal: "low", watch: "medium", alert: "high" } as const;

const historyIcon = {
  visit: CalendarDays,
  lab: FlaskConical,
  vaccine: Syringe,
  med: PillIcon,
  note: NotebookPen,
} as const;

export function PatientRail({
  patient,
  onSelect,
}: {
  patient: ClinicalPatient;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <GlassCard glow="blue" className="p-5">
        <p className="text-xs font-medium text-muted-foreground">בחירת מטופל</p>
        <div className="mt-3 flex flex-col gap-2">
          {clinicalPatients.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={cn(
                "flex items-center justify-between rounded-2xl border border-border px-3 py-2.5 text-right transition-colors",
                p.id === patient.id
                  ? "bg-primary/15 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.8)]"
                  : "bg-white/40 hover:bg-white/70",
              )}
            >
              <span>
                <span className="block text-sm font-semibold">{p.display_name}</span>
                <span className="block text-[0.7rem] text-muted-foreground">
                  {ageLabel(p.age_months)} · {p.weight_kg} ק״ג
                </span>
              </span>
              <Pill tone={p.severity}>{p.chief_complaint.slice(0, 18)}</Pill>
            </button>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{patient.display_name}</h2>
            <p className="text-xs text-muted-foreground">
              {ageLabel(patient.age_months)} · {patient.sex === "male" ? "זכר" : "נקבה"} · אפוטרופוס: {patient.guardian}
            </p>
          </div>
          <span className="flex size-11 items-center justify-center rounded-2xl border border-border bg-white/60">
            <HeartPulse className="size-5 text-primary" />
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {patient.allergies.length ? (
            patient.allergies.map((a) => (
              <span key={a} className="glass-pill pill-high">
                <ShieldAlert className="size-3" />
                {a}
              </span>
            ))
          ) : (
            <Pill tone="low">ללא אלרגיות ידועות</Pill>
          )}
          {patient.chronic.map((c) => (
            <Pill key={c} tone="medium">
              {c}
            </Pill>
          ))}
        </div>

        <h3 className="mt-6 flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-primary" />
          מדדים חיוניים
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {patient.vitals.map((v) => (
            <div key={v.key} className="glass-panel p-3">
              <div className="flex items-center justify-between gap-1">
                <p className="text-[0.7rem] text-muted-foreground">{v.label}</p>
                <Pill tone={statusTone[v.status]}>
                  {v.status === "normal" ? "תקין" : v.status === "watch" ? "מעקב" : "חריג"}
                </Pill>
              </div>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {v.value}
                <span className="mr-1 text-[0.65rem] font-normal text-muted-foreground">{v.unit}</span>
              </p>
              <p className="text-[0.65rem] text-muted-foreground">טווח: {v.ref}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard glow="mint" className="p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Ruler className="size-4 text-primary" />
          עקומות גדילה (אחוזונים)
        </h3>
        <div className="mt-4 space-y-4">
          {patient.growth.map((g) => (
            <div key={g.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">
                  {g.label} · {g.value}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  אחוזון {g.percentile}
                  {g.trend === "up" ? " ↑" : g.trend === "down" ? " ↓" : " →"}
                </span>
              </div>
              <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-white/60">
                <div className="absolute inset-y-0 right-[3%] w-[94%] bg-linear-to-l from-aurora-mint/40 via-aurora-blue/30 to-aurora-pink/40" />
                <div
                  className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-md"
                  style={{ right: `calc(${g.percentile}% - 7px)` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[0.6rem] text-muted-foreground">
                <span>P97</span>
                <span>P50</span>
                <span>P3</span>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <h3 className="text-sm font-semibold">היסטוריה רפואית</h3>
        <ol className="mt-4 space-y-3 border-r border-border pr-4">
          {patient.history.map((h) => {
            const Icon = historyIcon[h.kind];
            return (
              <li key={`${h.date}-${h.title}`} className="relative">
                <span className="absolute -right-[1.42rem] top-1 flex size-5 items-center justify-center rounded-full border border-border bg-white/80">
                  <Icon className="size-3 text-primary" />
                </span>
                <p className="text-xs font-semibold">{h.title}</p>
                <p className="text-[0.7rem] text-muted-foreground">{h.detail}</p>
                <p className="text-[0.65rem] text-muted-foreground">{h.date}</p>
              </li>
            );
          })}
        </ol>
      </GlassCard>
    </div>
  );
}
