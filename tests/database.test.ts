import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { emptyState, presets, seoulDate, stateSchema, type AppState } from '../shared/model'
import { dailySession, freeSession, queueWrongAnswer, scheduleReviews, submit, submitSpacedReview } from '../domain/learning'
import { migrateState } from '../repositories/learning'

const migrations = [
  '../supabase/migrations/202610130001_initial.sql',
  '../supabase/migrations/202610150001_spaced_review_schema.sql',
  '../supabase/migrations/202610160001_single_state_contract.sql',
]

async function database(count = migrations.length) {
  const db = new PGlite()
  for (const role of ['anon', 'authenticated']) await db.exec(`create role ${role}`)
  await db.exec('create role service_role bypassrls')
  for (const file of migrations.slice(0, count)) {
    await db.exec(await readFile(fileURLToPath(new URL(file, import.meta.url)), 'utf8'))
  }
  return db
}

async function save(db: PGlite, state: AppState, expectedRevision: number) {
  return db.query<{ save_learning_state: number }>(
    'select public.save_learning_state($1::jsonb, $2::bigint)',
    [JSON.stringify(state), expectedRevision],
  )
}

function stateWithRetries() {
  const state = emptyState()
  const session = freeSession({ ...presets.basic, count: 1 })
  scheduleReviews(state, session)
  state.sessions.push(session)
  const question = session.questions[0]!
  const first = submit(session, question.id, { value: question.answer + 1 }, 100)
  state.sessions[0] = first
  queueWrongAnswer(state, first, question, first.attempts[0]!)
  let completed = submit(first, question.id, { value: question.answer + 1 }, 100, 0, 'retry')
  completed = submit(completed, question.id, { value: question.answer + 1 }, 100, 0, 'retry')
  const sameTime = completed.retries[0]!.submittedAt
  completed.retries[1]!.submittedAt = sameTime
  const reviewQuestion = completed.reviewQuestions[0]!.question
  completed = submit(completed, reviewQuestion.id, { value: reviewQuestion.answer + 1 }, 100, 0, 'review')
  completed = submit(completed, reviewQuestion.id, { value: reviewQuestion.answer }, 100, 0, 'reviewRetry')
  state.sessions[0] = completed
  return stateSchema.parse(state)
}

describe('Supabase SQL and application state contract', () => {
  it('keeps one snapshot, accepts equal-timestamp retries, and round-trips actual app state', async () => {
    const db = await database()
    try {
      const state = stateWithRetries()
      state.revision = 1
      expect((await save(db, state, 0)).rows[0]?.save_learning_state).toBe(1)
      const first = await db.query<{ data: AppState; revision: number }>('select data, revision from public.app_state where id = 1')
      expect(first.rows[0]).toEqual({ data: state, revision: 1 })

      const second = dailySession({ ...state.plan, settings: { ...presets.basic, count: 1 } }, seoulDate())
      scheduleReviews(state, second)
      state.sessions.push(second)
      const review = state.reviewQueue[0]!
      expect(second.scheduledReviewIds).toContain(review.id)
      submitSpacedReview(state, second.id, review.id, { value: review.question.answer }, 100)
      state.revision = 2
      expect(stateSchema.parse(state)).toEqual(state)
      expect((await save(db, state, 1)).rows[0]?.save_learning_state).toBe(2)
      const stored = await db.query<{ data: AppState }>('select data from public.app_state where id = 1')
      expect(stored.rows[0]?.data).toEqual(state)
      const tables = await db.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      )
      expect(tables.rows.map(row => row.tablename)).toEqual(['app_state'])
    } finally { await db.close() }
  })

  it('rejects stale, nonzero initial, and inconsistent payload revisions without changing data', async () => {
    const db = await database()
    try {
      const state = emptyState()
      state.revision = 1
      await expect(save(db, { ...state, revision: 2 }, 1)).rejects.toMatchObject({ code: '40001' })
      await expect(save(db, { ...state, revision: 2 }, 0)).rejects.toMatchObject({ code: '22023' })
      await expect(db.query('select public.save_learning_state($1::jsonb, 0)', [JSON.stringify({ ...state, revision: '1' })]))
        .rejects.toMatchObject({ code: '22023' })
      await save(db, state, 0)
      await expect(save(db, state, 0)).rejects.toMatchObject({ code: '40001' })
      await expect(db.query(
        'update public.app_state set data = $1::jsonb where id = 1',
        [JSON.stringify({ ...state, revision: 9 })],
      )).rejects.toMatchObject({ code: '23514' })
      await expect(db.query(
        "update public.app_state set data = '{}'::jsonb where id = 1",
      )).rejects.toMatchObject({ code: '23514' })
      expect((await db.query<{ revision: number }>('select revision from public.app_state')).rows[0]?.revision).toBe(1)
    } finally { await db.close() }
  })

  it('preserves an existing v2 snapshot when upgrading and can clear it atomically', async () => {
    const db = await database(2)
    try {
      const existing = emptyState()
      existing.revision = 1
      await save(db, existing, 0)
      await db.exec(await readFile(fileURLToPath(new URL(migrations[2]!, import.meta.url)), 'utf8'))
      expect((await db.query<{ data: AppState }>('select data from public.app_state')).rows[0]?.data).toEqual(existing)
      expect((await db.query<{ n: number }>('select count(*)::int n from asmd_legacy.daily_plan_settings')).rows[0]?.n).toBe(1)
      const cleared = emptyState()
      cleared.revision = 2
      await save(db, cleared, 1)
      const stored = await db.query<{ data: AppState; revision: number }>('select data, revision from public.app_state')
      expect(stored.rows[0]).toEqual({ data: cleared, revision: 2 })
    } finally { await db.close() }
  })

  it('preserves an existing v1 snapshot for the application migration path', async () => {
    const db = await database(1)
    try {
      const oldState = { ...emptyState(), schemaVersion: 1, revision: 1 }
      await db.query('select public.save_learning_state($1::jsonb, $2::bigint)', [JSON.stringify(oldState), 0])
      for (const file of migrations.slice(1)) {
        await db.exec(await readFile(fileURLToPath(new URL(file, import.meta.url)), 'utf8'))
      }
      const snapshot = await db.query<{ data: unknown }>('select data from public.app_state where id = 1')
      expect(snapshot.rows[0]?.data).toEqual(oldState)
      const upgraded = migrateState(snapshot.rows[0]?.data)
      upgraded.revision = 2
      await save(db, upgraded, 1)
      expect((await db.query<{ data: AppState }>('select data from public.app_state')).rows[0]?.data).toEqual(upgraded)
    } finally { await db.close() }
  })

  it('denies anonymous and authenticated roles both direct reads and the save RPC', async () => {
    const db = await database()
    try {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`)
        await expect(db.query('select * from public.app_state')).rejects.toMatchObject({ code: '42501' })
        await expect(db.query("select public.save_learning_state('{}'::jsonb, 0)")).rejects.toMatchObject({ code: '42501' })
        await db.exec('reset role')
      }
      await db.exec('set role service_role')
      const state = emptyState()
      state.revision = 1
      await save(db, state, 0)
      expect((await db.query<{ revision: number }>('select revision from public.app_state')).rows[0]?.revision).toBe(1)
      await db.exec('reset role')
    } finally { await db.close() }
  })

  it('refuses to discard derived rows if no authoritative snapshot exists', async () => {
    const db = await database(2)
    try {
      await db.exec("insert into public.daily_plan_settings(id,settings,updated_at) values (1,'{}'::jsonb,now())")
      await expect(db.exec(await readFile(fileURLToPath(new URL(migrations[2]!, import.meta.url)), 'utf8')))
        .rejects.toThrow(/without an app_state snapshot/)
      await db.exec('rollback')
      expect((await db.query<{ n: number }>('select count(*)::int n from public.daily_plan_settings')).rows[0]?.n).toBe(1)
    } finally { await db.close() }
  })
})
