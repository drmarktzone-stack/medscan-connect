CREATE TABLE public.dose_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  drug_key text NOT NULL UNIQUE,
  drug_name_he text,
  mg_per_kg_per_dose numeric,
  max_mg_per_dose numeric,
  max_mg_per_day numeric,
  doses_per_day numeric,
  min_age_days integer,
  verification_status text NOT NULL DEFAULT 'draft_needs_verification'
    CHECK (verification_status IN ('draft_needs_verification', 'verified', 'rejected')),
  source text
);

GRANT SELECT ON public.dose_records TO authenticated;
GRANT ALL ON public.dose_records TO service_role;

ALTER TABLE public.dose_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY dose_records_clinician_read
ON public.dose_records
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'clinician')
  AND verification_status = 'verified'
);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_dose_records_updated_at
BEFORE UPDATE ON public.dose_records
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();