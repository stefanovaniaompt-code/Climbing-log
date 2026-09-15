import {
  dataRuntime,
} from '../dataRuntime'

import {
  supabase,
} from '../lib/supabase'

import type {
  AppProfile,
} from '../onboarding/types'

import {
  syncTestSession,
  syncTestSessionItem,
} from './testAttemptRepository'

import type {
  RemoteManualValue,
  RemoteTestAssignmentState,
  RemoteTestItem,
} from './remoteTestRunner'

import type {
  TestSessionDraft,
  TestSessionItemDraft,
  TestSessionStatus,
  TestItemStatus,
  TestSide,
} from './testAttemptTypes'

import { loadRemoteTemplatesByIds } from './remoteTestLibraryRepository'
import type { RemoteTestTemplate } from './remoteTestTemplates'

const isDemo = (
  profile: AppProfile,
) =>
  !supabase ||
  profile.userId.startsWith(
    '00000000-',
  ) ||
  dataRuntime.backendSchema !==
    'legacy-v1'

type SessionRow = {
  id: string
  athlete_id: string
  coach_id: string | null
  mode: 'remote'
  status: TestSessionStatus
  tested_at: string
  body_weight_kg: number | string | null
  protocol_version: string | null
  context: Record<string, unknown> | null
  started_at: string | null
  ended_at: string | null
}

type ItemRow = {
  id: string
  test_session_id: string
  test_library_id: string | null
  item_order: number
  protocol_key: TestSessionItemDraft['protocolKey']
  protocol_version: string
  side: TestSide
  grip: string | null
  source: 'manual'
  config: Record<string, unknown> | null
  status: TestItemStatus
  draft_values: RemoteManualValue[] | null
  athlete_notes: string | null
  completed_at: string | null
}

function sessionFromRow(
  row: SessionRow,
): TestSessionDraft {
  return {
    id:
      row.id,

    athleteId:
      row.athlete_id,

    coachId:
      row.coach_id,

    mode:
      'remote',

    status:
      row.status,

    testedAt:
      row.tested_at,

    bodyWeightKg:
      row.body_weight_kg ===
        null
        ? null
        : Number(
            row.body_weight_kg,
          ),

    protocolVersion:
      row.protocol_version ??
      '1.0',

    context:
      row.context ?? {},

    startedAt:
      row.started_at,

    endedAt:
      row.ended_at,
  }
}

function itemFromRow(
  row: ItemRow,
  templates: Map<string, RemoteTestTemplate>,
): RemoteTestItem {
  return {
    item: {
      id:
        row.id,

      testSessionId:
        row.test_session_id,

      testLibraryId:
        row.test_library_id,

      itemOrder:
        row.item_order,

      protocolKey:
        row.protocol_key,

      protocolVersion:
        row.protocol_version,

      side:
        row.side,

      grip:
        row.grip ?? '',

      source:
        'manual',

      config:
        row.config ?? {},

      status:
        row.status,
    },

    values:
      Array.isArray(
        row.draft_values,
      )
        ? row.draft_values
        : [],

    notes:
      row.athlete_notes ?? '',

    completedAt:
      row.completed_at,

    template:
      row.test_library_id
        ? templates.get(row.test_library_id) ?? null
        : null,
  }
}

export function remoteItemRpcPayload(
  entry: RemoteTestItem,
) {
  return {
    p_item_id:
      entry.item.id,

    p_values:
      entry.values,

    p_notes:
      entry.notes,

    p_status:
      entry.item.status,

    p_completed_at:
      entry.completedAt,
  }
}

export async function createRemoteAssignmentRecord(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
) {
  if (
    profile.role !==
    'coach'
  ) {
    throw new Error(
      'Only a coach can assign remote tests.',
    )
  }

  if (
    state.session.mode !==
    'remote'
  ) {
    throw new Error(
      'Expected a remote test session.',
    )
  }

  if (isDemo(profile)) {
    return state
  }

  await syncTestSession(
    profile,
    state.session,
  )

  for (
    const entry
    of state.items
  ) {
    await syncTestSessionItem(
      profile,
      entry.item,
    )
  }

  return state
}

export async function loadRemoteAssignments(
  profile: AppProfile,
  athleteId?: string,
): Promise<
  RemoteTestAssignmentState[]
> {
  if (isDemo(profile)) {
    return []
  }

  let query =
    supabase!
      .from(
        'test_sessions',
      )
      .select(
        'id,athlete_id,coach_id,mode,status,tested_at,body_weight_kg,protocol_version,context,started_at,ended_at',
      )
      .eq(
        'mode',
        'remote',
      )
      .order(
        'created_at',
        {
          ascending: false,
        },
      )

  if (athleteId) {
    query =
      query.eq(
        'athlete_id',
        athleteId,
      )
  }

  const sessionsResult =
    await query

  if (
    sessionsResult.error
  ) {
    throw sessionsResult.error
  }

  const sessionRows =
    (
      sessionsResult.data ??
      []
    ) as SessionRow[]

  if (
    !sessionRows.length
  ) {
    return []
  }

  const sessionIds =
    sessionRows.map(
      row => row.id,
    )

  const itemsResult =
    await supabase!
      .from(
        'test_session_items',
      )
      .select(
        'id,test_session_id,test_library_id,item_order,protocol_key,protocol_version,side,grip,source,config,status,draft_values,athlete_notes,completed_at',
      )
      .in(
        'test_session_id',
        sessionIds,
      )
      .order(
        'item_order',
        {
          ascending: true,
        },
      )

  if (
    itemsResult.error
  ) {
    throw itemsResult.error
  }

  const items =
    (
      itemsResult.data ??
      []
    ) as ItemRow[]

  const templates = await loadRemoteTemplatesByIds(
    profile,
    [...new Set(items.map(item => item.test_library_id).filter((id): id is string => Boolean(id)))],
  )

  return sessionRows.map(
    sessionRow => ({
      session:
        sessionFromRow(
          sessionRow,
        ),

      items:
        items
          .filter(
            item =>
              item
                .test_session_id ===
              sessionRow.id,
          )
          .map(item => itemFromRow(item, templates)),

      activeItemId:
        null,
    }),
  )
}

export async function startRemoteAssignmentRecord(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
) {
  if (
    profile.role !==
    'athlete'
  ) {
    throw new Error(
      'Only the athlete can start a remote test.',
    )
  }

  if (isDemo(profile)) {
    return state
  }

  const result =
    await supabase!.rpc(
      'start_remote_test_session',
      {
        p_session_id:
          state.session.id,

        p_started_at:
          state.session.startedAt ??
          new Date()
            .toISOString(),
      },
    )

  if (result.error) {
    throw result.error
  }

  return state
}

export async function saveRemoteAssignmentDraft(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
) {
  if (
    profile.role !==
    'athlete'
  ) {
    throw new Error(
      'Only the athlete can save a remote test draft.',
    )
  }

  if (isDemo(profile)) {
    return state
  }

  for (
    const entry
    of state.items
  ) {
    const result =
      await supabase!.rpc(
        'save_remote_test_item',
        remoteItemRpcPayload(
          entry,
        ),
      )

    if (result.error) {
      throw result.error
    }
  }

  return state
}

export async function completeRemoteAssignmentRecord(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
) {
  await saveRemoteAssignmentDraft(
    profile,
    state,
  )

  if (isDemo(profile)) {
    return state
  }

  const result =
    await supabase!.rpc(
      'complete_remote_test_session',
      {
        p_session_id:
          state.session.id,

        p_ended_at:
          state.session.endedAt ??
          new Date()
            .toISOString(),
      },
    )

  if (result.error) {
    throw result.error
  }

  return state
}


export async function cancelRemoteAssignmentRecord(
  profile: AppProfile,
  state: RemoteTestAssignmentState,
) {
  if (
    profile.role !==
    'coach'
  ) {
    throw new Error(
      'Only a coach can cancel a remote assignment.',
    )
  }

  if (
    state.session.status !==
    'cancelled'
  ) {
    throw new Error(
      'Expected a cancelled remote assignment.',
    )
  }

  if (isDemo(profile)) {
    return state
  }

  await syncTestSession(
    profile,
    state.session,
  )

  return state
}
