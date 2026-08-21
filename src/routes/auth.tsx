import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HeartPulse, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass";
import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [
    { title: "התחברות מאובטחת — DoctorPedAI" },
    { name: "description", content: "התחברות מאובטחת לפלטפורמת DoctorPedAI לצוותים רפואיים ולהורים." },
    { property: "og:title", content: "התחברות — DoctorPedAI" },
    { property: "og:description", content: "גישה מאובטחת ל-DoctorPedAI." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
      await navigate({ to: role?.role === "clinician" ? "/doctorped" : "/parent" });
    });
  }, [navigate]);

  const signIn = async () => {
    setLoading(true);
    setError("");
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      setError(result.error.message);
      setLoading(false);
      return;
    }
    if (!result.redirected) window.location.assign("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <GlassCard glow="blue" className="w-full max-w-md p-8 text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-3xl border border-border bg-background/60 shadow-lg backdrop-blur-2xl">
          <HeartPulse className="size-8 text-primary" />
        </div>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-muted-foreground"><Sparkles className="size-3" /> MEDSCAN CLINICAL PLATFORM</p>
        <h1 className="mt-2 text-4xl font-semibold text-aurora">DoctorPedAI</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">גישה מאובטחת למרחב הקליני ולפורטל המשפחה, בהתאם להרשאה שלך.</p>
        <Button className="mt-7 h-12 w-full rounded-full text-base" onClick={signIn} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          המשך עם Google
        </Button>
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </GlassCard>
    </main>
  );
}