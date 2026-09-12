import type { TrainingWeek } from './athleteHome'

export type AthleteWeekBlock = {
  key: string
  label: string
  weeks: TrainingWeek[]
}

function normalizedBlockLabel(week: TrainingWeek) {
  return (week.blockName || week.phase || 'Programma').trim() || 'Programma'
}

export function buildAthleteWeekBlocks(weeks: TrainingWeek[]): AthleteWeekBlock[] {
  const ordered = [...weeks].sort((left, right) => left.weekNumber - right.weekNumber)
  const blocks: AthleteWeekBlock[] = []

  for (const week of ordered) {
    const label = normalizedBlockLabel(week)
    const previous = blocks.at(-1)

    if (previous && previous.label === label) {
      previous.weeks.push(week)
      continue
    }

    blocks.push({
      key: `${week.id}:${label}`,
      label,
      weeks: [week],
    })
  }

  return blocks
}

export function blockForWeek(
  blocks: AthleteWeekBlock[],
  weekId: string,
): AthleteWeekBlock | null {
  return blocks.find(block => block.weeks.some(week => week.id === weekId)) ?? null
}

export function statusLabel(status: string) {
  if (status === 'completed') return 'COMPLETATA'
  if (status === 'in_progress') return 'IN CORSO'
  if (status === 'skipped') return 'SALTATA'
  return 'PIANIFICATA'
}
