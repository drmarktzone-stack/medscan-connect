import { createFileRoute } from "@tanstack/react-router";
import KnowledgeImport from "@/pages/KnowledgeImport";

export const Route = createFileRoute("/_app/knowledge-import")({
  head: () => ({
    meta: [
      { title: "KnowledgeImport — DoctorPedAI" },
      { name: "description", content: "כלי KnowledgeImport של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "KnowledgeImport — DoctorPedAI" },
      { property: "og:description", content: "כלי KnowledgeImport של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeImport,
});
