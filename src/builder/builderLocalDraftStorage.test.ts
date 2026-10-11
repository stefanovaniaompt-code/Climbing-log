// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  builderLocalDraftKey,
  claimBuilderLocalDraftRevision,
  clearBuilderLocalDraftRevision,
  listBuilderLocalDrafts,
  readBuilderLocalDraft,
  writeBuilderLocalDraft,
  type BuilderDraftIdentity,
} from './builderLocalDraftStorage'

function identity(userId: string, entityId: string): BuilderDraftIdentity {
  return {
    userId,
    programId: 'program-1',
    entityType: 'exercise',
    entityId,
  }
}

beforeEach(() => window.localStorage.clear())

describe('builderLocalDraftStorage', () => {
  it('conserva numeri, testo e serie strutturate senza copiare i campi invariati', () => {
    const target = identity('coach-1', 'exercise-1')
    const remoteBase = {
      sets: 3,
      reps: 5,
      seconds: 0,
      loadKg: 0,
      rpe: 8,
      restSeconds: 120,
      instructions: 'Tecnica pulita',
      steps: [],
    }
    const current = {
      ...remoteBase,
      loadKg: 32.5,
      instructions: 'Presa aperta · controllo completo',
      steps: [{ label: 'Serie pesante', reps: 4, seconds: 0, loadKg: 31.5 }],
    }

    const result = writeBuilderLocalDraft(target, remoteBase, current, window.localStorage, Date.UTC(2026, 9, 11, 8, 30))

    expect(result).toMatchObject({
      ok: true,
      draft: {
        revision: 1,
        updatedAt: '2026-10-11T08:30:00.000Z',
        changes: {
          loadKg: 32.5,
          instructions: 'Presa aperta · controllo completo',
          steps: [{ label: 'Serie pesante', reps: 4, seconds: 0, loadKg: 31.5 }],
        },
        remoteBase: {
          fields: {
            loadKg: 0,
            instructions: 'Tecnica pulita',
            steps: [],
          },
        },
      },
    })
    expect((result.ok && result.draft ? Object.keys(result.draft.changes) : [])).toEqual(['loadKg', 'instructions', 'steps'])
    expect(readBuilderLocalDraft(target)).toEqual(result.ok ? result.draft : null)
  })

  it('non sovrascrive le bozze di due esercizi differenti', () => {
    const first = identity('coach-1', 'exercise-1')
    const second = identity('coach-1', 'exercise-2')
    writeBuilderLocalDraft(first, { loadKg: 10 }, { loadKg: 12 })
    writeBuilderLocalDraft(second, { loadKg: 20 }, { loadKg: 24 })

    expect(builderLocalDraftKey(first)).not.toBe(builderLocalDraftKey(second))
    expect(readBuilderLocalDraft(first)?.changes).toEqual({ loadKg: 12 })
    expect(readBuilderLocalDraft(second)?.changes).toEqual({ loadKg: 24 })
    expect(listBuilderLocalDrafts('coach-1')).toHaveLength(2)
  })

  it('isola le bozze appartenenti a utenti diversi', () => {
    const firstUser = identity('coach-1', 'exercise-1')
    const secondUser = identity('coach-2', 'exercise-1')
    writeBuilderLocalDraft(firstUser, { restSeconds: 120 }, { restSeconds: 150 })
    writeBuilderLocalDraft(secondUser, { restSeconds: 120 }, { restSeconds: 180 })

    expect(listBuilderLocalDrafts('coach-1')).toEqual([expect.objectContaining({ userId: 'coach-1', changes: { restSeconds: 150 } })])
    expect(listBuilderLocalDrafts('coach-2')).toEqual([expect.objectContaining({ userId: 'coach-2', changes: { restSeconds: 180 } })])
  })

  it('rimuove soltanto la stessa revisione confermata dal server', () => {
    const target = identity('coach-1', 'exercise-1')
    const first = writeBuilderLocalDraft(target, { restSeconds: 120 }, { restSeconds: 150 })
    if (!first.ok || !first.draft) throw new Error('Prima bozza non creata')
    if (!first.draft.generationId) throw new Error('Identità prima generazione assente')
    const second = writeBuilderLocalDraft(
      target,
      { restSeconds: 120 },
      { restSeconds: 180 },
      undefined,
      undefined,
      first.draft.revision,
      { expectedGenerationId: first.draft.generationId },
    )
    if (!second.ok || !second.draft) throw new Error('Seconda bozza non creata')
    if (!second.draft.generationId) throw new Error('Identità seconda revisione assente')

    expect(clearBuilderLocalDraftRevision(target, first.draft.revision, undefined, first.draft.generationId)).toEqual({ ok: true, cleared: false })
    expect(readBuilderLocalDraft(target)?.revision).toBe(second.draft.revision)
    expect(clearBuilderLocalDraftRevision(target, second.draft.revision, undefined, second.draft.generationId)).toEqual({ ok: true, cleared: true })
    expect(readBuilderLocalDraft(target)).toBeNull()
  })

  it('preserva una bozza preesistente quando una nuova sessione modifica un altro campo', () => {
    const target = identity('coach-1', 'exercise-1')
    const previous = writeBuilderLocalDraft(
      target,
      { restSeconds: 120, instructions: '' },
      { restSeconds: 180, instructions: '' },
    )
    const storedBefore = window.localStorage.getItem(builderLocalDraftKey(target))

    const result = writeBuilderLocalDraft(
      target,
      { restSeconds: 120, instructions: '' },
      { restSeconds: 120, instructions: 'Nuova indicazione' },
    )

    expect(previous.ok && previous.draft).toBeTruthy()
    expect(result).toMatchObject({ ok: false, reason: 'unreconciled-draft' })
    expect(window.localStorage.getItem(builderLocalDraftKey(target))).toBe(storedBefore)
    expect(readBuilderLocalDraft(target)?.changes).toEqual({ restSeconds: 180 })
  })

  it('non cancella una bozza preesistente quando il nuovo editor coincide con la base remota', () => {
    const target = identity('coach-1', 'exercise-1')
    const previous = writeBuilderLocalDraft(target, { restSeconds: 120 }, { restSeconds: 180 })
    if (!previous.ok || !previous.draft) throw new Error('Bozza non creata')

    const result = writeBuilderLocalDraft(target, { restSeconds: 120 }, { restSeconds: 120 })

    expect(result).toMatchObject({ ok: false, reason: 'unreconciled-draft' })
    expect(readBuilderLocalDraft(target)).toEqual(previous.draft)
    expect(clearBuilderLocalDraftRevision(target, previous.draft.revision + 1)).toEqual({ ok: true, cleared: false })
    expect(readBuilderLocalDraft(target)).toEqual(previous.draft)
  })

  it('protegge per entità due bozze preesistenti senza interferenze', () => {
    const first = identity('coach-1', 'exercise-1')
    const second = identity('coach-1', 'exercise-2')
    const firstDraft = writeBuilderLocalDraft(first, { restSeconds: 120 }, { restSeconds: 180 })
    const secondDraft = writeBuilderLocalDraft(second, { loadKg: 20 }, { loadKg: 24 })
    if (!firstDraft.ok || !firstDraft.draft || !secondDraft.ok || !secondDraft.draft) throw new Error('Bozze non create')

    const result = writeBuilderLocalDraft(first, { restSeconds: 120, instructions: '' }, { restSeconds: 120, instructions: 'Tentativo' })

    expect(result).toMatchObject({ ok: false, reason: 'unreconciled-draft' })
    expect(readBuilderLocalDraft(first)).toEqual(firstDraft.draft)
    expect(readBuilderLocalDraft(second)).toEqual(secondDraft.draft)
  })

  it('non consente a una conferma tardiva di cancellare una nuova generazione con la stessa revisione', () => {
    const target = identity('coach-1', 'exercise-1')
    const first = writeBuilderLocalDraft(target, { restSeconds: 120 }, { restSeconds: 150 })
    if (!first.ok || !first.draft) throw new Error('Prima generazione non creata')
    const firstGenerationId = (first.draft as typeof first.draft & { generationId?: string }).generationId

    clearBuilderLocalDraftRevision(target, first.draft.revision, undefined, firstGenerationId)
    const second = writeBuilderLocalDraft(target, { restSeconds: 120 }, { restSeconds: 180 })
    if (!second.ok || !second.draft) throw new Error('Seconda generazione non creata')
    const secondGenerationId = (second.draft as typeof second.draft & { generationId?: string }).generationId

    const lateConfirmation = clearBuilderLocalDraftRevision(target, first.draft.revision, undefined, firstGenerationId)

    expect(firstGenerationId).toEqual(expect.any(String))
    expect(secondGenerationId).toEqual(expect.any(String))
    expect(secondGenerationId).not.toBe(firstGenerationId)
    expect(lateConfirmation).toEqual({ ok: true, cleared: false })
    expect(readBuilderLocalDraft(target)).toEqual(second.draft)
  })

  it('trasferisce alla sessione corrente soltanto la generazione e revisione ancora presenti', () => {
    const target = identity('coach-1', 'exercise-1')
    const created = writeBuilderLocalDraft(target, { restSeconds: 120 }, { restSeconds: 180 })
    if (!created.ok || !created.draft?.generationId) throw new Error('Bozza non creata')

    expect(claimBuilderLocalDraftRevision(target, created.draft.revision, created.draft.generationId)).toMatchObject({
      ok: true,
      claimed: true,
      draft: { generationId: created.draft.generationId, revision: created.draft.revision },
    })
    expect(claimBuilderLocalDraftRevision(target, created.draft.revision + 1, created.draft.generationId)).toEqual({ ok: true, claimed: false })
  })

  it('assegna una generazione stabile alle bozze v1 legacy soltanto quando vengono acquisite', () => {
    const target = identity('coach-1', 'exercise-legacy')
    const legacyDraft = {
      version: 1,
      ...target,
      revision: 1,
      updatedAt: '2026-10-11T08:30:00.000Z',
      remoteBase: { fingerprint: 'fnv1a32:test', fields: { restSeconds: 120 } },
      changes: { restSeconds: 180 },
    }
    window.localStorage.setItem(builderLocalDraftKey(target), JSON.stringify(legacyDraft))

    const claimed = claimBuilderLocalDraftRevision(target, 1, null, undefined, Date.UTC(2026, 9, 11, 9, 0))

    expect(claimed).toMatchObject({ ok: true, claimed: true, draft: { revision: 1, generationId: expect.any(String) } })
    expect(readBuilderLocalDraft(target)).toMatchObject({ revision: 1, generationId: expect.any(String), changes: { restSeconds: 180 } })
  })
})
