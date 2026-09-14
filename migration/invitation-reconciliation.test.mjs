import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sql = readFileSync(
  'supabase/migrations/20260913161938_realign_invitation_state.sql',
  'utf8',
)
test(
  'repeated managed-athlete creation reuses the pending invitation athlete',
  () => {
    assert.match(
      sql,
      /from public\.athlete_invitations as invitation[\s\S]*invitation\.coach_id = v_coach_id[\s\S]*invitation\.email_normalized = v_email[\s\S]*invitation\.status = 'pending'[\s\S]*athlete\.user_id is null/i,
    )

    assert.match(
      sql,
      /if v_id is not null then[\s\S]*update public\.athletes[\s\S]*on conflict on constraint coach_athletes_pkey[\s\S]*return v_id/i,
    )
  },
)

test(
  'reinvite onboarding reconciles the Auth athlete without losing coach data',
  () => {
    for (const table of [
      'programs',
      'test_plans',
      'test_sessions',
    ]) {
      assert.match(
        sql,
        new RegExp(
          `update public\\.${table}[\\s\\S]*set athlete_id = v_athlete_id[\\s\\S]*athlete_id = v_invited_athlete_id[\\s\\S]*(coach_id = v_coach_id|and .*\\.coach_id = v_coach_id)`,
          'i',
        ),
      )
    }

    assert.match(
      sql,
      /update public\.athlete_invitations[\s\S]*status = 'accepted'[\s\S]*athlete_id = v_athlete_id/i,
    )
  },
)

test(
  'invited-athlete access is scoped to the linked athlete identity',
  () => {
    assert.match(
      sql,
      /athlete_id = private\.current_athlete_id\(\)/i,
    )

    assert.doesNotMatch(
      sql,
      /athlete_id = \(select auth\.uid\(\)\)/i,
    )
  },
)
