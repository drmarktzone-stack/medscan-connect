import { createFileRoute } from "@tanstack/react-router";
import { UltrasoundPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/us")({
  head: () => ({
    meta: [
      { title: "UltrasoundPage — DoctorPedAI" },
      { name: "description", content: "כלי UltrasoundPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "UltrasoundPage — DoctorPedAI" },
      { property: "og:description", content: "כלי UltrasoundPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UltrasoundPage,
});
