import type { Database } from "@/integrations/supabase/types";

export type Tables = Database["public"]["Tables"];

export type AppRole = Database["public"]["Enums"]["app_role"];

export type Patient = Tables["patients"]["Row"];
export type PatientInsert = Tables["patients"]["Insert"];

export type Encounter = Tables["encounters"]["Row"];
export type EncounterInsert = Tables["encounters"]["Insert"];

export type QuestionnaireResponse = Tables["questionnaire_responses"]["Row"];
export type QuestionnaireResponseInsert =
  Tables["questionnaire_responses"]["Insert"];

export type UserRole = Tables["user_roles"]["Row"];

export type Locale = "he" | "en" | "ar";
export type Dir = "rtl" | "ltr";
export type EncounterType = "clinician" | "previsit";
export type TriageUrgency = "emergency" | "hmo_visit" | "home_care";
export type VerificationStatus =
  | "draft_needs_verification"
  | "verified"
  | "rejected";
export type Instrument =
  | "mchat"
  | "vanderbilt"
  | "conners"
  | "symptom_checker";

export const TRIAGE_LABELS_HE: Record<TriageUrgency, string> = {
  emergency: "מיון דחוף",
  hmo_visit: "ביקור בקופה",
  home_care: "טיפול ביתי",
};

export const INSTRUMENT_LABELS_HE: Record<Instrument, string> = {
  mchat: "M-CHAT",
  vanderbilt: "ונדרבילט",
  conners: "קונרס",
  symptom_checker: "בודק תסמינים",
};

export const VERIFICATION_LABELS_HE: Record<VerificationStatus, string> = {
  draft_needs_verification: "טיוטה — דורש אימות",
  verified: "אומת",
  rejected: "נדחה",
};
