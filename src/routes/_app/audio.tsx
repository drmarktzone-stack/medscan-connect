import { createFileRoute } from "@tanstack/react-router";
import { AudioPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/audio")({
  head: () => ({
    meta: [
      { title: "AudioPage — DoctorPedAI" },
      { name: "description", content: "כלי AudioPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "AudioPage — DoctorPedAI" },
      { property: "og:description", content: "כלי AudioPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AudioPage,
});
