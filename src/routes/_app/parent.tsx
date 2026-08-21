import { createFileRoute } from "@tanstack/react-router";
import ParentPortal from "@/pages/ParentPortal";

export const Route = createFileRoute("/_app/parent")({
  head: () => ({
    meta: [
      { title: "ParentPortal — DoctorPedAI" },
      { name: "description", content: "כלי ParentPortal של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ParentPortal — DoctorPedAI" },
      { property: "og:description", content: "כלי ParentPortal של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ParentPortal,
});
