import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getDoctorPedData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();

    const role = roleRow?.role ?? "parent";
    const { data: patients, error: patientsError } = await context.supabase
      .from("patients")
      .select("id, display_name, birth_date, sex, weight_kg, height_cm, locale, dir, created_at")
      .order("created_at", { ascending: false });
    if (patientsError) throw new Error(patientsError.message);

    const { data: encounters, error: encountersError } = await context.supabase
      .from("encounters")
      .select("id, patient_id, created_at, encounter_type, triage_urgency, engines_run, output_summary, verification_status")
      .order("created_at", { ascending: false })
      .limit(30);
    if (encountersError) throw new Error(encountersError.message);

    let doses: Array<{
      id: string;
      drug_key: string;
      drug_name_he: string | null;
      mg_per_kg_per_dose: number | null;
      max_mg_per_dose: number | null;
      max_mg_per_day: number | null;
      doses_per_day: number | null;
      min_age_days: number | null;
      source: string | null;
      verification_status: string;
    }> = [];
    if (role === "clinician") {
      const { data, error } = await context.supabase
        .from("dose_records")
        .select("id, drug_key, drug_name_he, mg_per_kg_per_dose, max_mg_per_dose, max_mg_per_day, doses_per_day, min_age_days, source, verification_status")
        .eq("verification_status", "verified")
        .order("drug_name_he");
      if (error) throw new Error(error.message);
      doses = data ?? [];
    }

    return { role, patients: patients ?? [], encounters: encounters ?? [], doses };
  });

const encounterInput = z.object({
  patient_id: z.string().uuid().nullable(),
  locale: z.enum(["he", "en", "ar"]),
  dir: z.enum(["rtl", "ltr"]),
  rls_role: z.enum(["clinician", "parent"]),
  encounter_type: z.enum(["clinician", "previsit"]),
  triage_urgency: z.enum(["emergency", "hmo_visit", "home_care"]).nullable(),
  engines_run: z.array(z.unknown()),
  output_summary: z.record(z.string(), z.unknown()),
  verification_status: z.literal("draft_needs_verification"),
});

export const saveDoctorPedEncounter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => encounterInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = roleRow?.role ?? "parent";
    if (data.rls_role !== role) throw new Error("Role mismatch");

    const { data: saved, error } = await context.supabase
      .from("encounters")
      .insert(data)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });