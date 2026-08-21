import { createFileRoute } from "@tanstack/react-router";
import PatientContext from "@/pages/PatientContext";

export const Route = createFileRoute("/_app/patient-context")({
  head: () => ({
    meta: [
      { title: "PatientContext — DoctorPedAI" },
      { name: "description", content: "כלי PatientContext של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "PatientContext — DoctorPedAI" },
      { property: "og:description", content: "כלי PatientContext של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PatientContext,
});
