import { createFileRoute } from "@tanstack/react-router";
import { ReferralsPage } from "@/pages/doctorped/tools";

export const Route = createFileRoute("/_app/referrals")({
  head: () => ({
    meta: [
      { title: "ReferralsPage — DoctorPedAI" },
      { name: "description", content: "כלי ReferralsPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:title", content: "ReferralsPage — DoctorPedAI" },
      { property: "og:description", content: "כלי ReferralsPage של DoctorPedAI: ניתוח קליני מבוסס ראיות לרפואת ילדים עם שכבת אנטי-הזיה." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReferralsPage,
});
