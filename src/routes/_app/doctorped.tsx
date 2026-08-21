import { createFileRoute } from "@tanstack/react-router";
import DoctorPedWorkbench from "@/pages/DoctorPedWorkbench";

export const Route = createFileRoute("/_app/doctorped")({
  head: () => ({
    meta: [
      { title: "DoctorPedWorkbench — DoctorPedAI" },
      { name: "description", content: "כלי DoctorPedWorkbench של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "DoctorPedWorkbench — DoctorPedAI" },
      { property: "og:description", content: "כלי DoctorPedWorkbench של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DoctorPedWorkbench,
});
