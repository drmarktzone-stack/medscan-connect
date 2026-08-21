import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, HeartHandshake, RotateCcw, Siren } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill } from "@/components/glass";
import { triageResult, triageSteps, triageTone } from "@/lib/clinical-data";
import { TRIAGE_LABELS_HE } from "@/types/doctorped";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/parent")({
  head: () => ({
    meta: [
      { title: "פורטל הורים — אשף טריאז׳ | DoctorPedAI" },
      {
        name: "description",
        content:
          "אשף טריאז׳ להורים: שאלות פשוטות שלב אחר שלב, אינדיקטור דחיפות ברור ותקציר ביקור בשפה יומיומית.",
      },
      { property: "og:title", content: "פורטל הורים — אשף טריאז׳ | DoctorPedAI" },
      {
        property: "og:description",
        content: "בדקו תוך דקה אם צריך מיון, ביקור בקופת חולים או טיפול ביתי.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ParentPortal;
});

function ParentPortal() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});

  const done = step >= triageSteps.length;
  const score = Object.values(answers).reduce((a, b) => a + b, 0);
  const result = triageResult(score);
  const current = triageSteps[step];
  const progress = Math.round((Math.min(step, triageSteps.length) / triageSteps.length) * 100);

  function choose(weight: number, label: string) {
    if (!current) return;
    setAnswers((p) => ({ ...p, [current.id]: weight }));
    setLabels((p) => ({ ...p, [current.id]: label }));
    setStep((s) => s + 1);
  }

  function reset() {
    setAnswers({});
    setLabels({});
    setStep(0);
  }

  return (
    <AppShell>
      <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <GlassCard glow="mint" className="p-6">
            <Pill tone="low">
              <HeartHandshake className="size-3" />
              פורטל הורים
            </Pill>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">
              <span className="text-aurora">אשף טריאז׳</span> לילד/ה שלכם
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              ענו על {triageSteps.length} שאלות קצרות ונגיד לכם בשפה פשוטה מה כדאי לעשות עכשיו.
              האשף אינו מחליף רופא — בכל ספק פנו לעזרה רפואית.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/60">
              <div
                className="h-full rounded-full bg-linear-to-l from-aurora-mint via-aurora-blue to-aurora-violet transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[0.7rem] text-muted-foreground">
              שלב {Math.min(step + 1, triageSteps.length)} מתוך {triageSteps.length}
            </p>
          </GlassCard>

          {!done && current ? (
            <GlassCard className="p-6">
              <h2 className="text-xl font-semibold">{current.question}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{current.helper}</p>
              <div className="mt-4 grid gap-2">
                {current.options.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => choose(o.weight, o.label)}
                    className="flex items-center justify-between rounded-2xl border border-border bg-white/50 px-4 py-3.5 text-right text-sm font-medium transition-colors hover:bg-white/85"
                  >
                    <span>{o.label}</span>
                    <span className="flex items-center gap-2">
                      {o.hint ? <Pill tone="high">{o.hint}</Pill> : null}
                      <ArrowLeft className="size-4 text-muted-foreground" />
                    </span>
                  </button>
                ))}
              </div>
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="mt-4 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  <ArrowRight className="size-3" />
                  חזרה לשאלה הקודמת
                </button>
              ) : null}
            </GlassCard>
          ) : (
            <>
              <GlassCard
                glow={result.urgency === "emergency" ? "pink" : result.urgency === "hmo_visit" ? "amber" : "mint"}
                className="p-6"
              >
                <Pill tone={triageTone[result.urgency]}>
                  <Siren className="size-3" />
                  {TRIAGE_LABELS_HE[result.urgency]}
                </Pill>
                <h2 className="mt-3 text-2xl font-semibold">{result.title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{result.message}</p>

                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  {(["emergency", "hmo_visit", "home_care"] as const).map((u) => (
                    <div
                      key={u}
                      className={cn(
                        "rounded-2xl border p-3 text-center text-xs font-semibold",
                        u === result.urgency
                          ? "border-primary/50 bg-primary/15"
                          : "border-border bg-white/40 text-muted-foreground",
                      )}
                    >
                      {TRIAGE_LABELS_HE[u]}
                    </div>
                  ))}
                </div>

                <ul className="mt-5 space-y-2">
                  {result.actions.map((a) => (
                    <li key={a} className="glass-panel px-4 py-3 text-sm">
                      {a}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={reset}
                  className="mt-5 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <RotateCcw className="size-4" />
                  התחלה מחדש
                </button>
              </GlassCard>

              <GlassCard className="p-6">
                <h2 className="text-lg font-semibold">תקציר הביקור בשפה פשוטה</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  סיפרתם שהילד/ה {labels["age"] ?? "בגיל לא ידוע"}, {labels["fever"] ?? "ללא מידע על חום"}, ו
                  {labels["breathing"] ?? "ללא מידע על נשימה"}. לגבי שתייה: {labels["hydration"] ?? "לא צוין"}.
                  ההתנהגות: {labels["behavior"] ?? "לא צוינה"}. פריחה: {labels["rash"] ?? "לא צוינה"}.
                  לפי זה, ההמלצה שלנו היא <span className="font-semibold text-foreground">{result.title}</span>.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  התקציר נשמר כטיוטה הדורשת אימות של רופא/ה (draft_needs_verification) ויוצג לצוות הרפואי בביקור.
                </p>
              </GlassCard>
            </>
          )}
        </div>

        <GlassCard glow="blue" className="h-fit p-5">
          <h2 className="text-sm font-semibold">מתי לגשת למיון מיד</h2>
          <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
            <li>• קושי נשימה משמעותי או שפתיים כחולות</li>
            <li>• פריחה שאינה מחווירה בלחיצת כוס</li>
            <li>• תינוק מתחת לחודשיים עם חום מעל 38°</li>
            <li>• רדמת קיצונית או פרכוס</li>
            <li>• סירוב מוחלט לשתות עם חיתול יבש 8 שעות</li>
          </ul>
          <p className="mt-4 text-[0.7rem] text-muted-foreground">
            במצב חירום חייגו 101 ואל תמתינו לתשובת האשף.
          </p>
        </GlassCard>
      </div>
    </AppShell>
  );
}
