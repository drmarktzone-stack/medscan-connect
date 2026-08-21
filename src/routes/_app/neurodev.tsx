import { createFileRoute } from "@tanstack/react-router";
import { NeurodevPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/neurodev")({
  head: () => ({
    meta: [
      { title: "NeurodevPage — DoctorPedAI" },
      { name: "description", content: "כלי NeurodevPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "NeurodevPage — DoctorPedAI" },
      { property: "og:description", content: "כלי NeurodevPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NeurodevPage,
});
