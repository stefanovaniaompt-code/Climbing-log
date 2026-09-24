import { describe, expect, it } from 'vitest'
import { normalizeProgramType } from './programType'

describe('program type', () => {
  it('mantiene patient', () => expect(normalizeProgramType('patient')).toBe('patient'))
  it('usa athlete come default compatibile', () => expect(normalizeProgramType(undefined)).toBe('athlete'))
})
