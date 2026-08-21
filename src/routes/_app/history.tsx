import { createFileRoute } from "@tanstack/react-router";
import History from "@/pages/History";

export const Route = createFileRoute("/_app/history")({
  head: () => ({
    meta: [
      { title: "History — DoctorPedAI" },
      { name: "description", content: "כלי History של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "History — DoctorPedAI" },
      { property: "og:description", content: "כלי History של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: History,
});
