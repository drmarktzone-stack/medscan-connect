import { createFileRoute } from "@tanstack/react-router";
import SkinValidation from "@/pages/SkinValidation";

export const Route = createFileRoute("/_app/skin-validate")({
  head: () => ({
    meta: [
      { title: "SkinValidation — DoctorPedAI" },
      { name: "description", content: "כלי SkinValidation של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "SkinValidation — DoctorPedAI" },
      { property: "og:description", content: "כלי SkinValidation של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SkinValidation,
});
