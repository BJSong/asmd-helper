-- Schema v2 adds session-indexed spaced review, hint logs, and separate review attempts.
create table if not exists public.learning_review_queue (
  id text primary key,
  source_session_id text not null references public.learning_sessions(id) on delete cascade,
  source_question_id text not null,
  question_data jsonb not null,
  first_wrong_at timestamptz not null,
  due_session bigint not null check (due_session > 0),
  interval_sessions integer not null check (interval_sessions > 0),
  status text not null check (status in ('due','scheduled','mastered')),
  assigned_session_id text references public.learning_sessions(id) on delete set null,
  last_attempt_session bigint not null default 0 check (last_attempt_session >= 0),
  attempts_this_session integer not null default 0 check (attempts_this_session between 0 and 3),
  attempts jsonb not null default '[]'::jsonb,
  hint_views jsonb not null default '[]'::jsonb,
  created_at timestamptz not null
);
create index if not exists learning_review_queue_due_idx on public.learning_review_queue(due_session) where status <> 'mastered';
alter table public.learning_review_queue enable row level security;
revoke all on public.learning_review_queue from anon, authenticated;
grant select, insert, update, delete on public.learning_review_queue to service_role;

alter table public.question_attempts drop constraint if exists question_attempts_attempt_type_check;
alter table public.question_attempts add constraint question_attempts_attempt_type_check
  check (attempt_type in ('first','retry','review','review_retry'));

create or replace function public.save_learning_state(next_state jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare new_revision bigint;
begin
  if jsonb_typeof(next_state) <> 'object' or (next_state->>'schemaVersion') <> '2' then
    raise exception 'invalid learning state' using errcode='22023';
  end if;
  insert into public.app_state(id,revision,data,updated_at)
  values (1,expected_revision+1,next_state,now())
  on conflict (id) do update set revision=excluded.revision,data=excluded.data,updated_at=now()
  where public.app_state.revision=expected_revision returning revision into new_revision;
  if new_revision is null then raise exception 'revision conflict' using errcode='40001'; end if;

  delete from public.daily_plan_settings;
  delete from public.daily_assignments;
  delete from public.learning_review_queue;
  delete from public.learning_sessions;
  insert into public.daily_plan_settings(id,settings,updated_at)
    values (1,next_state->'plan',coalesce((next_state->'plan'->>'updatedAt')::timestamptz,now()));
  insert into public.daily_assignments(id,assignment_date,plan_settings_snapshot,status,total_questions,completed_questions,created_at,completed_at)
    select s->>'id',(s->>'date')::date,s->'planSnapshot',s->>'status',jsonb_array_length(s->'questions'),jsonb_array_length(s->'attempts'),(s->>'startedAt')::timestamptz,nullif(s->>'completedAt','')::timestamptz
    from jsonb_array_elements(next_state->'sessions') s where s->>'type'='daily';
  insert into public.learning_sessions(id,assignment_id,session_date,session_type,settings_snapshot,started_at,completed_at,status,total_questions,correct_answers,duration_ms,session_data)
    select s->>'id',case when s->>'type'='daily' then s->>'id' else null end,(s->>'date')::date,s->>'type',s->'settings',(s->>'startedAt')::timestamptz,nullif(s->>'completedAt','')::timestamptz,s->>'status',jsonb_array_length(s->'questions'),
      (select count(*)::integer from jsonb_array_elements(s->'attempts') a where (a->>'correct')::boolean),
      coalesce((select sum((x.item->>'durationMs')::bigint) from (select value as item from jsonb_array_elements(s->'attempts') union all select value as item from jsonb_array_elements(coalesce(s->'retries','[]'::jsonb))) x),0),s
    from jsonb_array_elements(next_state->'sessions') s;
  insert into public.learning_review_queue(id,source_session_id,source_question_id,question_data,first_wrong_at,due_session,interval_sessions,status,assigned_session_id,last_attempt_session,attempts_this_session,attempts,hint_views,created_at)
    select r->>'id',r->>'sourceSessionId',r->>'sourceQuestionId',r->'question',(r->>'firstWrongAt')::timestamptz,(r->>'dueSession')::bigint,(r->>'interval')::integer,r->>'status',nullif(r->>'assignedSessionId',''),coalesce((r->>'lastAttemptSession')::bigint,0),coalesce((r->>'attemptsThisSession')::integer,0),coalesce(r->'attempts','[]'::jsonb),coalesce(r->'hintViews','[]'::jsonb),(r->>'createdAt')::timestamptz
    from jsonb_array_elements(coalesce(next_state->'reviewQueue','[]'::jsonb)) r;
  insert into public.question_attempts(session_id,question_id,attempt_type,question_data,answer,is_correct,duration_ms,inactive_ms,submitted_at)
    select s->>'id',a->>'questionId',kind.value,q.question,a->'answer',(a->>'correct')::boolean,(a->>'durationMs')::integer,(a->>'inactiveMs')::integer,(a->>'submittedAt')::timestamptz
    from jsonb_array_elements(next_state->'sessions') s
    cross join lateral (values ('first',s->'attempts'),('retry',coalesce(s->'retries','[]'::jsonb)),('review',s->'reviews'),('review',coalesce(s->'reviewAttempts','[]'::jsonb)),('review_retry',coalesce(s->'reviewRetries','[]'::jsonb))) kind(value,items)
    cross join lateral jsonb_array_elements(kind.items) a
    cross join lateral (select question from jsonb_array_elements(s->'questions') question where question->>'id'=a->>'questionId'
      union all select item->'question' as question from jsonb_array_elements(coalesce(s->'reviewQuestions','[]'::jsonb)) item where item->'question'->>'id'=a->>'questionId' limit 1) q;
  return new_revision;
end $$;
revoke all on function public.save_learning_state(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.save_learning_state(jsonb,bigint) to service_role;
