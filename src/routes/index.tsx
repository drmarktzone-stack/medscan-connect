import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PatientRail } from "@/components/workbench/PatientRail";
import { ClinicalAnalysis } from "@/components/workbench/ClinicalAnalysis";
import { MedScanRail } from "@/components/workbench/MedScanRail";
import { clinicalPatients } from "@/lib/clinical-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Clinician Workbench — DoctorPedAI" },
      {
        name: "description",
        content:
          "שולחן עבודה קליני ברפואת ילדים: מדדים חיוניים, עקומות גדילה, דגלים אדומים, אבחנות מבדלות, מחשבון מינונים ומודולי MedScan.",
      },
      { property: "og:title", content: "Clinician Workbench — DoctorPedAI" },
      {
        property: "og:description",
        content: "ניתוח קליני עמוק, דגלים אדומים ומחשבון מינונים mg/kg לרפואת ילדים.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Workbench,
});

function Workbench() {
  const [patientId, setPatientId] = useState(clinicalPatients[0]!.id);
  const patient = clinicalPatients.find((p) => p.id === patientId)!;

  return (
    <AppShell>
      <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
        <PatientRail patient={patient} onSelect={setPatientId} />
        <ClinicalAnalysis patient={patient} />
        <MedScanRail />
      </div>
    </AppShell>
  );
}
