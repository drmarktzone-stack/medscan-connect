import { createFileRoute } from "@tanstack/react-router";
import ECGAnalysis from "@/pages/ECGAnalysis";

export const Route = createFileRoute("/_app/ecg")({
  head: () => ({
    meta: [
      { title: "ECGAnalysis — DoctorPedAI" },
      { name: "description", content: "כלי ECGAnalysis של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ECGAnalysis — DoctorPedAI" },
      { property: "og:description", content: "כלי ECGAnalysis של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ECGAnalysis,
});
