import { createFileRoute } from "@tanstack/react-router";
import ProtocolRunner from "@/pages/ProtocolRunner";

export const Route = createFileRoute("/_app/protocols")({
  head: () => ({
    meta: [
      { title: "ProtocolRunner — DoctorPedAI" },
      { name: "description", content: "כלי ProtocolRunner של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ProtocolRunner — DoctorPedAI" },
      { property: "og:description", content: "כלי ProtocolRunner של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProtocolRunner,
});
