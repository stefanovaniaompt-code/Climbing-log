import type { TestProtocolKey } from './testCatalog'

export type RemoteOutputField = {
  key: string
  label: string
  type: 'integer' | 'number'
  unit: 'rep' | 'kg' | 's'
  min: number
  required: boolean
  side?: 'right' | 'left'
}

export type RemoteTemplateSettings = {
  beam?: Array<'high' | 'low'>
  laterality?: Array<'right_left' | 'bilateral'>
}

export type RemoteTestTemplate = {
  id: string
  coachId: string
  protocolKey: TestProtocolKey
  protocolVersion: string
  name: string
  category: string
  instruction: string
  videoUrl: string
  outputSchema: RemoteOutputField[]
  outputSchemas?: Partial<
    Record<'right_left' | 'bilateral', RemoteOutputField[]>
  >
  availableSettings: RemoteTemplateSettings
}

type RemoteTemplateBlueprint = Omit<
  RemoteTestTemplate,
  'id' | 'coachId' | 'videoUrl'
>

const repetitions: RemoteOutputField[] = [
  {
    key: 'repetitions',
    label: 'Ripetizioni',
    type: 'integer',
    unit: 'rep',
    min: 0,
    required: true,
  },
]

const maximumLoad: RemoteOutputField[] = [
  {
    key: 'result',
    label: 'Carico massimale',
    type: 'number',
    unit: 'kg',
    min: 0,
    required: true,
  },
]

const duration: RemoteOutputField[] = [
  {
    key: 'result',
    label: 'Tempo',
    type: 'number',
    unit: 's',
    min: 0,
    required: true,
  },
]

function lateralSchemas(
  kind: 'load' | 'duration',
): Record<'right_left' | 'bilateral', RemoteOutputField[]> {
  const isLoad = kind === 'load'
  const unit = isLoad ? 'kg' : 's'
  const noun = isLoad ? 'Carico massimale' : 'Tempo'

  return {
    bilateral: [
      {
        key: 'result',
        label: noun,
        type: 'number',
        unit,
        min: 0,
        required: true,
      },
    ],
    right_left: [
      {
        key: 'right',
        label: `${noun} DX`,
        type: 'number',
        unit,
        min: 0,
        required: true,
        side: 'right',
      },
      {
        key: 'left',
        label: `${noun} SX`,
        type: 'number',
        unit,
        min: 0,
        required: true,
        side: 'left',
      },
    ],
  }
}

const configurableSettings: RemoteTemplateSettings = {
  beam: ['high', 'low'],
  laterality: ['right_left', 'bilateral'],
}

const peakSchemas = lateralSchemas('load')
const enduranceSchemas = lateralSchemas('duration')

export const REMOTE_TEMPLATE_BLUEPRINTS: RemoteTemplateBlueprint[] = [
  {
    protocolKey: 'remote_pullup_max',
    protocolVersion: '1.0',
    name: 'Numero massimale trazioni',
    category: 'Tirata',
    instruction: 'Esegui trazioni complete fino al limite tecnico e inserisci il numero massimo valido.',
    outputSchema: repetitions,
    availableSettings: {},
  },
  {
    protocolKey: 'remote_pushup_max',
    protocolVersion: '1.0',
    name: 'Numero massimale flessioni / push-up',
    category: 'Spinta',
    instruction: 'Esegui push-up completi fino al limite tecnico e inserisci il numero massimo valido.',
    outputSchema: repetitions,
    availableSettings: {},
  },
  {
    protocolKey: 'remote_one_arm_pullup',
    protocolVersion: '1.0',
    name: '1-arm trazione',
    category: 'Tirata',
    instruction: 'Segui il protocollo del video e inserisci il massimo carico completato correttamente.',
    outputSchema: maximumLoad,
    availableSettings: {},
  },
  {
    protocolKey: 'remote_plank_right',
    protocolVersion: '1.0',
    name: 'Plank destro',
    category: 'Core',
    instruction: 'Mantieni la posizione corretta sul lato destro e inserisci il tempo fino al cedimento tecnico.',
    outputSchema: duration,
    availableSettings: {},
  },
  {
    protocolKey: 'remote_plank_left',
    protocolVersion: '1.0',
    name: 'Plank sinistro',
    category: 'Core',
    instruction: 'Mantieni la posizione corretta sul lato sinistro e inserisci il tempo fino al cedimento tecnico.',
    outputSchema: duration,
    availableSettings: {},
  },
  ...(['open_hand', 'half_crimp', 'full_crimp'] as const).map(grip => ({
    protocolKey: `remote_peak_force_${grip}` as TestProtocolKey,
    protocolVersion: '1.0',
    name: `Peak Force - ${grip === 'open_hand' ? 'Open Hand' : grip === 'half_crimp' ? 'Half Crimp' : 'Full Crimp'}`,
    category: 'Dita',
    instruction: 'Trova il massimo carico esterno che riesci a sollevare correttamente e inserisci il risultato in kg.',
    outputSchema: peakSchemas.bilateral,
    outputSchemas: peakSchemas,
    availableSettings: configurableSettings,
  })),
  ...(['open_hand', 'half_crimp', 'full_crimp'] as const).map(grip => ({
    protocolKey: `remote_endurance_60_${grip}` as TestProtocolKey,
    protocolVersion: '1.0',
    name: `Endurance 60% - ${grip === 'open_hand' ? 'Open Hand' : grip === 'half_crimp' ? 'Half Crimp' : 'Full Crimp'}`,
    category: 'Dita',
    instruction: 'Esegui il protocollo al 60% e inserisci il tempo mantenuto prima del cedimento.',
    outputSchema: enduranceSchemas.bilateral,
    outputSchemas: enduranceSchemas,
    availableSettings: configurableSettings,
  })),
]

export function resolveRemoteOutputSchema(
  template: RemoteTestTemplate,
  laterality?: 'right_left' | 'bilateral',
) {
  if (laterality && template.outputSchemas?.[laterality]) {
    return template.outputSchemas[laterality]!
  }

  return template.outputSchema
}

export function remoteOutputSchemaFromConfig(
  config: Record<string, unknown>,
): RemoteOutputField[] {
  const candidate = config.outputSchema

  if (!Array.isArray(candidate)) return []

  return candidate.filter((field): field is RemoteOutputField => {
    if (!field || typeof field !== 'object') return false
    const value = field as Partial<RemoteOutputField>
    return (
      typeof value.key === 'string' &&
      typeof value.label === 'string' &&
      (value.type === 'integer' || value.type === 'number') &&
      (value.unit === 'rep' || value.unit === 'kg' || value.unit === 's') &&
      typeof value.min === 'number'
    )
  })
}
