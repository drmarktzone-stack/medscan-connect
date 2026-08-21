import { createFileRoute } from "@tanstack/react-router";
import { ToxicologyPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/tox")({
  head: () => ({
    meta: [
      { title: "ToxicologyPage — DoctorPedAI" },
      { name: "description", content: "כלי ToxicologyPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ToxicologyPage — DoctorPedAI" },
      { property: "og:description", content: "כלי ToxicologyPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ToxicologyPage,
});
