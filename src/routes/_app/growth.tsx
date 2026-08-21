import { createFileRoute } from "@tanstack/react-router";
import { GrowthPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/growth")({
  head: () => ({
    meta: [
      { title: "GrowthPage — DoctorPedAI" },
      { name: "description", content: "כלי GrowthPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "GrowthPage — DoctorPedAI" },
      { property: "og:description", content: "כלי GrowthPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GrowthPage,
});
