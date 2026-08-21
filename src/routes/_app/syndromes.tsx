import { createFileRoute } from "@tanstack/react-router";
import { SyndromesPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/syndromes")({
  head: () => ({
    meta: [
      { title: "SyndromesPage — DoctorPedAI" },
      { name: "description", content: "כלי SyndromesPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "SyndromesPage — DoctorPedAI" },
      { property: "og:description", content: "כלי SyndromesPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SyndromesPage,
});
