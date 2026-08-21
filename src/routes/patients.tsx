import { createFileRoute } from "@tanstack/react-router";
import { Baby, Scale, User } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { GlassCard, Pill } from "@/components/glass";
import { ageLabel, patients } from "@/lib/doctorped-data";

export const Route = createFileRoute("/patients")({
  head: () => ({
    meta: [
      { title: "מטופלים — DoctorPedAI" },
      { name: "description", content: "רשימת המטופלים במעקב DoctorPedAI, כולל גיל, משקל ומועד ביקור אחרון." },
      { property: "og:title", content: "מטופלים — DoctorPedAI" },
      { property: "og:description", content: "רשימת המטופלים במעקב, גיל, משקל ומועד ביקור אחרון." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientsPage,
});

function PatientsPage() {
  return (
    <AppShell>
      <div className="grid gap-4">
        <GlassCard glow="mint" className="p-7">
          <h1 className="text-3xl font-semibold tracking-tight">מטופלים</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {patients.length} ילדים במעקב פעיל
          </p>
        </GlassCard>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((p) => (
            <GlassCard key={p.id} className="p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-2xl border border-border bg-white/10">
                  <Baby className="size-5" />
                </span>
                <div>
                  <p className="font-semibold">{p.full_name}</p>
                  <p className="text-xs text-muted-foreground">{ageLabel(p.age_months)}</p>
                </div>
              </div>

              <dl className="mt-5 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <Scale className="size-4" /> משקל
                  </dt>
                  <dd>{p.weight_kg} ק״ג</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="flex items-center gap-2 text-muted-foreground">
                    <User className="size-4" /> אפוטרופוס
                  </dt>
                  <dd>{p.guardian}</dd>
                </div>
              </dl>

              <div className="mt-5">
                <Pill>ביקור אחרון · {p.last_visit}</Pill>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
