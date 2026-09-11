export type ImportReport = {
  valid: boolean
  fileName: string
  version: string
  counts: Record<'weeks' | 'exercises' | 'sets' | 'anaerobicSets' | 'routes', number>
  errors: string[]
  warnings: string[]
  checksum: string | null
  writesPerformed: 0
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

async function digest(value: string) {
  if (!crypto.subtle) return null
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function inspectLegacyFile(file: File): Promise<ImportReport> {
  const counts = { weeks: 0, exercises: 0, sets: 0, anaerobicSets: 0, routes: 0 }
  const errors: string[] = []
  const warnings: string[] = []
  let data: unknown

  try { data = JSON.parse(await file.text()) }
  catch { errors.push('Il file non contiene JSON valido.') }

  if (!isObject(data)) errors.push('La radice del backup deve essere un oggetto.')
  const root = isObject(data) ? data : {}
  const weeks = Array.isArray(root.weeks) ? root.weeks : []
  if (!Array.isArray(root.weeks)) errors.push('weeks deve essere un array.')
  counts.weeks = weeks.length

  weeks.forEach((week, index) => {
    if (!isObject(week)) return errors.push(`Settimana ${index + 1} non valida.`)
    counts.routes += Array.isArray(week.routes) ? week.routes.length : 0
    const exercises = isObject(week.ex) ? Object.values(week.ex) : []
    counts.exercises += exercises.length
    exercises.forEach(log => {
      if (!isObject(log)) return
      counts.sets += Array.isArray(log.setActual) ? log.setActual.length : 0
      counts.anaerobicSets += Array.isArray(log.ana) ? log.ana.length : 0
    })
  })

  if (!('version' in root)) warnings.push('Versione assente: verrà marcato legacy-unknown.')
  if (counts.weeks === 0) warnings.push('Il backup non contiene settimane.')
  return { valid: errors.length === 0, fileName: file.name, version: String(root.version ?? 'legacy-unknown'), counts, errors, warnings, checksum: await digest(JSON.stringify(data)), writesPerformed: 0 }
}
