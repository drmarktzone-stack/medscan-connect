import { createFileRoute } from "@tanstack/react-router";
import KnowledgeAdmin from "@/pages/KnowledgeAdmin";

export const Route = createFileRoute("/_app/knowledge-admin")({
  head: () => ({
    meta: [
      { title: "KnowledgeAdmin — DoctorPedAI" },
      { name: "description", content: "כלי KnowledgeAdmin של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "KnowledgeAdmin — DoctorPedAI" },
      { property: "og:description", content: "כלי KnowledgeAdmin של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeAdmin,
});
