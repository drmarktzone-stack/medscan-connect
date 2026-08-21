import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Brain, Send } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill } from "@/components/glass";

export const Route = createFileRoute("/assistant")({
  head: () => ({
    meta: [
      { title: "עוזר AI — DoctorPedAI" },
      { name: "description", content: "הזן תסמינים ומדדים וקבל ניתוח קליני מדורג עם רמות ודאות ודגלים אדומים." },
      { property: "og:title", content: "עוזר AI — DoctorPedAI" },
      { property: "og:description", content: "ניתוח קליני מדורג עם רמות ודאות ודגלים אדומים." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AssistantPage,
});

const suggestions = [
  "חום 38.9° מעל 72 שעות, גיל 8 חודשים",
  "פריחה מקולופפולרית לאחר חום",
  "שיעול לילי חוזר עם צפצופים",
  "כאבי בטן פריאומביליקליים חוזרים",
];

function AssistantPage() {
  const [input, setInput] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  return (
    <AppShell>
      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <GlassCard glow="violet" className="p-7">
          <Pill>
            <Brain className="size-3" />
            מנוע ניתוח קליני
          </Pill>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">עוזר AI</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            תארו את התמונה הקלינית — גיל, תסמינים, משך ומדדים חיוניים.
          </p>

          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) setSubmitted(input.trim());
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              placeholder="לדוגמה: תינוקת בת 8 חודשים, חום 39.2° מזה 3 ימים, אכילה ירודה…"
              className="w-full resize-none rounded-2xl border border-border bg-white/5 p-4 text-sm outline-hidden backdrop-blur-xl placeholder:text-muted-foreground focus:ring-3 focus:ring-primary/50"
            />
            <button
              type="submit"
              className="mt-4 flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Send className="size-4" />
              נתח מקרה
            </button>
          </form>

          <div className="mt-6 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => setInput(s)}
                className="rounded-full border border-border bg-white/5 px-3.5 py-1.5 text-xs text-muted-foreground backdrop-blur-xl transition-colors hover:bg-white/15 hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="p-7">
          <h2 className="text-lg font-semibold">תוצאת ניתוח</h2>
          {submitted ? (
            <div className="mt-4 space-y-4 text-sm">
              <p className="rounded-2xl border border-border bg-white/5 p-4 text-muted-foreground">
                {submitted}
              </p>
              <div className="rounded-2xl border border-border bg-white/5 p-4">
                <Pill tone="high">דחיפות גבוהה</Pill>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  חיבור מנוע ה-AI יופעל לאחר שהסכמה של מסד הנתונים תתווסף לפרויקט. כרגע מוצגת
                  תצוגה מייצגת של מבנה התשובה: אבחנות מבדלות מדורגות, דגלים אדומים והמלצות בירור.
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              עדיין לא בוצע ניתוח. הזינו תמונה קלינית משמאל.
            </p>
          )}
        </GlassCard>
      </div>
    </AppShell>
  );
}
