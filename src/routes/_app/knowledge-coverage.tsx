import { createFileRoute } from "@tanstack/react-router";
import KnowledgeCoverage from "@/pages/KnowledgeCoverage";

export const Route = createFileRoute("/_app/knowledge-coverage")({
  head: () => ({
    meta: [
      { title: "KnowledgeCoverage — DoctorPedAI" },
      { name: "description", content: "כלי KnowledgeCoverage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "KnowledgeCoverage — DoctorPedAI" },
      { property: "og:description", content: "כלי KnowledgeCoverage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeCoverage,
});
