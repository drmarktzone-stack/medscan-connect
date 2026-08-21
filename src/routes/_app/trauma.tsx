import { createFileRoute } from "@tanstack/react-router";
import { TraumaPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/trauma")({
  head: () => ({
    meta: [
      { title: "TraumaPage — DoctorPedAI" },
      { name: "description", content: "כלי TraumaPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "TraumaPage — DoctorPedAI" },
      { property: "og:description", content: "כלי TraumaPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TraumaPage,
});
