/** An opt-in prescription format. Records without this marker remain legacy. */
export type IntentionalLoadSource =
  | { type: 'manual_max'; maxKg: number | null }
  | { type: 'athlete_test'; resultId: string; metricLabel: string; measuredAt: string; value: number; unit: 'kg' | 'kg_external' | 'kg_total' }

export type IntentionalLoadPlan =
  | { version: 1; mode: 'percentage'; source: IntentionalLoadSource | null }
  | { version: 1; mode: 'manual_kg' }

export type IntentionalSetRow = {
  setNumber: number
  reps: number | null
  percentage: number | null
  manualKg: number | null
  calculatedKg: number | null
  unit: string
}

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function isIntentionalBlockLifting(name: string) {
  return /intentional block lifting/i.test(name)
}

export function isDirectKilogramUnit(value: string): value is 'kg' | 'kg_external' | 'kg_total' {
  return value === 'kg' || value === 'kg_external' || value === 'kg_total'
}

/** Preview only. Never migrate historic prose without an explicit coach action. */
export function previewLegacyIntentionalProgression(instructions: string | null) {
  if (!instructions) return null
  const lines = instructions.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const rows = lines.flatMap(line => {
    const match = line.match(/^(\d+)\s*rep(?:etizioni)?\s+(\d+(?:[.,]\d+)?)\s*%$/i)
    return match ? [{ reps: Number(match[1]), percentage: Number(match[2].replace(',', '.')) }] : []
  })
  const maxMatch = instructions.match(/massimale\s+di\s+(\d+(?:[.,]\d+)?)\s*kg/i)
  const maxKg = maxMatch ? Number(maxMatch[1].replace(',', '.')) : null
  if (rows.length < 2 || !rows.every(row => row.reps > 0 && row.percentage > 0) || !maxKg || maxKg <= 0) return null
  return { maxKg, rows }
}

/** Keep coaching prose while avoiding a second, possibly stale load prescription. */
export function intentionalAthleteGuidance(prescription: JsonRecord, instructions: string | null, showLegacyRows = false): string | null {
  if (!instructions || (!readIntentionalLoadPlan(prescription) && !showLegacyRows)) return instructions
  const withoutLegacyRows = instructions
    .replace(/carichi\s+calcolati[^\r\n]*/gi, '')
    .split(/\r?\n/)
    .filter(line => !/^\s*\d+\s*rep(?:etizioni)?\s+\d+(?:[.,]\d+)?\s*%\s*$/i.test(line))
    .map(line => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim()
  return withoutLegacyRows || null
}

export function readIntentionalLoadPlan(prescription: JsonRecord): IntentionalLoadPlan | null {
  const raw = record(prescription.intentionalLoad)
  if (!raw || raw.version !== 1) return null
  if (raw.mode === 'manual_kg') return { version: 1, mode: 'manual_kg' }
  if (raw.mode !== 'percentage') return null
  const source = record(raw.source)
  if (!source) return { version: 1, mode: 'percentage', source: null }
  if (source.type === 'manual_max') return {
    version: 1,
    mode: 'percentage',
    source: { type: 'manual_max', maxKg: finiteNumber(source.maxKg) },
  }
  const value = finiteNumber(source.value)
  const unit = typeof source.unit === 'string' ? source.unit : ''
  if (source.type === 'athlete_test' && value !== null && isDirectKilogramUnit(unit)) return {
    version: 1,
    mode: 'percentage',
    source: {
      type: 'athlete_test',
      resultId: String(source.resultId ?? ''),
      metricLabel: String(source.metricLabel ?? ''),
      measuredAt: String(source.measuredAt ?? ''),
      value,
      unit,
    },
  }
  return { version: 1, mode: 'percentage', source: null }
}

export function intentionalLoadUnit(plan: IntentionalLoadPlan): string {
  if (plan.mode === 'manual_kg' || !plan.source || plan.source.type === 'manual_max') return 'kg'
  if (plan.source.unit === 'kg_external') return 'kg esterni'
  if (plan.source.unit === 'kg_total') return 'kg totali'
  return 'kg'
}

export function resolveIntentionalSetRows(prescription: JsonRecord): IntentionalSetRow[] {
  const plan = readIntentionalLoadPlan(prescription)
  if (!plan) return []
  const rawSteps = Array.isArray(prescription.steps) ? prescription.steps : []
  const setCount = finiteNumber(prescription.sets)
  const count = setCount !== null && Number.isSafeInteger(setCount) && setCount > 0 ? setCount : rawSteps.length
  const unit = intentionalLoadUnit(plan)
  return Array.from({ length: count }, (_, index) => {
    const step = record(rawSteps[index]) ?? {}
    const rawReps = finiteNumber(step.reps)
    const reps = rawReps !== null && Number.isSafeInteger(rawReps) && rawReps > 0 ? rawReps : null
    const percentage = plan.mode === 'percentage' ? finiteNumber(step.percentage) : null
    const manualKg = plan.mode === 'manual_kg' ? finiteNumber(step.loadKg) : null
    const base = plan.mode === 'percentage' && plan.source
      ? plan.source.type === 'manual_max' ? plan.source.maxKg : plan.source.value
      : null
    const calculatedKg = base !== null && base !== undefined && percentage !== null && percentage > 0
      ? Math.round(base * percentage / 100 * 2) / 2
      : null
    return { setNumber: index + 1, reps, percentage, manualKg, calculatedKg, unit }
  })
}

export function validateIntentionalLoadPlan(prescription: JsonRecord): string | null {
  const plan = readIntentionalLoadPlan(prescription)
  if (!plan) return null
  const sets = finiteNumber(prescription.sets)
  if (sets === null || !Number.isSafeInteger(sets) || sets < 1) return 'Inserisci un numero di serie valido.'
  if (!Array.isArray(prescription.steps) || prescription.steps.length !== sets) return 'Completa una riga per ogni serie.'
  if (plan.mode === 'percentage') {
    if (!plan.source) return 'Scegli un test atleta o inserisci un massimale manuale.'
    if (plan.source.type === 'manual_max' && !(plan.source.maxKg !== null && plan.source.maxKg > 0)) return 'Inserisci un massimale maggiore di zero.'
    if (plan.source.type === 'athlete_test' && (!plan.source.resultId || !(plan.source.value > 0))) return 'Seleziona un test valido.'
  }
  const rows = resolveIntentionalSetRows(prescription)
  if (rows.some(row => row.reps === null)) return 'Inserisci le ripetizioni di ogni serie.'
  if (plan.mode === 'percentage' && rows.some(row => row.percentage === null || row.percentage <= 0 || row.percentage > 500)) return 'Inserisci una percentuale valida per ogni serie.'
  if (plan.mode === 'manual_kg' && rows.some(row => row.manualKg === null || row.manualKg < 0)) return 'Inserisci il carico in kg di ogni serie.'
  return null
}
