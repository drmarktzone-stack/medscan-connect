import { createFileRoute } from "@tanstack/react-router";
import ECGValidation from "@/pages/ECGValidation";

export const Route = createFileRoute("/_app/ecg-validate")({
  head: () => ({
    meta: [
      { title: "ECGValidation — DoctorPedAI" },
      { name: "description", content: "כלי ECGValidation של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ECGValidation — DoctorPedAI" },
      { property: "og:description", content: "כלי ECGValidation של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ECGValidation,
});
