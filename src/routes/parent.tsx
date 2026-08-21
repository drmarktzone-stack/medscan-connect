import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, HeartHandshake, Loader2, RotateCcw, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { getDoctorPedData, saveDoctorPedEncounter } from "@/lib/doctorped.functions";
import { runDoctorPedAI } from "@/lib/medscan/doctorped/index.js";

export const Route = createFileRoute("/parent")({
  head: () => ({ meta: [
    { title: "פורטל הורים — DoctorPedAI" },
    { name: "description", content: "אשף טריאז׳ בטוח להורים עם הנחיית חירום, קופת חולים או טיפול ביתי בשפה פשוטה." },
    { property: "og:title", content: "פורטל הורים — DoctorPedAI" },
    { property: "og:description", content: "אשף טריאז׳ בטוח לילדים בשפה פשוטה." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ParentPortal,
});

const symptoms = [
  { key: "fever", label: "חום" }, { key: "cough", label: "שיעול" }, { key: "cold", label: "צינון" },
  { key: "rash", label: "פריחה" }, { key: "non-blanching rash", label: "פריחה שאינה מלבינה" },
  { key: "vomiting", label: "הקאות" }, { key: "diarrhea", label: "שלשול" }, { key: "ear pain", label: "כאב אוזן" },
  { key: "abdominal pain", label: "כאב בטן" }, { key: "lethargy", label: "ישנוניות חריגה" },
  { key: "difficulty breathing", label: "קושי בנשימה" }, { key: "seizure", label: "פרכוס" },
  { key: "head trauma", label: "חבלת ראש" }, { key: "button battery", label: "בליעת סוללת כפתור" },
] as const;

type ParentResult = {
  ok?: boolean; emergency?: boolean; parent_plan_he?: string; parent_note_he?: string;
  triage?: { urgency?: "emergency" | "hmo_visit" | "home_care"; flags?: Array<{ flag_key?: string }> };
  engines_run?: Array<Record<string, unknown>>; hides_mg?: boolean;
};

const urgencyCopy = {
  emergency: { label: "פנו למיון עכשיו", body: "זוהה סימן שמחייב הערכה רפואית דחופה. אל תמתינו להמשך האשף.", tone: "high" as const },
  hmo_visit: { label: "פנו לקופת החולים", body: "מומלץ לתאם בדיקה רפואית בהקדם. אם יש החמרה, פנו לעזרה דחופה.", tone: "medium" as const },
  home_care: { label: "אפשר להתחיל בטיפול ביתי", body: "ניתן לעקוב בבית כרגע, עם שתייה, מנוחה ומעקב אחר שינוי במצב.", tone: "low" as const },
};

function ParentPortal() {
  const navigate = useNavigate();
  const { user, role, loading: authLoading } = useAuth();
  const getData = useServerFn(getDoctorPedData);
  const saveEncounter = useServerFn(saveDoctorPedEncounter);
  const familyData = useQuery({ queryKey: ["parent-data", user?.id], queryFn: () => getData(), enabled: Boolean(user) });
  const [step, setStep] = useState(0);
  const [ageMonths, setAgeMonths] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<ParentResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/auth" });
  }, [authLoading, navigate, user]);

  const toggle = (key: string) => setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const run = async () => {
    const next = runDoctorPedAI({ persona: "parent", integrationMode: "unified", patient: { age_months: Number(ageMonths) }, findings: selected, presentation: selected.join(", "), proceed: true, locale: "he", mode: "development" }) as ParentResult;
    setResult(next);
    setStep(2);
    const linkedPatient = familyData.data?.patients[0];
    if (!user || role !== "parent" || !next.triage?.urgency || !linkedPatient) return;
    setSaving(true);
    try {
      await saveEncounter({ data: {
        patient_id: linkedPatient.id, locale: "he", dir: "rtl", rls_role: "parent", encounter_type: "previsit",
        triage_urgency: next.triage.urgency, engines_run: next.engines_run ?? [],
        output_summary: { ok: next.ok ?? false, emergency: next.emergency ?? false, symptoms: selected },
        verification_status: "draft_needs_verification",
      } });
    } catch {
      // The result remains available if no guardian-linked patient exists yet.
    } finally { setSaving(false); }
  };

  if (authLoading) return <main className="flex min-h-screen items-center justify-center"><Loader2 className="size-7 animate-spin text-primary" /></main>;
  if (!user) return null;
  const urgency = result?.triage?.urgency ?? "hmo_visit";
  const copy = urgencyCopy[urgency];

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-4">
        <GlassCard glow="mint" className="p-6 sm:p-8">
          <Pill tone="low"><HeartHandshake className="size-3" /> פורטל המשפחה</Pill>
          <h1 className="mt-4 text-3xl font-semibold">מה עובר על הילד/ה?</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">כמה שאלות קצרות יעזרו לבחור את רמת הדחיפות. לא נציג אבחנה או מינוני תרופות.</p>
          {role === "parent" && familyData.data && !familyData.data.patients.length ? <p className="mt-3 rounded-xl border border-border bg-background/45 p-3 text-xs text-muted-foreground">החשבון עדיין אינו מקושר לילד/ה. אפשר לבצע את האשף, אך התקציר לא יישמר עד שהמרפאה תשלים את הקישור.</p> : null}
          <div className="mt-5 flex gap-2">{[0, 1, 2].map((item) => <span key={item} className={item <= step ? "h-2 flex-1 rounded-full bg-primary" : "h-2 flex-1 rounded-full bg-muted"} />)}</div>
        </GlassCard>

        {step === 0 ? <GlassCard className="p-6 sm:p-8">
          <p className="text-xs font-semibold text-muted-foreground">שלב 1 מתוך 3</p><h2 className="mt-2 text-xl font-semibold">בן/בת כמה הילד/ה?</h2>
          <label className="mt-5 block"><span className="text-xs text-muted-foreground">גיל בחודשים</span><input type="number" min="0" max="216" value={ageMonths} onChange={(event) => setAgeMonths(event.target.value)} className="mt-2 h-14 w-full rounded-2xl border border-border bg-background/50 px-4 text-2xl font-semibold outline-none focus:ring-2 focus:ring-ring" /></label>
          <Button className="mt-6 h-12 w-full rounded-full" disabled={!ageMonths || Number(ageMonths) < 0} onClick={() => setStep(1)}>המשך <ArrowLeft /></Button>
        </GlassCard> : null}

        {step === 1 ? <GlassCard className="p-6 sm:p-8">
          <p className="text-xs font-semibold text-muted-foreground">שלב 2 מתוך 3</p><h2 className="mt-2 text-xl font-semibold">מה אתם רואים עכשיו?</h2><p className="mt-1 text-xs text-muted-foreground">אפשר לבחור יותר מתסמין אחד.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">{symptoms.map((symptom) => <Button key={symptom.key} type="button" variant={selected.includes(symptom.key) ? "default" : "outline"} className="h-auto min-h-12 whitespace-normal rounded-2xl px-3 py-3" onClick={() => toggle(symptom.key)}>{symptom.label}</Button>)}</div>
          <div className="mt-6 flex gap-2"><Button variant="ghost" className="rounded-full" onClick={() => setStep(0)}>חזרה</Button><Button className="h-12 flex-1 rounded-full" disabled={!selected.length} onClick={() => void run()}>בדיקת דחיפות <ShieldCheck /></Button></div>
        </GlassCard> : null}

        {step === 2 && result ? <>
          <GlassCard glow={urgency === "emergency" ? "pink" : urgency === "home_care" ? "mint" : "amber"} className="p-6 sm:p-8">
            <Pill tone={copy.tone}>{urgency === "emergency" ? <AlertTriangle className="size-3" /> : <CheckCircle2 className="size-3" />}{copy.label}</Pill>
            <h2 className="mt-4 text-2xl font-semibold">{copy.label}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{result.parent_plan_he || copy.body}</p>
            {urgency === "emergency" ? <div className="mt-5 rounded-2xl bg-destructive p-4 text-destructive-foreground"><p className="font-semibold">במצב חירום התקשרו 101</p><p className="mt-1 text-xs">קושי נשימה, כיחלון, פרכוס או חוסר תגובה מחייבים עזרה מיידית.</p></div> : null}
          </GlassCard>
          <GlassCard className="p-6"><h2 className="font-semibold">תקציר פשוט</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">ילד/ה בגיל {ageMonths} חודשים. דווחו: {selected.map((key) => symptoms.find((item) => item.key === key)?.label ?? key).join(", ")}. {copy.body}</p><p className="mt-3 text-xs text-muted-foreground">התקציר נשמר כטיוטה הדורשת אימות, כאשר החשבון מקושר למטופל. מידע על מינונים מוסתר מהורה.</p><Button variant="outline" className="mt-5 w-full rounded-full" disabled={saving} onClick={() => { setResult(null); setSelected([]); setStep(0); }}><RotateCcw /> התחלה מחדש</Button></GlassCard>
        </> : null}
      </div>
    </AppShell>
  );
}