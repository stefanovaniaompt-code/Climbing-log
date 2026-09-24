export type ProgramType = 'athlete' | 'patient'

export function normalizeProgramType(value: unknown): ProgramType {
  return value === 'patient' ? 'patient' : 'athlete'
}
