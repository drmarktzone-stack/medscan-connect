import { createFileRoute } from "@tanstack/react-router";
import KnowledgeBase from "@/pages/KnowledgeBase";

export const Route = createFileRoute("/_app/knowledge-base")({
  head: () => ({
    meta: [
      { title: "KnowledgeBase — DoctorPedAI" },
      { name: "description", content: "כלי KnowledgeBase של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "KnowledgeBase — DoctorPedAI" },
      { property: "og:description", content: "כלי KnowledgeBase של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeBase,
});
