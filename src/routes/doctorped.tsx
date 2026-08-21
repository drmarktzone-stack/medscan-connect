import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Baby, Calculator, CheckCircle2, ChevronLeft, FlaskConical, HeartPulse, Loader2, Play, Save, ShieldAlert, Sparkles, Stethoscope } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getDoctorPedData, saveDoctorPedEncounter } from "@/lib/doctorped.functions";
import { runDoctorPedAI, computeDose, listToolboxModules } from "@/lib/medscan/doctorped/index.js";
import { useAuth } from "@/hooks/use-auth";
import type { DoseRecord } from "@/types/doctorped";

export const Route = createFileRoute("/doctorped")({
  head: () => ({ meta: [
    { title: "Clinician Workbench — DoctorPedAI" },
    { name: "description", content: "סביבת עבודה קלינית צפופה עם MedScan, טריאז׳, דגלים אדומים ומינונים מאומתים." },
    { property: "og:title", content: "Clinician Workbench — DoctorPedAI" },
    { property: "og:description", content: "MedScan ותמיכת החלטה קלינית לרפואת ילדים." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: DoctorPedWorkbench,
});

type EngineResult = {
  ok?: boolean;
  awaiting_anamnesis?: boolean;
  emergency?: boolean;
  triage?: { urgency?: "emergency" | "hmo_visit" | "home_care"; flags?: Array<{ flag_key?: string }> };
  anamnesis?: { questions?: Array<{ id: string; question_he?: string }> };
  red_flags?: Array<{ rule_key?: string; title_he?: string; conclusion_he?: string; severity?: string }>;
  differential?: Array<{ direction_id?: string; diagnosis_direction_he?: string; must_not_miss?: boolean; rank?: number; rationale_he?: string }>;
  recommended_tests?: Array<{ test_he?: string; rationale_he?: string }>;
  triggered_modules?: string[];
  engines_run?: Array<Record<string, unknown>>;
  dosing?: Array<Record<string, unknown>>;
  encounter?: Record<string, unknown>;
  disclaimer_he?: string;
};

function ageInMonths(birthDate: string | null) {
  if (!birthDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(birthDate).getTime()) / 2_629_746_000));
}

function DoctorPedWorkbench() {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const getData = useServerFn(getDoctorPedData);
  const saveEncounter = useServerFn(saveDoctorPedEncounter);
  const query = useQuery({ queryKey: ["doctorped-data", user?.id], queryFn: () => getData(), enabled: Boolean(user) });
  const [patientId, setPatientId] = useState("");
  const [presentation, setPresentation] = useState("");
  const [findings, setFindings] = useState("");
  const [proceed, setProceed] = useState(false);
  const [result, setResult] = useState<EngineResult | null>(null);
  const [selectedDose, setSelectedDose] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/auth" });
    if (!authLoading && role === "parent") void navigate({ to: "/parent" });
  }, [authLoading, navigate, role, user]);

  useEffect(() => {
    const first = query.data?.patients[0];
    if (!patientId && first) setPatientId(first.id);
    const firstDose = query.data?.doses[0];
    if (!selectedDose && firstDose) setSelectedDose(firstDose.id);
  }, [patientId, query.data, selectedDose]);

  const patient = query.data?.patients.find((item) => item.id === patientId) ?? query.data?.patients[0];
  const patientEncounters = query.data?.encounters.filter((item) => item.patient_id === patient?.id) ?? [];
  const toolbox = useMemo(() => listToolboxModules(), []);
  const doseRecord = query.data?.doses.find((item) => item.id === selectedDose) as DoseRecord | undefined;
  const ageMonths = ageInMonths(patient?.birth_date ?? null);
  const dose = doseRecord && patient?.weight_kg ? computeDose({ weight_kg: Number(patient.weight_kg), age_days: ageMonths === null ? null : ageMonths * 30.4375, doseRecord, persona: "clinician" }) : null;

  const run = () => {
    if (!patient || !presentation.trim()) return;
    setSaved(false);
    const next = runDoctorPedAI({
      persona: "clinician",
      integrationMode: "unified",
      patient: { age_months: ageMonths ?? undefined, birth_date: patient.birth_date ?? undefined, weight_kg: patient.weight_kg ?? undefined, height_cm: patient.height_cm ?? undefined, sex: patient.sex ?? undefined },
      presentation,
      findings: findings.split(/[\n,]/).map((item) => item.trim()).filter(Boolean),
      proceed,
      doseRecords: query.data?.doses ?? [],
      locale: "he",
      mode: "development",
    }) as EngineResult;
    setResult(next);
  };

  const save = async () => {
    if (!patient || !result) return;
    setSaving(true);
    try {
      await saveEncounter({ data: {
        patient_id: patient.id,
        locale: "he",
        dir: "rtl",
        rls_role: "clinician",
        encounter_type: "clinician",
        triage_urgency: result.triage?.urgency ?? null,
        engines_run: result.engines_run ?? [],
        output_summary: { ok: result.ok ?? false, emergency: result.emergency ?? false, presentation, red_flags: result.red_flags?.length ?? 0 },
        verification_status: "draft_needs_verification",
      } });
      setSaved(true);
      await query.refetch();
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || query.isLoading) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="size-7 animate-spin text-primary" /></main>;
  if (!user || role !== "clinician") return null;

  return (
    <AppShell>
      <div className="grid gap-4 xl:grid-cols-[19rem_minmax(32rem,1fr)_21rem]">
        <aside className="space-y-4">
          <GlassCard glow="blue" className="p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">מטופל פעיל</h2><Baby className="size-4 text-primary" /></div>
            {query.data?.patients.length ? (
              <select value={patient?.id ?? ""} onChange={(event) => { setPatientId(event.target.value); setResult(null); }} className="mt-3 w-full rounded-xl border border-border bg-background/55 px-3 py-2 text-sm outline-none">
                {query.data.patients.map((item) => <option key={item.id} value={item.id}>{item.display_name ?? "מטופל ללא שם"}</option>)}
              </select>
            ) : <p className="mt-3 text-sm text-muted-foreground">אין מטופלים זמינים לפי ההרשאה הנוכחית.</p>}
            {patient ? <div className="mt-4 space-y-3">
              <div><p className="text-xl font-semibold">{patient.display_name ?? "מטופל"}</p><p className="text-xs text-muted-foreground">{ageMonths === null ? "גיל לא הוזן" : `${ageMonths} חודשים`} · {patient.sex === "female" ? "נקבה" : patient.sex === "male" ? "זכר" : "מין לא צוין"}</p></div>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="משקל" value={patient.weight_kg ? `${patient.weight_kg} ק״ג` : "—"} />
                <Metric label="גובה" value={patient.height_cm ? `${patient.height_cm} ס״מ` : "—"} />
              </div>
            </div> : null}
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><HeartPulse className="size-4 text-primary" /> היסטוריה קלינית</h3>
            <div className="mt-3 space-y-2">
              {patientEncounters.length ? patientEncounters.slice(0, 8).map((encounter) => (
                <div key={encounter.id} className="glass-panel p-3">
                  <div className="flex justify-between gap-2"><Pill tone={encounter.triage_urgency === "emergency" ? "high" : encounter.triage_urgency === "hmo_visit" ? "medium" : "low"}>{encounter.triage_urgency ?? "ללא טריאז׳"}</Pill><span className="text-[0.65rem] text-muted-foreground">{new Date(encounter.created_at).toLocaleDateString("he-IL")}</span></div>
                  <p className="mt-2 text-xs text-muted-foreground">{encounter.encounter_type === "previsit" ? "טרום ביקור מההורה" : "הערכה קלינית"}</p>
                </div>
              )) : <p className="text-xs text-muted-foreground">אין מפגשים קודמים.</p>}
            </div>
          </GlassCard>

          <GlassCard glow="mint" className="p-4">
            <h3 className="text-sm font-semibold">מדדי גדילה</h3>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">המערכת לא ממציאה אחוזונים. להצגת אחוזון נדרשת טבלת LMS מאומתת; הערכים הגולמיים מוצגים למעלה.</p>
          </GlassCard>
        </aside>

        <section className="space-y-4">
          <GlassCard glow="violet" className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><Pill><Sparkles className="size-3" /> מנוע MedScan מקורי</Pill><h1 className="mt-3 text-3xl font-semibold">Clinician Workbench</h1><p className="mt-1 text-sm text-muted-foreground">טריאז׳ דטרמיניסטי, אנמנזה פעילה ומנגנון Must-Not-Miss.</p></div>
              {result?.triage?.urgency ? <Pill tone={result.emergency ? "high" : result.triage.urgency === "hmo_visit" ? "medium" : "low"}>{result.triage.urgency}</Pill> : null}
            </div>
            <div className="mt-5 space-y-3">
              <Textarea value={presentation} onChange={(event) => setPresentation(event.target.value)} placeholder="תלונה עיקרית ומהלך המחלה..." className="min-h-24 bg-background/45" />
              <Textarea value={findings} onChange={(event) => setFindings(event.target.value)} placeholder="ממצאים, כל ממצא בשורה נפרדת..." className="min-h-20 bg-background/45" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={proceed} onChange={(event) => setProceed(event.target.checked)} /> המשך לניתוח גם אם חסרים פרטי אנמנזה</label>
                <Button onClick={run} disabled={!patient || !presentation.trim()} className="rounded-full"><Play /> הפעל ניתוח קליני</Button>
              </div>
            </div>
          </GlassCard>

          {result?.awaiting_anamnesis ? <GlassCard glow="amber" className="p-5"><h2 className="font-semibold">שאלות אנמנזה נדרשות</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{result.anamnesis?.questions?.map((question) => <div key={question.id} className="glass-panel p-3 text-sm">{question.question_he ?? question.id}</div>)}</div></GlassCard> : null}

          {result && !result.awaiting_anamnesis ? <>
            <GlassCard glow="pink" className="p-5">
              <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldAlert className="size-5 text-destructive" /> Must-Not-Miss / דגלים אדומים</h2><Pill tone={result.emergency ? "high" : "low"}>{result.emergency ? "דחוף" : "ללא דגל חירום"}</Pill></div>
              <div className="mt-3 space-y-2">{result.red_flags?.length ? result.red_flags.map((flag, index) => <div key={flag.rule_key ?? index} className="rounded-xl border border-destructive/25 bg-destructive/10 p-3"><p className="text-sm font-semibold">{flag.title_he ?? flag.conclusion_he ?? flag.rule_key}</p><p className="mt-1 text-xs text-muted-foreground">{flag.conclusion_he}</p></div>) : <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="size-4 text-primary" /> לא זוהו דגלים אדומים מהמידע שהוזן.</p>}</div>
            </GlassCard>
            <GlassCard className="p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold"><Stethoscope className="size-5 text-primary" /> אבחנה מבדלת מדורגת</h2>
              <div className="mt-3 space-y-2">{result.differential?.length ? result.differential.map((item, index) => <div key={item.direction_id ?? index} className="glass-panel flex items-start gap-3 p-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{item.rank ?? index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{item.diagnosis_direction_he ?? "כיוון אבחנתי"}</p><p className="mt-1 text-xs text-muted-foreground">{item.rationale_he ?? "הסתברות אינה מכוילת; נדרש אימות קליני."}</p></div>{item.must_not_miss ? <Pill tone="high">אסור לפספס</Pill> : null}</div>) : <p className="text-sm text-muted-foreground">אין בסיס ידע מאומת מספיק להצגת אבחנה מבדלת. המערכת אינה משלימה מידע חסר.</p>}</div>
            </GlassCard>
            <div className="flex justify-end"><Button onClick={save} disabled={saving || saved} className="rounded-full">{saving ? <Loader2 className="animate-spin" /> : saved ? <CheckCircle2 /> : <Save />}{saved ? "המפגש נשמר" : "שמור טיוטת מפגש"}</Button></div>
          </> : null}
        </section>

        <aside className="space-y-4">
          <GlassCard glow="blue" className="p-4">
            <h2 className="flex items-center gap-2 font-semibold"><FlaskConical className="size-4 text-primary" /> מודולי MedScan</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">{toolbox.map((module) => {
              const active = result?.triggered_modules?.includes(module.id);
              return <div key={module.id} className={active ? "rounded-xl border border-primary/35 bg-primary/15 p-3" : "glass-panel p-3"}><p className="text-xs font-semibold">{module.title_he}</p><p className="mt-1 text-[0.65rem] text-muted-foreground">{active ? "הופעל בניתוח" : "זמין לפי טריגר קליני"}</p></div>;
            })}</div>
          </GlassCard>

          <GlassCard glow="amber" className="p-4">
            <h2 className="flex items-center gap-2 font-semibold"><Calculator className="size-4 text-primary" /> מינון mg/kg מאומת</h2>
            {query.data?.doses.length ? <>
              <select value={selectedDose} onChange={(event) => setSelectedDose(event.target.value)} className="mt-3 w-full rounded-xl border border-border bg-background/55 px-3 py-2 text-sm outline-none">{query.data.doses.map((record) => <option key={record.id} value={record.id}>{record.drug_name_he ?? record.drug_key}</option>)}</select>
              {dose?.ok ? <div className="mt-3 rounded-2xl border border-border bg-background/45 p-4 text-center"><p className="text-xs text-muted-foreground">מנה מחושבת למשקל {patient?.weight_kg ?? "—"} ק״ג</p><p className="mt-1 text-3xl font-semibold tabular-nums">{dose.value} <span className="text-sm">mg/dose</span></p><p className="mt-2 text-[0.68rem] text-muted-foreground">{dose.formula_source}</p></div> : <p className="mt-3 text-xs text-muted-foreground">{dose?.message_he ?? "לא ניתן לחשב ללא משקל תקין."}</p>}
            </> : <p className="mt-3 text-xs leading-5 text-muted-foreground">אין רשומות מינון בסטטוס verified. המנוע מסרב לחשב מינון לא מאומת.</p>}
          </GlassCard>

          {query.isError ? <GlassCard glow="pink" className="p-4"><p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="size-4" /> לא ניתן לטעון נתונים חיים.</p></GlassCard> : null}
        </aside>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="glass-panel p-3"><p className="text-[0.65rem] text-muted-foreground">{label}</p><p className="mt-1 font-semibold tabular-nums">{value}</p></div>;
}