-- The application reads and writes one validated state snapshot. The tables
-- below were derived copies and could reject an otherwise valid state save.
-- Keep the revisioned snapshot as the only authoritative data in this MVP.
begin;

do $$
begin
  if not exists (select 1 from public.app_state where id = 1)
     and (exists (select 1 from public.daily_plan_settings)
       or exists (select 1 from public.daily_assignments)
       or exists (select 1 from public.learning_sessions)
       or exists (select 1 from public.question_attempts)
       or exists (select 1 from public.learning_review_queue)) then
    raise exception 'derived learning rows exist without an app_state snapshot';
  end if;
end $$;

create schema if not exists asmd_legacy;
revoke all on schema asmd_legacy from public;
alter table public.question_attempts set schema asmd_legacy;
alter table public.learning_review_queue set schema asmd_legacy;
alter table public.learning_sessions set schema asmd_legacy;
alter table public.daily_assignments set schema asmd_legacy;
alter table public.daily_plan_settings set schema asmd_legacy;
revoke insert, update, delete on all tables in schema asmd_legacy from service_role;

alter table public.app_state
  add constraint app_state_data_revision_check
  check (coalesce(jsonb_typeof(data->'revision'), '') = 'number'
     and coalesce(data->>'revision', '') = revision::text);

create or replace function public.save_learning_state(next_state jsonb, expected_revision bigint)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  new_revision bigint;
begin
  if expected_revision is null or expected_revision < 0 or expected_revision = 9223372036854775807 then
    raise exception 'revision conflict' using errcode = '40001';
  end if;
  if jsonb_typeof(next_state) is distinct from 'object'
     or next_state->>'schemaVersion' is distinct from '2'
     or jsonb_typeof(next_state->'revision') is distinct from 'number'
     or next_state->>'revision' is distinct from (expected_revision + 1)::text then
    raise exception 'invalid learning state' using errcode = '22023';
  end if;

  update public.app_state
     set revision = expected_revision + 1, data = next_state, updated_at = now()
   where id = 1 and revision = expected_revision
   returning revision into new_revision;

  if new_revision is null and expected_revision = 0 then
    insert into public.app_state(id, revision, data, updated_at)
    values (1, 1, next_state, now())
    on conflict (id) do nothing
    returning revision into new_revision;
  end if;

  if new_revision is null then
    raise exception 'revision conflict' using errcode = '40001';
  end if;
  return new_revision;
end $$;

revoke all on function public.save_learning_state(jsonb,bigint) from public, anon, authenticated;
grant execute on function public.save_learning_state(jsonb,bigint) to service_role;

commit;
