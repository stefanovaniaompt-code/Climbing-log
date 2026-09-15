import { describe, expect, it } from 'vitest'
import {
  REMOTE_TEMPLATE_BLUEPRINTS,
  resolveRemoteOutputSchema,
  type RemoteTestTemplate,
} from './remoteTestTemplates'

const asTemplate = (protocolKey: string) => ({
  ...REMOTE_TEMPLATE_BLUEPRINTS.find(template => template.protocolKey === protocolKey)!,
  id: `template-${protocolKey}`,
  coachId: 'coach-1',
  videoUrl: `https://video.example/${protocolKey}`,
}) as RemoteTestTemplate

describe('remote test templates', () => {
  it('provides the eleven independent manual templates', () => {
    expect(REMOTE_TEMPLATE_BLUEPRINTS).toHaveLength(11)
    expect(new Set(REMOTE_TEMPLATE_BLUEPRINTS.map(template => template.protocolKey)).size).toBe(11)
    expect(REMOTE_TEMPLATE_BLUEPRINTS.map(template => template.name)).toEqual(expect.arrayContaining([
      'Peak Force - Open Hand',
      'Peak Force - Half Crimp',
      'Peak Force - Full Crimp',
      'Endurance 60% - Open Hand',
      'Endurance 60% - Half Crimp',
      'Endurance 60% - Full Crimp',
    ]))
  })

  it('renders peak force as manual kg fields based on laterality', () => {
    const template = asTemplate('remote_peak_force_half_crimp')
    expect(resolveRemoteOutputSchema(template, 'bilateral')).toMatchObject([
      { key: 'result', unit: 'kg', type: 'number' },
    ])
    expect(resolveRemoteOutputSchema(template, 'right_left')).toMatchObject([
      { key: 'right', unit: 'kg', side: 'right' },
      { key: 'left', unit: 'kg', side: 'left' },
    ])
  })

  it('renders endurance as manual seconds fields based on laterality', () => {
    const template = asTemplate('remote_endurance_60_open_hand')
    expect(resolveRemoteOutputSchema(template, 'right_left')).toMatchObject([
      { key: 'right', unit: 's' },
      { key: 'left', unit: 's' },
    ])
  })
})
