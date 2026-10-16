-- AFSR Math MVP: private, single-device cloud workspace. No anonymous data access.
create table if not exists public.app_state (
  id smallint primary key check (id = 1),
  revision bigint not null check (revision >= 1),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_plan_settings (
  id smallint primary key check (id = 1),
  settings jsonb not null,
  updated_at timestamptz not null
);
create table if not exists public.daily_assignments (
  id text primary key,
  assignment_date date not null unique,
  plan_settings_snapshot jsonb not null,
  status text not null check (status in ('in-progress','completed')),
  total_questions integer not null check (total_questions between 1 and 100),
  completed_questions integer not null check (completed_questions between 0 and total_questions),
  created_at timestamptz not null,
  completed_at timestamptz
);
create table if not exists public.learning_sessions (
  id text primary key,
  assignment_id text unique references public.daily_assignments(id) on delete cascade,
  session_date date not null,
  session_type text not null check (session_type in ('daily','free')),
  settings_snapshot jsonb not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status text not null check (status in ('in-progress','completed')),
  total_questions integer not null check (total_questions between 1 and 100),
  correct_answers integer not null check (correct_answers between 0 and total_questions),
  duration_ms bigint not null check (duration_ms >= 0),
  session_data jsonb not null,
  check ((session_type='daily') = (assignment_id is not null))
);
create index if not exists learning_sessions_date_idx on public.learning_sessions(session_date desc);
create table if not exists public.question_attempts (
  session_id text not null references public.learning_sessions(id) on delete cascade,
  question_id text not null,
  attempt_type text not null check (attempt_type in ('first','retry','review')),
  question_data jsonb not null,
  answer jsonb not null,
  is_correct boolean not null,
  duration_ms integer not null check (duration_ms between 0 and 86400000),
  inactive_ms integer not null check (inactive_ms between 0 and 86400000),
  submitted_at timestamptz not null,
  primary key (session_id, question_id, attempt_type, submitted_at)
);
create index if not exists question_attempts_session_idx on public.question_attempts(session_id);

alter table public.app_state enable row level security;
alter table public.daily_plan_settings enable row level security;
alter table public.daily_assignments enable row level security;
alter table public.learning_sessions enable row level security;
alter table public.question_attempts enable row level security;
revoke all on public.app_state, public.daily_plan_settings, public.daily_assignments, public.learning_sessions, public.question_attempts from anon, authenticated;
grant select, insert, update, delete on public.app_state, public.daily_plan_settings, public.daily_assignments, public.learning_sessions, public.question_attempts to service_role;

-- This atomic compare-and-save API makes the whole validated backup a revisioned snapshot.
-- Normalized rows are rebuilt in the same transaction to keep querying and backups consistent.
create or replace function public.save_learning_state(next_state jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  new_revision bigint;
begin
  if jsonb_typeof(next_state) <> 'object' or (next_state->>'schemaVersion') <> '1' then
    raise exception 'invalid learning state' using errcode='22023';
  end if;
  insert into public.app_state(id,revision,data,updated_at)
  values (1,expected_revision+1,next_state,now())
  on conflict (id) do update
    set revision=excluded.revision,data=excluded.data,updated_at=now()
    where public.app_state.revision=expected_revision
  returning revision into new_revision;
  if new_revision is null then
    raise exception 'revision conflict' using errcode='40001';
  end if;

  delete from public.daily_plan_settings;
  delete from public.daily_assignments;
  delete from public.learning_sessions;
  insert into public.daily_plan_settings(id,settings,updated_at)
    values (1,next_state->'plan',coalesce((next_state->'plan'->>'updatedAt')::timestamptz,now()));

  insert into public.daily_assignments(id,assignment_date,plan_settings_snapshot,status,total_questions,completed_questions,created_at,completed_at)
    select s->>'id',(s->>'date')::date,s->'planSnapshot',s->>'status',jsonb_array_length(s->'questions'),jsonb_array_length(s->'attempts'),(s->>'startedAt')::timestamptz,nullif(s->>'completedAt','')::timestamptz
    from jsonb_array_elements(next_state->'sessions') s where s->>'type'='daily';

  insert into public.learning_sessions(id,assignment_id,session_date,session_type,settings_snapshot,started_at,completed_at,status,total_questions,correct_answers,duration_ms,session_data)
    select s->>'id',case when s->>'type'='daily' then s->>'id' else null end,(s->>'date')::date,s->>'type',s->'settings',(s->>'startedAt')::timestamptz,nullif(s->>'completedAt','')::timestamptz,s->>'status',jsonb_array_length(s->'questions'),(select count(*)::integer from jsonb_array_elements(s->'attempts') a where (a->>'correct')::boolean),coalesce((select sum((x.item->>'durationMs')::bigint) from (select value as item from jsonb_array_elements(s->'attempts') union all select value as item from jsonb_array_elements(coalesce(s->'retries','[]'::jsonb))) x),0),s
    from jsonb_array_elements(next_state->'sessions') s;

  insert into public.question_attempts(session_id,question_id,attempt_type,question_data,answer,is_correct,duration_ms,inactive_ms,submitted_at)
    select s->>'id',a->>'questionId',kind.value,q.question,a->'answer',(a->>'correct')::boolean,(a->>'durationMs')::integer,(a->>'inactiveMs')::integer,(a->>'submittedAt')::timestamptz
    from jsonb_array_elements(next_state->'sessions') s
    cross join lateral (values ('first',s->'attempts'),('retry',coalesce(s->'retries','[]'::jsonb)),('review',s->'reviews'),('review',coalesce(s->'reviewAttempts','[]'::jsonb)),('retry',coalesce(s->'reviewRetries','[]'::jsonb))) kind(value,items)
    cross join lateral jsonb_array_elements(kind.items) a
    cross join lateral (select question from jsonb_array_elements(s->'questions') question where question->>'id'=a->>'questionId' union all select item->'question' as question from jsonb_array_elements(coalesce(s->'reviewQuestions','[]'::jsonb)) item where item->'question'->>'id'=a->>'questionId' limit 1) q;
  return new_revision;
end $$;
revoke all on function public.save_learning_state(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.save_learning_state(jsonb,bigint) to service_role;
