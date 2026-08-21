import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "DoctorPedAI — תמיכת החלטה ברפואת ילדים" },
    { name: "description", content: "פלטפורמת MedScan מאובטחת לתמיכה בהחלטות קליניות ברפואת ילדים." },
    { property: "og:title", content: "DoctorPedAI" },
    { property: "og:description", content: "תמיכת החלטה קלינית מתקדמת ברפואת ילדים." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: EntryRoute,
});

function EntryRoute() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    void navigate({ to: !user ? "/auth" : role === "clinician" ? "/doctorped" : "/parent", replace: true });
  }, [loading, navigate, role, user]);
  return <main className="flex min-h-screen items-center justify-center"><Loader2 className="size-7 animate-spin text-primary" /><span className="sr-only">טוען</span></main>;
}