import { createFileRoute } from "@tanstack/react-router";
import LabInterpreter from "@/pages/LabInterpreter";

export const Route = createFileRoute("/_app/labs")({
  head: () => ({
    meta: [
      { title: "LabInterpreter — DoctorPedAI" },
      { name: "description", content: "כלי LabInterpreter של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "LabInterpreter — DoctorPedAI" },
      { property: "og:description", content: "כלי LabInterpreter של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LabInterpreter,
});
