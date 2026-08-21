-- Helper: does the current user own this patient?
CREATE OR REPLACE FUNCTION public.owns_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = _patient_id
      AND p.parent_user_id = auth.uid()
  )
$$;

REVOKE ALL ON FUNCTION public.owns_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_patient(uuid) TO authenticated;

-- encounters: parents scoped to their own patients
DROP POLICY IF EXISTS encounters_parent_select ON public.encounters;
CREATE POLICY encounters_parent_select ON public.encounters
FOR SELECT TO authenticated
USING (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND patient_id IS NOT NULL
  AND public.owns_patient(patient_id)
);

DROP POLICY IF EXISTS encounters_parent_insert ON public.encounters;
CREATE POLICY encounters_parent_insert ON public.encounters
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND encounter_type = 'previsit'
  AND patient_id IS NOT NULL
  AND public.owns_patient(patient_id)
);

-- questionnaire_responses: parents scoped to their own patients
DROP POLICY IF EXISTS q_parent_own ON public.questionnaire_responses;
CREATE POLICY q_parent_own ON public.questionnaire_responses
FOR ALL TO authenticated
USING (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND patient_id IS NOT NULL
  AND public.owns_patient(patient_id)
)
WITH CHECK (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND patient_id IS NOT NULL
  AND public.owns_patient(patient_id)
);

-- Lock down SECURITY DEFINER helpers from direct API execution
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
