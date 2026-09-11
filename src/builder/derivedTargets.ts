export type TestTargetReference = 'latest_valid' | 'personal_best' | 'specific_result'
export type TestOutcomeReference = { resultId: string; metricKey: string; value: number; unit: string; testedAt: string; side: string | null; grip: string; bodyWeightKg: number | null }
export type DerivedTarget = TestOutcomeReference & { reference: TestTargetReference; percentage: number; calculatedTarget: number; targetUnit: string; lockedAt: string }

export function chooseTestReference(results: TestOutcomeReference[], reference: TestTargetReference, specificResultId?: string) {
  if (reference === 'specific_result') return results.find(item => item.resultId === specificResultId) ?? null
  if (reference === 'personal_best') return [...results].sort((left, right) => right.value - left.value)[0] ?? null
  return [...results].sort((left, right) => right.testedAt.localeCompare(left.testedAt))[0] ?? null
}

export function calculateDerivedTarget(source: TestOutcomeReference, percentage: number, options: { prescriptionUnit?: string; currentBodyWeightKg?: number } = {}): DerivedTarget {
  if (!Number.isFinite(percentage) || percentage <= 0) throw new Error('La percentuale deve essere maggiore di zero.')
  const totalTarget = source.value * percentage / 100
  let calculatedTarget = totalTarget
  let targetUnit = options.prescriptionUnit ?? source.unit
  if (options.prescriptionUnit === 'kg_external' && source.unit === 'kg_total') {
    const bodyWeight = options.currentBodyWeightKg ?? source.bodyWeightKg
    if (!bodyWeight) throw new Error('Serve il peso corporeo per ricavare il carico esterno.')
    calculatedTarget = totalTarget - bodyWeight
    targetUnit = 'kg_external'
  }
  return { ...source, reference: 'latest_valid', percentage, calculatedTarget, targetUnit, lockedAt: new Date().toISOString() }
}

export function hasNewerTest(target: DerivedTarget, results: TestOutcomeReference[]) {
  return results.some(result => result.metricKey === target.metricKey && result.side === target.side && result.grip === target.grip && result.testedAt > target.testedAt)
}
