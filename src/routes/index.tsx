import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Sparkles, TrendingUp } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill, StatTile } from "@/components/glass";
import { cases, severityLabel, statusLabel, weeklyVolume } from "@/lib/doctorped-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DoctorPedAI — לוח בקרה קליני לרפואת ילדים" },
      {
        name: "description",
        content:
          "לוח בקרה של DoctorPedAI: מקרים פעילים, ניתוחי בינה מלאכותית ומעקב מטופלים ברפואת ילדים.",
      },
      { property: "og:title", content: "DoctorPedAI — לוח בקרה קליני לרפואת ילדים" },
      {
        property: "og:description",
        content: "מקרים פעילים, ניתוחי AI ומעקב מטופלים ברפואת ילדים.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const max = Math.max(...weeklyVolume.map((d) => d.value));
  const openCases = cases.filter((c) => c.status !== "closed");

  return (
    <AppShell>
      <section className="grid gap-4">
        <GlassCard glow="violet" className="p-8">
          <Pill>
            <Sparkles className="size-3" />
            מנוע ניתוח פעיל
          </Pill>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            <span className="text-aurora">בינה קלינית</span> לרפואת ילדים
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            DoctorPedAI מנתח תסמינים, מדדים חיוניים והיסטוריה רפואית כדי להציע כיווני
            בירור מדורגים לפי דחיפות — עם שקיפות מלאה על רמת הוודאות.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/assistant"
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              פתח ניתוח חדש
            </Link>
            <Link
              to="/cases"
              className="flex items-center gap-2 rounded-full border border-border bg-white/10 px-5 py-2.5 text-sm font-semibold backdrop-blur-xl transition-colors hover:bg-white/20"
            >
              לכל המקרים
              <ArrowLeft className="size-4" />
            </Link>
          </div>
        </GlassCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile glow="blue" label="מקרים פעילים" value={String(openCases.length)} sub="דורשים סקירה" />
          <StatTile glow="mint" label="דיוק ממוצע" value="86%" sub="30 ימים אחרונים" />
          <StatTile glow="amber" label="זמן תגובה" value="4.2 שנ׳" sub="לניתוח מלא" />
          <StatTile glow="pink" label="דגלים אדומים" value="2" sub="הופנו לרופא בכיר" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <GlassCard className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">מקרים אחרונים</h2>
              <Pill>
                <TrendingUp className="size-3" />
                שבוע נוכחי
              </Pill>
            </div>
            <ul className="mt-4 space-y-3">
              {cases.map((c) => (
                <li
                  key={c.id}
                  className="rounded-2xl border border-border bg-white/5 p-4 backdrop-blur-xl"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{c.patient_name}</p>
                      <p className="text-xs text-muted-foreground">{c.chief_complaint}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Pill tone={c.severity}>{severityLabel[c.severity]}</Pill>
                      <Pill>{statusLabel[c.status]}</Pill>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{c.summary}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-aurora-blue via-aurora-violet to-aurora-pink"
                      style={{ width: `${Math.round(c.confidence * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">
                    ודאות המודל {Math.round(c.confidence * 100)}%
                  </p>
                </li>
              ))}
            </ul>
          </GlassCard>

          <GlassCard glow="blue" className="p-6">
            <h2 className="text-lg font-semibold">נפח ניתוחים שבועי</h2>
            <div className="mt-6 flex h-52 items-end gap-3">
              {weeklyVolume.map((d) => (
                <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <div
                    className="w-full min-h-2 rounded-t-xl border border-border bg-linear-to-t from-aurora-blue/40 via-aurora-violet/70 to-aurora-pink/90 backdrop-blur-xl"
                    style={{ height: `${Math.round((d.value / max) * 88)}%` }}
                  />
                  <span className="text-xs text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </section>
    </AppShell>
  );
}
