create type public.app_role as enum ('clinician', 'parent');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy user_roles_self_read on public.user_roles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'clinician'));

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  guardian_user_id uuid,
  display_name text,
  locale text not null default 'he' check (locale in ('he', 'en', 'ar')),
  dir text not null default 'rtl' check (dir in ('rtl', 'ltr')),
  sex text check (sex in ('male', 'female', 'other')),
  birth_date date,
  weight_kg numeric,
  height_cm numeric
);
grant select, insert, update, delete on public.patients to authenticated;
grant all on public.patients to service_role;
alter table public.patients enable row level security;

create policy patients_clinician_all on public.patients
  for all to authenticated
  using (public.has_role(auth.uid(), 'clinician'))
  with check (public.has_role(auth.uid(), 'clinician'));

create policy patients_parent_read on public.patients
  for select to authenticated
  using (guardian_user_id = auth.uid());

create table public.encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete cascade,
  created_at timestamptz not null default now(),
  locale text not null default 'he' check (locale in ('he', 'en', 'ar')),
  dir text not null default 'rtl' check (dir in ('rtl', 'ltr')),
  rls_role text not null check (rls_role in ('clinician', 'parent')),
  encounter_type text not null check (encounter_type in ('clinician', 'previsit')),
  triage_urgency text check (triage_urgency in ('emergency', 'hmo_visit', 'home_care')),
  engines_run jsonb not null default '[]'::jsonb,
  output_summary jsonb,
  verification_status text not null default 'draft_needs_verification'
    check (verification_status in ('draft_needs_verification', 'verified', 'rejected'))
);
create index encounters_patient_id_idx on public.encounters (patient_id);
grant select, insert, update, delete on public.encounters to authenticated;
grant all on public.encounters to service_role;
alter table public.encounters enable row level security;

create policy encounters_clinician_all on public.encounters
  for all to authenticated
  using (public.has_role(auth.uid(), 'clinician'))
  with check (public.has_role(auth.uid(), 'clinician'));

create policy encounters_parent_read on public.encounters
  for select to authenticated
  using (
    rls_role = 'parent'
    and exists (
      select 1 from public.patients p
      where p.id = encounters.patient_id
        and p.guardian_user_id = auth.uid()
    )
  );

create table public.questionnaire_responses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references public.patients (id) on delete cascade,
  encounter_id uuid references public.encounters (id) on delete set null,
  created_at timestamptz not null default now(),
  locale text not null default 'he' check (locale in ('he', 'en', 'ar')),
  dir text not null default 'rtl' check (dir in ('rtl', 'ltr')),
  rls_role text not null check (rls_role in ('clinician', 'parent')),
  instrument text not null check (instrument in ('mchat', 'vanderbilt', 'conners', 'symptom_checker')),
  payload jsonb not null default '{}'::jsonb
);
create index questionnaire_responses_patient_id_idx on public.questionnaire_responses (patient_id);
create index questionnaire_responses_encounter_id_idx on public.questionnaire_responses (encounter_id);
grant select, insert, update, delete on public.questionnaire_responses to authenticated;
grant all on public.questionnaire_responses to service_role;
alter table public.questionnaire_responses enable row level security;

create policy qr_clinician_all on public.questionnaire_responses
  for all to authenticated
  using (public.has_role(auth.uid(), 'clinician'))
  with check (public.has_role(auth.uid(), 'clinician'));

create policy qr_parent_read on public.questionnaire_responses
  for select to authenticated
  using (
    rls_role = 'parent'
    and exists (
      select 1 from public.patients p
      where p.id = questionnaire_responses.patient_id
        and p.guardian_user_id = auth.uid()
    )
  );

create policy qr_parent_insert on public.questionnaire_responses
  for insert to authenticated
  with check (
    rls_role = 'parent'
    and public.has_role(auth.uid(), 'parent')
    and exists (
      select 1 from public.patients p
      where p.id = questionnaire_responses.patient_id
        and p.guardian_user_id = auth.uid()
    )
  );