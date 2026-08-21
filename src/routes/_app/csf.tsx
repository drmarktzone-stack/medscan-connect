import { createFileRoute } from "@tanstack/react-router";
import { CsfPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/csf")({
  head: () => ({
    meta: [
      { title: "CsfPage — DoctorPedAI" },
      { name: "description", content: "כלי CsfPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "CsfPage — DoctorPedAI" },
      { property: "og:description", content: "כלי CsfPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CsfPage,
});
