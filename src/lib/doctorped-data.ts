// Temporary data model for DoctorPedAI.
// Replace with the real schema/types once supabase/doctorped_schema.sql and
// src/types/doctorped.ts are added to the project.

export type Severity = "low" | "medium" | "high";
export type CaseStatus = "open" | "in_review" | "closed";

export interface Patient {
  id: string;
  full_name: string;
  age_months: number;
  sex: "male" | "female";
  weight_kg: number;
  guardian: string;
  last_visit: string;
}

export interface AiCase {
  id: string;
  patient_id: string;
  patient_name: string;
  chief_complaint: string;
  severity: Severity;
  status: CaseStatus;
  confidence: number;
  created_at: string;
  summary: string;
}

export interface VitalPoint {
  label: string;
  value: number;
}

export const patients: Patient[] = [
  { id: "p1", full_name: "נועם לוי", age_months: 34, sex: "male", weight_kg: 14.2, guardian: "דנה לוי", last_visit: "2026-08-18" },
  { id: "p2", full_name: "מאיה כהן", age_months: 8, sex: "female", weight_kg: 8.1, guardian: "יובל כהן", last_visit: "2026-08-19" },
  { id: "p3", full_name: "איתי ברק", age_months: 61, sex: "male", weight_kg: 19.7, guardian: "שירן ברק", last_visit: "2026-08-20" },
  { id: "p4", full_name: "תמר אזולאי", age_months: 120, sex: "female", weight_kg: 31.4, guardian: "רון אזולאי", last_visit: "2026-08-20" },
  { id: "p5", full_name: "עומר פרץ", age_months: 17, sex: "male", weight_kg: 11.0, guardian: "ליאת פרץ", last_visit: "2026-08-21" },
];

export const cases: AiCase[] = [
  {
    id: "c1",
    patient_id: "p2",
    patient_name: "מאיה כהן",
    chief_complaint: "חום ממושך 39.2°",
    severity: "high",
    status: "in_review",
    confidence: 0.91,
    created_at: "2026-08-21T06:10:00Z",
    summary: "דפוס חום מתמשך מעל 72 שעות בגיל 8 חודשים — מומלץ בירור מעבדה מלא.",
  },
  {
    id: "c2",
    patient_id: "p1",
    patient_name: "נועם לוי",
    chief_complaint: "פריחה מפושטת",
    severity: "medium",
    status: "open",
    confidence: 0.78,
    created_at: "2026-08-21T05:02:00Z",
    summary: "מאפיינים ויראליים אופייניים, ללא סימני אזהרה. מעקב 48 שעות.",
  },
  {
    id: "c3",
    patient_id: "p3",
    patient_name: "איתי ברק",
    chief_complaint: "שיעול לילי",
    severity: "low",
    status: "closed",
    confidence: 0.86,
    created_at: "2026-08-20T18:40:00Z",
    summary: "תמונה תואמת אסתמה קלה מושרית מאמץ. נבנתה תוכנית טיפול.",
  },
  {
    id: "c4",
    patient_id: "p5",
    patient_name: "עומר פרץ",
    chief_complaint: "הקאות חוזרות",
    severity: "high",
    status: "open",
    confidence: 0.83,
    created_at: "2026-08-21T07:15:00Z",
    summary: "סימני התייבשות קלה-בינונית. הומלץ מתן נוזלים ובדיקה חוזרת.",
  },
];

export const weeklyVolume: VitalPoint[] = [
  { label: "א׳", value: 12 },
  { label: "ב׳", value: 19 },
  { label: "ג׳", value: 15 },
  { label: "ד׳", value: 26 },
  { label: "ה׳", value: 22 },
  { label: "ו׳", value: 9 },
  { label: "ש׳", value: 5 },
];

export const severityLabel: Record<Severity, string> = {
  low: "נמוכה",
  medium: "בינונית",
  high: "גבוהה",
};

export const statusLabel: Record<CaseStatus, string> = {
  open: "פתוח",
  in_review: "בבדיקה",
  closed: "סגור",
};

export function ageLabel(months: number) {
  if (months < 24) return `${months} חודשים`;
  return `${Math.floor(months / 12)} שנים`;
}
