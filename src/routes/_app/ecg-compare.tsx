import { createFileRoute } from "@tanstack/react-router";
import ECGComparison from "@/pages/ECGComparison";

export const Route = createFileRoute("/_app/ecg-compare")({
  head: () => ({
    meta: [
      { title: "ECGComparison — DoctorPedAI" },
      { name: "description", content: "כלי ECGComparison של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ECGComparison — DoctorPedAI" },
      { property: "og:description", content: "כלי ECGComparison של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ECGComparison,
});
