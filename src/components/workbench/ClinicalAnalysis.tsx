import { useState } from "react";
import { AlertTriangle, Calculator, CheckCircle2, ChevronLeft, Siren, Stethoscope } from "lucide-react";
import { GlassCard, Pill } from "@/components/glass";
import {
  computeDose,
  differentialsByPatient,
  drugs,
  redFlagsByPatient,
  triageTone,
  type ClinicalPatient,
} from "@/lib/clinical-data";
import { TRIAGE_LABELS_HE } from "@/types/doctorped";
import { cn } from "@/lib/utils";

export function ClinicalAnalysis({ patient }: { patient: ClinicalPatient }) {
  const flags = redFlagsByPatient[patient.id] ?? [];
  const differentials = differentialsByPatient[patient.id] ?? [];
  const [openDx, setOpenDx] = useState<string | null>(differentials[0]?.id ?? null);
  const [drugId, setDrugId] = useState(drugs[0]!.id);
  const [weight, setWeight] = useState(patient.weight_kg);

  const drug = drugs.find((d) => d.id === drugId) ?? drugs[0]!;
  const dose = computeDose(drug, weight);
  const critical = flags.filter((f) => f.level === "critical").length;

  return (
    <div className="flex flex-col gap-4">
      <GlassCard glow="violet" className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Pill tone={triageTone[patient.triage]}>
              <Siren className="size-3" />
              {TRIAGE_LABELS_HE[patient.triage]}
            </Pill>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              {patient.chief_complaint}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              ניתוח קליני עמוק עבור {patient.display_name} · משקל {patient.weight_kg} ק״ג
            </p>
          </div>
          <div className="glass-panel px-4 py-3 text-center">
            <p className="text-[0.7rem] text-muted-foreground">דגלים אדומים פעילים</p>
            <p className="text-3xl font-semibold tabular-nums">{critical}</p>
          </div>
        </div>
      </GlassCard>

      {/* Red flags */}
      <GlassCard glow="pink" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <AlertTriangle className="size-4 text-destructive" />
          מנגנון דגלים אדומים
        </h2>
        <ul className="mt-4 space-y-2">
          {flags.map((f) => (
            <li
              key={f.id}
              className={cn(
                "rounded-2xl border p-4",
                f.level === "critical"
                  ? "border-destructive/40 bg-destructive/10"
                  : f.level === "warning"
                    ? "border-border bg-white/55"
                    : "border-border bg-white/35",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  {f.level === "cleared" ? (
                    <CheckCircle2 className="size-4 text-primary" />
                  ) : (
                    <AlertTriangle className="size-4 text-destructive" />
                  )}
                  {f.label}
                </p>
                <Pill tone={f.level === "critical" ? "high" : f.level === "warning" ? "medium" : "low"}>
                  {f.level === "critical" ? "קריטי" : f.level === "warning" ? "אזהרה" : "נשלל"}
                </Pill>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{f.detail}</p>
              <p className="mt-2 text-xs font-medium">פעולה: {f.action}</p>
            </li>
          ))}
        </ul>
      </GlassCard>

      {/* Differentials */}
      <GlassCard className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Stethoscope className="size-4 text-primary" />
          אבחנות מבדלות מדורגות
        </h2>
        <ul className="mt-4 space-y-2">
          {differentials.map((d, i) => {
            const open = openDx === d.id;
            return (
              <li key={d.id} className="glass-panel">
                <button
                  type="button"
                  onClick={() => setOpenDx(open ? null : d.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-right"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-white/70 text-xs font-semibold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{d.name}</span>
                      <span className="text-sm font-semibold tabular-nums">
                        {Math.round(d.probability * 100)}%
                      </span>
                    </span>
                    <span className="mt-2 block h-2 overflow-hidden rounded-full bg-white/70">
                      <span
                        className="block h-full rounded-full bg-linear-to-l from-aurora-blue via-aurora-violet to-aurora-pink"
                        style={{ width: `${Math.max(4, Math.round(d.probability * 100))}%` }}
                      />
                    </span>
                  </span>
                  <ChevronLeft className={cn("size-4 shrink-0 transition-transform", open && "-rotate-90")} />
                </button>
                {open ? (
                  <div className="grid gap-3 border-t border-border px-4 py-3 text-xs sm:grid-cols-2">
                    <div>
                      <p className="font-semibold text-primary">תומך באבחנה</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {d.supporting.map((s) => (
                          <li key={s}>• {s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-semibold text-destructive">שולל אבחנה</p>
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {d.against.length ? d.against.map((s) => <li key={s}>• {s}</li>) : <li>• אין ממצא שולל</li>}
                      </ul>
                    </div>
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                      <Pill tone={triageTone[d.urgency]}>{TRIAGE_LABELS_HE[d.urgency]}</Pill>
                      <span className="text-xs font-medium">צעד הבא: {d.nextStep}</span>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </GlassCard>

      {/* Dosing calculator */}
      <GlassCard glow="amber" className="p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Calculator className="size-4 text-primary" />
          מחשבון מינונים mg/kg
        </h2>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="glass-panel block p-3">
            <span className="text-[0.7rem] text-muted-foreground">תרופה</span>
            <select
              value={drugId}
              onChange={(e) => setDrugId(e.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
            >
              {drugs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.form}
                </option>
              ))}
            </select>
          </label>
          <label className="glass-panel block p-3">
            <span className="text-[0.7rem] text-muted-foreground">משקל (ק״ג)</span>
            <input
              type="number"
              min={1}
              max={120}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 0)}
              className="mt-1 w-full bg-transparent text-sm font-semibold tabular-nums outline-none"
            />
          </label>
        </div>

        <input
          type="range"
          min={2}
          max={80}
          step={0.5}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          className="mt-4 w-full accent-[oklch(0.58_0.17_250)]"
          aria-label="משקל"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="glass-panel p-4 text-center">
            <p className="text-[0.7rem] text-muted-foreground">מנה בודדת</p>
            <p className="text-2xl font-semibold tabular-nums">{dose.mg} מ״ג</p>
            <p className="text-[0.65rem] text-muted-foreground">{drug.mgPerKg} mg/kg</p>
          </div>
          <div className="glass-panel p-4 text-center">
            <p className="text-[0.7rem] text-muted-foreground">נפח למתן</p>
            <p className="text-2xl font-semibold tabular-nums">{dose.ml} מ״ל</p>
            <p className="text-[0.65rem] text-muted-foreground">{drug.concentration}mg/5ml</p>
          </div>
          <div className="glass-panel p-4 text-center">
            <p className="text-[0.7rem] text-muted-foreground">תדירות</p>
            <p className="text-2xl font-semibold">{drug.frequency}</p>
            <p className="text-[0.65rem] text-muted-foreground">מקס׳ {drug.maxSingleMg} מ״ג למנה</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {dose.capped ? "⚠️ המנה הוגבלה לתקרת המבוגר. " : ""}
          {drug.note} · החישוב הוא כלי עזר בלבד ודורש אימות קליני.
        </p>
      </GlassCard>
    </div>
  );
}
