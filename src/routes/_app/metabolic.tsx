import { createFileRoute } from "@tanstack/react-router";
import { MetabolicPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/metabolic")({
  head: () => ({
    meta: [
      { title: "MetabolicPage — DoctorPedAI" },
      { name: "description", content: "כלי MetabolicPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "MetabolicPage — DoctorPedAI" },
      { property: "og:description", content: "כלי MetabolicPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MetabolicPage,
});
