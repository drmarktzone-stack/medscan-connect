import { createFileRoute } from "@tanstack/react-router";
import { EegPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/eeg")({
  head: () => ({
    meta: [
      { title: "EegPage — DoctorPedAI" },
      { name: "description", content: "כלי EegPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "EegPage — DoctorPedAI" },
      { property: "og:description", content: "כלי EegPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EegPage,
});
