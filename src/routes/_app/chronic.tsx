import { createFileRoute } from "@tanstack/react-router";
import { ChronicPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/chronic")({
  head: () => ({
    meta: [
      { title: "ChronicPage — DoctorPedAI" },
      { name: "description", content: "כלי ChronicPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ChronicPage — DoctorPedAI" },
      { property: "og:description", content: "כלי ChronicPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChronicPage,
});
