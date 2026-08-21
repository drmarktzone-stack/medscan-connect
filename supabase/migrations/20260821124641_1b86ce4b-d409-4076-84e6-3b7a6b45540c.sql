alter table public.patients add column if not exists parent_user_id uuid;
alter table public.patients add column if not exists clinician_org_id text;
alter table public.encounters add column if not exists created_by uuid;

create table if not exists public.dose_records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  drug_key text not null,
  drug_name_he text,
  mg_per_kg_per_dose numeric,
  max_mg_per_dose numeric,
  max_mg_per_day numeric,
  doses_per_day numeric,
  min_age_days integer,
  verification_status text not null default 'draft_needs_verification',
  source text
);

grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.encounters to authenticated;
grant select, insert, update, delete on public.questionnaire_responses to authenticated;
grant select on public.dose_records to authenticated;
grant all on public.patients to service_role;
grant all on public.encounters to service_role;
grant all on public.questionnaire_responses to service_role;
grant all on public.dose_records to service_role;

alter table public.patients enable row level security;
alter table public.encounters enable row level security;
alter table public.questionnaire_responses enable row level security;
alter table public.dose_records enable row level security;

drop policy if exists encounters_parent_read on public.encounters;
drop policy if exists patients_parent_read on public.patients;
drop policy if exists qr_clinician_all on public.questionnaire_responses;
drop policy if exists qr_parent_read on public.questionnaire_responses;
drop policy if exists qr_parent_insert on public.questionnaire_responses;
drop policy if exists dose_records_clinician_read on public.dose_records;

drop policy if exists encounters_clinician_all on public.encounters;
create policy encounters_clinician_all on public.encounters
for all
using (coalesce(auth.jwt() ->> 'app_role', '') = 'clinician')
with check (coalesce(auth.jwt() ->> 'app_role', '') = 'clinician');

drop policy if exists encounters_parent_select on public.encounters;
create policy encounters_parent_select on public.encounters
for select
using (
coalesce(auth.jwt() ->> 'app_role', '') = 'parent'
and rls_role = 'parent'
);

drop policy if exists encounters_parent_insert on public.encounters;
create policy encounters_parent_insert on public.encounters
for insert
with check (
coalesce(auth.jwt() ->> 'app_role', '') = 'parent'
and rls_role = 'parent'
and encounter_type = 'previsit'
);

drop policy if exists patients_clinician_all on public.patients;
create policy patients_clinician_all on public.patients
for all
using (coalesce(auth.jwt() ->> 'app_role', '') = 'clinician');

drop policy if exists patients_parent_own on public.patients;
create policy patients_parent_own on public.patients
for select
using (
coalesce(auth.jwt() ->> 'app_role', '') = 'parent'
and parent_user_id = auth.uid()
);

drop policy if exists q_clinician_all on public.questionnaire_responses;
create policy q_clinician_all on public.questionnaire_responses
for all
using (coalesce(auth.jwt() ->> 'app_role', '') = 'clinician');

drop policy if exists q_parent_own on public.questionnaire_responses;
create policy q_parent_own on public.questionnaire_responses
for all
using (
coalesce(auth.jwt() ->> 'app_role', '') = 'parent'
and rls_role = 'parent'
);

drop policy if exists dose_clinician_select on public.dose_records;
create policy dose_clinician_select on public.dose_records
for select
using (coalesce(auth.jwt() ->> 'app_role', '') = 'clinician');