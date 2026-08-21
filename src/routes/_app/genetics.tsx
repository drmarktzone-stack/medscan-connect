import { createFileRoute } from "@tanstack/react-router";
import { GeneticsPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/genetics")({
  head: () => ({
    meta: [
      { title: "GeneticsPage — DoctorPedAI" },
      { name: "description", content: "כלי GeneticsPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "GeneticsPage — DoctorPedAI" },
      { property: "og:description", content: "כלי GeneticsPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GeneticsPage,
});
