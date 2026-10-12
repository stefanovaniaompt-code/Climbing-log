export type PrescriptionRecord = Record<string, unknown>

export function hasPrescriptionField(prescription: PrescriptionRecord, field: string) {
  return Object.prototype.hasOwnProperty.call(prescription, field)
}

export function optionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number.NaN
  return Number.isFinite(numeric) ? numeric : null
}

export function optionalNonNegativeNumber(value: unknown): number | null {
  const numeric = optionalFiniteNumber(value)
  return numeric !== null && numeric >= 0 ? numeric : null
}

function normalizedText(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
}

const nonKilogramLoadTypes = new Set([
  'bodyweight',
  'body_weight',
  'self_weight',
  'climbing_grade',
  'grade',
])

const kilogramUnits = new Set([
  'kg',
  'kgs',
  'kilogram',
  'kilograms',
  'chilogrammo',
  'chilogrammi',
])

/**
 * Numeric load fields are kilograms only when the surrounding prescription
 * does not explicitly describe bodyweight, a climbing grade, or another unit.
 * Missing metadata remains compatible with historical records that used bare
 * numeric load_value strings for kilograms.
 */
export function usesKilogramLoads(prescription: PrescriptionRecord) {
  const loadType = normalizedText(prescription.load_type)
  if (nonKilogramLoadTypes.has(loadType)) return false
  const unit = normalizedText(prescription.unit)
  return !unit || kilogramUnits.has(unit)
}

const numericDoseSegment = /^\d+(?:[.,]\d+)?\s*(?:rep(?:etizioni)?|ripetizioni|s|sec(?:ondi)?|secondi)$/i
const structuredDoseSegment = /^(?:\d+(?:[.,]\d+)?\s*(?:kg|kgs)?\s*[×x]\s*)?\d+(?:[.,]\d+)?\s*(?:rep(?:etizioni)?|ripetizioni|s|sec(?:ondi)?|secondi)?$/i
const numericDoseSequence = /^\d+(?:\s*[-–→]\s*\d+)+(?:\s*(?:blocchi|rep(?:etizioni)?))?$/i

/**
 * Extracts only the prose that is not already represented by numeric fields or
 * structured rows. Ambiguous prose is retained as a visibly separate note.
 */
export function legacyDoseDescription(prescription: PrescriptionRecord): string | null {
  if (typeof prescription.dose !== 'string') return null
  const segments = prescription.dose.split(/\s*[·•;]\s*/).map(value => value.trim()).filter(Boolean)
  const descriptive = segments.filter(segment => (
    !numericDoseSegment.test(segment)
    && !structuredDoseSegment.test(segment)
    && !numericDoseSequence.test(segment)
  ))
  return descriptive.length ? descriptive.join(' · ') : null
}
