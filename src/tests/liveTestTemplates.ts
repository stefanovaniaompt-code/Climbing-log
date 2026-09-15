import type { TestProtocolKey } from './testCatalog'

export type LiveGrip = 'open_hand' | 'half_crimp' | 'full_crimp'
export type LiveClinicalKind = 'mvc' | 'endurance' | 'rfd' | 'repeaters'

export type LiveTestTemplate = {
  protocolKey: TestProtocolKey
  name: string
  kind: LiveClinicalKind
  grip: LiveGrip
}

const gripLabel: Record<LiveGrip, string> = {
  open_hand: 'Open Hand',
  half_crimp: 'Half Crimp',
  full_crimp: 'Full Crimp',
}

function templates(
  kind: LiveClinicalKind,
  prefix: string,
  grips: LiveGrip[],
): LiveTestTemplate[] {
  return grips.map(grip => ({
    protocolKey: `live_${kind}_${grip}` as TestProtocolKey,
    name: `${prefix} - ${gripLabel[grip]}`,
    kind,
    grip,
  }))
}

export const LIVE_TEST_TEMPLATES: LiveTestTemplate[] = [
  ...templates('mvc', 'Peak Force / MVC', ['open_hand', 'half_crimp', 'full_crimp']),
  ...templates('endurance', 'Endurance 60% MVC', ['open_hand', 'half_crimp', 'full_crimp']),
  ...templates('rfd', 'RFD', ['open_hand', 'half_crimp', 'full_crimp']),
  ...templates('repeaters', 'Repeaters 7:3', ['open_hand', 'half_crimp']),
]

export function getLiveTestTemplate(protocolKey: TestProtocolKey | string) {
  return LIVE_TEST_TEMPLATES.find(template => template.protocolKey === protocolKey) ?? null
}

export function liveGripLabel(grip: string) {
  return gripLabel[grip as LiveGrip] ?? grip
}
