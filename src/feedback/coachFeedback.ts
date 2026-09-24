import type { ProgramType } from '../programs/programType'

export type FeedbackEntry = {
  id: string; athleteId: string; athleteName: string; programType: ProgramType; sessionTitle: string; submittedAt: string
  completionOutcome: 'completed' | 'partial' | 'not_completed' | null; sessionRpe: number | null; notes: string
  painPresent: boolean; painVas: number | null; painExerciseId: string | null; painExerciseName: string | null; painPersistsPostSession: boolean | null
}

export type FeedbackPersonSummary = {
  athleteId: string; name: string; programType: ProgramType; feedbackCount: number; completedCount: number; notCompletedCount: number
  averageRpe: number | null; painCount: number; noPainCount: number; latestVas: number | null; averageVas: number | null; maxVas: number | null
  persistentPainCount: number; latestFeedbackAt: string; latestNotes: string
}

const roundedAverage = (values: number[]) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null

export function summarizeFeedback(entries: FeedbackEntry[], programType: ProgramType, now = new Date()): FeedbackPersonSummary[] {
  const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30)
  const people = new Map<string, FeedbackEntry[]>()
  for (const entry of entries.filter(item => item.programType === programType)) people.set(entry.athleteId, [...(people.get(entry.athleteId) ?? []), entry])
  return [...people.entries()].map(([athleteId, all]) => {
    const ordered = [...all].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    const recent = ordered.filter(entry => new Date(entry.submittedAt) >= cutoff)
    const rpe = recent.flatMap(entry => entry.sessionRpe === null ? [] : [entry.sessionRpe])
    const vas = recent.flatMap(entry => entry.painPresent && entry.painVas !== null ? [entry.painVas] : [])
    return { athleteId, name: ordered[0].athleteName, programType, feedbackCount: recent.length, completedCount: recent.filter(entry => entry.completionOutcome === 'completed').length, notCompletedCount: recent.filter(entry => entry.completionOutcome !== 'completed').length, averageRpe: roundedAverage(rpe), painCount: recent.filter(entry => entry.painPresent).length, noPainCount: recent.filter(entry => !entry.painPresent).length, latestVas: ordered.find(entry => entry.painPresent && entry.painVas !== null)?.painVas ?? null, averageVas: roundedAverage(vas), maxVas: vas.length ? Math.max(...vas) : null, persistentPainCount: recent.filter(entry => entry.painPersistsPostSession === true).length, latestFeedbackAt: ordered[0].submittedAt, latestNotes: ordered[0].notes }
  }).sort((a, b) => b.latestFeedbackAt.localeCompare(a.latestFeedbackAt))
}

export function painExerciseFrequency(entries: FeedbackEntry[]) {
  const counts = new Map<string, number>()
  for (const entry of entries) if (entry.painPresent && entry.painExerciseName) counts.set(entry.painExerciseName, (counts.get(entry.painExerciseName) ?? 0) + 1)
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
