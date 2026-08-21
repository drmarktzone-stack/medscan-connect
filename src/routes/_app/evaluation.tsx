import { createFileRoute } from "@tanstack/react-router";
import Evaluation from "@/pages/Evaluation";

export const Route = createFileRoute("/_app/evaluation")({
  head: () => ({
    meta: [
      { title: "Evaluation — DoctorPedAI" },
      { name: "description", content: "כלי Evaluation של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "Evaluation — DoctorPedAI" },
      { property: "og:description", content: "כלי Evaluation של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Evaluation,
});
