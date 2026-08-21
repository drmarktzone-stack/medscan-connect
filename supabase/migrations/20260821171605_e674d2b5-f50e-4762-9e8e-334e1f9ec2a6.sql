DROP POLICY IF EXISTS encounters_parent_select ON public.encounters;
CREATE POLICY encounters_parent_select ON public.encounters
FOR SELECT TO authenticated
USING (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = encounters.patient_id AND p.parent_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS encounters_parent_insert ON public.encounters;
CREATE POLICY encounters_parent_insert ON public.encounters
FOR INSERT TO authenticated
WITH CHECK (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND encounter_type = 'previsit'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = encounters.patient_id AND p.parent_user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS q_parent_own ON public.questionnaire_responses;
CREATE POLICY q_parent_own ON public.questionnaire_responses
FOR ALL TO authenticated
USING (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = questionnaire_responses.patient_id AND p.parent_user_id = auth.uid()
  )
)
WITH CHECK (
  COALESCE(auth.jwt() ->> 'app_role', '') = 'parent'
  AND rls_role = 'parent'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = questionnaire_responses.patient_id AND p.parent_user_id = auth.uid()
  )
);

DROP FUNCTION IF EXISTS public.owns_patient(uuid);

-- user_roles: self read, or clinician per JWT claim (no SECURITY DEFINER needed)
DROP POLICY IF EXISTS user_roles_self_read ON public.user_roles;
CREATE POLICY user_roles_self_read ON public.user_roles
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR COALESCE(auth.jwt() ->> 'app_role', '') = 'clinician'
);
