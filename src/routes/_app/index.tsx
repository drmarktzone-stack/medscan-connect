import { createFileRoute } from "@tanstack/react-router";
import Home from "@/pages/Home";

export const Route = createFileRoute("/_app/")({
  head: () => ({
    meta: [
      { title: "DoctorPedAI — עוזר קליני לרפואת ילדים" },
      { name: "description", content: "פלטפורמת MedScan לרפואת ילדים: פענוח מעבדה, עור, הדמיה, ECG ואבחנה מבדלת מבוססת ראיות." },
      { property: "og:title", content: "DoctorPedAI — עוזר קליני לרפואת ילדים" },
      { property: "og:description", content: "פלטפורמת MedScan לרפואת ילדים: פענוח מעבדה, עור, הדמיה, ECG ואבחנה מבדלת מבוססת ראיות." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});
