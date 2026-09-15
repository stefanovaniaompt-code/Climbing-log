import { describe, expect, it } from 'vitest'
import { LIVE_TEST_TEMPLATES } from './liveTestTemplates'

describe('live Tindeq templates', () => {
  it('exposes exactly the 11 independent clinical templates without legacy protocols', () => {
    expect(LIVE_TEST_TEMPLATES).toHaveLength(11)
    expect(new Set(LIVE_TEST_TEMPLATES.map(template => template.protocolKey)).size).toBe(11)
    expect(LIVE_TEST_TEMPLATES.map(template => template.protocolKey)).not.toContain('peak_force')
    expect(LIVE_TEST_TEMPLATES.map(template => template.protocolKey)).not.toContain('endurance')
    expect(LIVE_TEST_TEMPLATES.filter(template => template.kind === 'repeaters').map(template => template.grip)).toEqual(['open_hand', 'half_crimp'])
  })
})
