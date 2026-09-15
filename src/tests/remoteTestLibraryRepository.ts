import { dataRuntime } from '../dataRuntime'
import { supabase } from '../lib/supabase'
import type { AppProfile } from '../onboarding/types'
import {
  REMOTE_TEMPLATE_BLUEPRINTS,
  type RemoteOutputField,
  type RemoteTemplateSettings,
  type RemoteTestTemplate,
} from './remoteTestTemplates'
import type { TestProtocolKey } from './testCatalog'

type LibraryRow = {
  id: string
  coach_id: string
  name: string
  category: string | null
  instructions: unknown
  metric_definitions: unknown
  video_url: string | null
  protocol_key: string | null
  protocol_version: string
  protocol_config: Record<string, unknown> | null
}

const selectColumns = 'id,coach_id,name,category,instructions,metric_definitions,video_url,protocol_key,protocol_version,protocol_config'

const isDemo = (profile: AppProfile) =>
  !supabase ||
  profile.userId.startsWith('00000000-') ||
  dataRuntime.backendSchema !== 'legacy-v1'

function isOutputSchema(value: unknown): value is RemoteOutputField[] {
  return Array.isArray(value) && value.every(field => {
    if (!field || typeof field !== 'object') return false
    const candidate = field as Partial<RemoteOutputField>
    return (
      typeof candidate.key === 'string' &&
      typeof candidate.label === 'string' &&
      (candidate.type === 'integer' || candidate.type === 'number') &&
      (candidate.unit === 'rep' || candidate.unit === 'kg' || candidate.unit === 's')
    )
  })
}

function fromRow(row: LibraryRow): RemoteTestTemplate | null {
  const config = row.protocol_config ?? {}
  if (config.mode !== 'remote' || !row.protocol_key) return null

  const availableSettings =
    config.availableSettings && typeof config.availableSettings === 'object'
      ? config.availableSettings as RemoteTemplateSettings
      : {}

  const rawSchemas =
    config.outputSchemas && typeof config.outputSchemas === 'object'
      ? config.outputSchemas as Record<string, unknown>
      : {}

  const outputSchemas: RemoteTestTemplate['outputSchemas'] = {}
  if (isOutputSchema(rawSchemas.right_left)) outputSchemas.right_left = rawSchemas.right_left
  if (isOutputSchema(rawSchemas.bilateral)) outputSchemas.bilateral = rawSchemas.bilateral

  return {
    id: row.id,
    coachId: row.coach_id,
    protocolKey: row.protocol_key as TestProtocolKey,
    protocolVersion: row.protocol_version,
    name: row.name,
    category: row.category ?? 'Test a distanza',
    instruction: typeof config.instruction === 'string' ? config.instruction : '',
    videoUrl: row.video_url ?? '',
    outputSchema: isOutputSchema(row.metric_definitions) ? row.metric_definitions : [],
    outputSchemas,
    availableSettings,
  }
}

function demoTemplates(profile: AppProfile): RemoteTestTemplate[] {
  return REMOTE_TEMPLATE_BLUEPRINTS.map((template, index) => ({
    ...template,
    id: `remote-template-${index + 1}`,
    coachId: profile.userId,
    videoUrl: '',
  }))
}

export async function loadRemoteTestTemplates(profile: AppProfile) {
  if (isDemo(profile)) return demoTemplates(profile)

  const result = await supabase!
    .from('test_library')
    .select(selectColumns)
    .eq('archived', false)
    .eq('protocol_config->>mode', 'remote')
    .order('name')

  if (result.error) throw result.error

  return ((result.data ?? []) as LibraryRow[])
    .map(fromRow)
    .filter((template): template is RemoteTestTemplate => template !== null)
}

export async function ensureRemoteTestLibrary(profile: AppProfile) {
  if (profile.role !== 'coach') return loadRemoteTestTemplates(profile)
  if (isDemo(profile)) return demoTemplates(profile)

  const current = await loadRemoteTestTemplates(profile)
  const existingKeys = new Set(current.map(template => template.protocolKey))
  const missing = REMOTE_TEMPLATE_BLUEPRINTS.filter(template => !existingKeys.has(template.protocolKey))

  if (missing.length) {
    const result = await supabase!
      .from('test_library')
      .insert(missing.map(template => ({
        coach_id: profile.userId,
        name: template.name,
        category: template.category,
        objective: 'Test manuale a distanza',
        material: null,
        instructions: [template.instruction],
        metric_definitions: template.outputSchema,
        video_url: null,
        protocol_key: template.protocolKey,
        protocol_version: template.protocolVersion,
        primary_metric_key: template.outputSchema[0]?.key ?? null,
        measurement_sources: ['manual'],
        side_applicable: false,
        grip_applicable: false,
        protocol_config: {
          mode: 'remote',
          instruction: template.instruction,
          availableSettings: template.availableSettings,
          outputSchemas: template.outputSchemas ?? {},
        },
      })))

    if (result.error && result.error.code !== '23505') throw result.error
  }

  return loadRemoteTestTemplates(profile)
}

export async function loadRemoteTemplatesByIds(
  profile: AppProfile,
  ids: string[],
) {
  if (!ids.length || isDemo(profile)) return new Map<string, RemoteTestTemplate>()

  const result = await supabase!
    .from('test_library')
    .select(selectColumns)
    .in('id', ids)

  if (result.error) throw result.error

  const templates = ((result.data ?? []) as LibraryRow[])
    .map(fromRow)
    .filter((template): template is RemoteTestTemplate => template !== null)

  return new Map(templates.map(template => [template.id, template]))
}

export async function updateRemoteTemplateVideo(
  profile: AppProfile,
  templateId: string,
  videoUrl: string,
) {
  if (profile.role !== 'coach') throw new Error('Solo il coach può modificare il video tutorial.')

  const normalized = videoUrl.trim()
  if (normalized) {
    const parsed = new URL(normalized)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Il video deve usare un URL http o https.')
    }
  }

  if (!isDemo(profile)) {
    const result = await supabase!
      .from('test_library')
      .update({ video_url: normalized || null, updated_at: new Date().toISOString() })
      .eq('id', templateId)
      .eq('coach_id', profile.userId)

    if (result.error) throw result.error
  }

  return normalized
}
