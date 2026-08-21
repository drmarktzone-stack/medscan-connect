import { createFileRoute } from "@tanstack/react-router";
import SkinAnalysis from "@/pages/SkinAnalysis";

export const Route = createFileRoute("/_app/skin")({
  head: () => ({
    meta: [
      { title: "SkinAnalysis — DoctorPedAI" },
      { name: "description", content: "כלי SkinAnalysis של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "SkinAnalysis — DoctorPedAI" },
      { property: "og:description", content: "כלי SkinAnalysis של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SkinAnalysis,
});
