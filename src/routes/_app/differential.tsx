import { createFileRoute } from "@tanstack/react-router";
import Differential from "@/pages/Differential";

export const Route = createFileRoute("/_app/differential")({
  head: () => ({
    meta: [
      { title: "Differential — DoctorPedAI" },
      { name: "description", content: "כלי Differential של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "Differential — DoctorPedAI" },
      { property: "og:description", content: "כלי Differential של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Differential,
});
