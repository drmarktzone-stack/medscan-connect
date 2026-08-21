import { createFileRoute } from "@tanstack/react-router";
import VerifyKnowledge from "@/pages/VerifyKnowledge";

export const Route = createFileRoute("/_app/verify")({
  head: () => ({
    meta: [
      { title: "VerifyKnowledge — DoctorPedAI" },
      { name: "description", content: "כלי VerifyKnowledge של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "VerifyKnowledge — DoctorPedAI" },
      { property: "og:description", content: "כלי VerifyKnowledge של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: VerifyKnowledge,
});
