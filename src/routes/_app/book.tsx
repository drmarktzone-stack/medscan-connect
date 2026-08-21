import { createFileRoute } from "@tanstack/react-router";
import NelsonBook from "@/pages/NelsonBook";

export const Route = createFileRoute("/_app/book")({
  head: () => ({
    meta: [
      { title: "NelsonBook — DoctorPedAI" },
      { name: "description", content: "כלי NelsonBook של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "NelsonBook — DoctorPedAI" },
      { property: "og:description", content: "כלי NelsonBook של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NelsonBook,
});
