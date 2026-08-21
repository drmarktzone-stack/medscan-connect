import { createFileRoute } from "@tanstack/react-router";
import { NutritionPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/nutrition")({
  head: () => ({
    meta: [
      { title: "NutritionPage — DoctorPedAI" },
      { name: "description", content: "כלי NutritionPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "NutritionPage — DoctorPedAI" },
      { property: "og:description", content: "כלי NutritionPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: NutritionPage,
});
