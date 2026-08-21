import { createFileRoute } from "@tanstack/react-router";
import RadiologyAnalysis from "@/pages/RadiologyAnalysis";

export const Route = createFileRoute("/_app/radiology")({
  head: () => ({
    meta: [
      { title: "RadiologyAnalysis — DoctorPedAI" },
      { name: "description", content: "כלי RadiologyAnalysis של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "RadiologyAnalysis — DoctorPedAI" },
      { property: "og:description", content: "כלי RadiologyAnalysis של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RadiologyAnalysis,
});
