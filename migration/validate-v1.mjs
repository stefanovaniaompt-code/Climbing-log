import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const LOCAL_STORAGE_KEY = 'stefano-climbing-log-v1'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateLegacyBackup(input) {
  const errors = []
  const warnings = []

  if (!isRecord(input)) {
    return { valid: false, errors: ['La radice del backup deve essere un oggetto JSON.'], warnings, counts: emptyCounts() }
  }

  if (!Array.isArray(input.weeks)) errors.push('weeks deve essere un array.')
  if (input.settings !== undefined && !isRecord(input.settings)) errors.push('settings deve essere un oggetto.')
  if (input.currentWeek !== undefined && !Number.isInteger(input.currentWeek)) errors.push('currentWeek deve essere un intero.')

  const settings = isRecord(input.settings) ? input.settings : {}
  for (const field of ['bodyWeight', 'pull1RM', 'block1RM', 'rounding']) {
    if (settings[field] !== undefined && !finiteNumber(settings[field])) errors.push(`settings.${field} deve essere numerico.`)
  }

  const counts = emptyCounts()
  const weeks = Array.isArray(input.weeks) ? input.weeks : []
  counts.weeks = weeks.length

  weeks.forEach((week, weekIndex) => {
    if (!isRecord(week)) {
      errors.push(`weeks[${weekIndex}] deve essere un oggetto.`)
      return
    }
    if (week.routes !== undefined && !Array.isArray(week.routes)) errors.push(`weeks[${weekIndex}].routes deve essere un array.`)
    if (week.ex !== undefined && !isRecord(week.ex)) errors.push(`weeks[${weekIndex}].ex deve essere un oggetto indicizzato per esercizio.`)

    const routes = Array.isArray(week.routes) ? week.routes : []
    counts.routes += routes.length
    const exercises = isRecord(week.ex) ? Object.entries(week.ex) : []
    counts.exercises += exercises.length

    for (const [exerciseKey, log] of exercises) {
      if (!isRecord(log)) {
        errors.push(`weeks[${weekIndex}].ex.${exerciseKey} deve essere un oggetto.`)
        continue
      }
      if (log.done === true) counts.completedExercises += 1
      if (Array.isArray(log.setActual)) counts.sets += log.setActual.length
      if (Array.isArray(log.ana)) counts.anaerobicSets += log.ana.length
      if (log.rpe !== undefined && !finiteNumber(log.rpe)) warnings.push(`RPE non numerico in settimana ${weekIndex + 1}, esercizio ${exerciseKey}.`)
    }
  })

  if (!('version' in input)) warnings.push('Versione assente: il backup sarà marcato legacy-unknown.')
  if (weeks.length === 0) warnings.push('Il backup non contiene settimane.')

  return { valid: errors.length === 0, errors, warnings, counts }
}

export function buildDryRunPlan(input) {
  const validation = validateLegacyBackup(input)
  if (!validation.valid) return { source: LOCAL_STORAGE_KEY, mode: 'dry-run', ...validation, staging: null }

  const weeks = input.weeks ?? []
  const staging = {
    athleteSettings: isRecord(input.settings) ? { ...input.settings } : {},
    trainingWeeks: [],
    exerciseLogs: [],
    routeLogs: [],
  }

  weeks.forEach((week, weekIndex) => {
    const weekId = `legacy-week-${String(weekIndex + 1).padStart(3, '0')}`
    staging.trainingWeeks.push({
      legacyId: weekId,
      position: weekIndex,
      name: typeof week.name === 'string' ? week.name : `Settimana ${weekIndex + 1}`,
      notes: typeof week.weekNotes === 'string' ? week.weekNotes : '',
      day3Notes: typeof week.day3Notes === 'string' ? week.day3Notes : '',
    })

    const exerciseEntries = isRecord(week.ex) ? Object.entries(week.ex) : []
    exerciseEntries.forEach(([exerciseKey, log], exerciseIndex) => {
      if (!isRecord(log)) return
      staging.exerciseLogs.push({
        legacyId: `${weekId}-exercise-${String(exerciseIndex + 1).padStart(3, '0')}`,
        weekLegacyId: weekId,
        exerciseKey,
        done: log.done === true,
        actualLoad: finiteNumber(log.actualLoad) ? log.actualLoad : null,
        rpe: finiteNumber(log.rpe) ? log.rpe : null,
        notes: typeof log.notes === 'string' ? log.notes : '',
        setActual: Array.isArray(log.setActual) ? log.setActual : [],
        anaerobicSets: Array.isArray(log.ana) ? log.ana : [],
      })
    })

    const routes = Array.isArray(week.routes) ? week.routes : []
    routes.forEach((route, routeIndex) => staging.routeLogs.push({
      legacyId: `${weekId}-route-${String(routeIndex + 1).padStart(3, '0')}`,
      weekLegacyId: weekId,
      position: routeIndex,
      source: route,
    }))
  })

  const canonical = JSON.stringify(staging)
  return {
    source: LOCAL_STORAGE_KEY,
    sourceVersion: input.version ?? 'legacy-unknown',
    mode: 'dry-run',
    ...validation,
    checksum: createHash('sha256').update(canonical).digest('hex'),
    staging,
  }
}

function emptyCounts() {
  return { weeks: 0, exercises: 0, completedExercises: 0, sets: 0, anaerobicSets: 0, routes: 0 }
}

async function main() {
  const filePath = process.argv[2]
  if (!filePath) throw new Error('Uso: node migration/validate-v1.mjs <backup-v1.json>')
  const input = JSON.parse(await readFile(filePath, 'utf8'))
  const plan = buildDryRunPlan(input)
  const summary = {
    source: plan.source,
    sourceVersion: plan.sourceVersion,
    mode: plan.mode,
    valid: plan.valid,
    counts: plan.counts,
    warnings: plan.warnings,
    errors: plan.errors,
    checksum: plan.checksum ?? null,
    writesPerformed: 0,
  }
  console.log(JSON.stringify(summary, null, 2))
  if (!plan.valid) process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main()
