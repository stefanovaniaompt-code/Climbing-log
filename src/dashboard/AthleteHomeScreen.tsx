import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ClipboardCheck,
  Grip,
  Play,
  TriangleAlert,
} from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { Bars, Metric, Panel, ScreenHeader, Tag } from '../shared/ui'
import { selectCurrentWeek, summarizeWeek } from './athleteHome'
import { loadAthleteHome } from './athleteHomeRepository'
import {
  blockForWeek,
  buildAthleteWeekBlocks,
  statusLabel,
} from './athleteHomeNavigation'

type AthleteHomeScreenProps = {
  openSession: (sessionId: string) => void
  profile: AppProfile
}

export function AthleteHomeScreen({
  openSession,
  profile,
}: AthleteHomeScreenProps) {
  const programStorageKey = `cc-v2:program:${profile.userId}`
  const weekStorageKey = `cc-v2:week:${profile.userId}`

  const [selectedProgramId, setSelectedProgramId] = useState(() => {
    try {
      return window.localStorage.getItem(programStorageKey) ?? ''
    } catch {
      return ''
    }
  })

  const [selectedWeekId, setSelectedWeekId] = useState(() => {
    try {
      return window.localStorage.getItem(weekStorageKey) ?? ''
    } catch {
      return ''
    }
  })

  const [home, setHome] =
    useState<Awaited<ReturnType<typeof loadAthleteHome>> | undefined>()
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true

    setHome(undefined)
    setError('')

    loadAthleteHome(
      profile,
      selectedWeekId || null,
      selectedProgramId || null,
    )
      .then(value => {
        if (!active) return

        setHome(value)

        if (value && value.program.id !== selectedProgramId) {
          setSelectedProgramId(value.program.id)
        }

        if (
          value &&
          selectedWeekId &&
          value.week.id !== selectedWeekId
        ) {
          setSelectedWeekId(value.week.id)
        }
      })
      .catch(reason => {
        if (!active) return
        setError(
          reason instanceof Error
            ? reason.message
            : 'Programma non disponibile.',
        )
      })

    return () => {
      active = false
    }
  }, [
    profile,
    reloadKey,
    selectedProgramId,
    selectedWeekId,
  ])

  useEffect(() => {
    try {
      if (selectedProgramId) {
        window.localStorage.setItem(
          programStorageKey,
          selectedProgramId,
        )
      } else {
        window.localStorage.removeItem(programStorageKey)
      }
    } catch {
      // Local storage can be unavailable.
    }
  }, [programStorageKey, selectedProgramId])

  useEffect(() => {
    try {
      if (selectedWeekId) {
        window.localStorage.setItem(
          weekStorageKey,
          selectedWeekId,
        )
      } else {
        window.localStorage.removeItem(weekStorageKey)
      }
    } catch {
      // Local storage can be unavailable.
    }
  }, [selectedWeekId, weekStorageKey])

  const today = new Intl.DateTimeFormat('it-IT', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
  })
    .format(new Date())
    .toUpperCase()

  if (error) {
    return (
      <div className="screen">
        <ScreenHeader
          eyebrow={`ATLETA / ${today}`}
          title={`Ciao, ${profile.displayName.split(' ')[0]}.`}
          text="Non riesco a leggere il programma in questo momento; nessun dato e stato modificato."
        />

        <Panel
          className="home-state home-state--error"
          title="Programma non disponibile"
          index="!"
        >
          <TriangleAlert size={24} />
          <p>{error}</p>
          <button
            className="button button--secondary"
            onClick={() => setReloadKey(value => value + 1)}
          >
            Riprova
          </button>
        </Panel>
      </div>
    )
  }

  if (home === undefined) {
    return (
      <div className="screen">
        <ScreenHeader
          eyebrow={`ATLETA / ${today}`}
          title={`Ciao, ${profile.displayName.split(' ')[0]}.`}
          text="Sto preparando il tuo programma di allenamento."
        />

        <Panel
          className="home-state"
          title="Caricamento programma"
          index="..."
        >
          <div className="skeleton-stack" aria-label="Caricamento">
            <span />
            <span />
            <span />
          </div>
        </Panel>
      </div>
    )
  }

  if (!home) {
    return (
      <div className="screen">
        <ScreenHeader
          eyebrow={`ATLETA / ${today}`}
          title={`Ciao, ${profile.displayName.split(' ')[0]}.`}
          text="Il tuo storico resta disponibile; al momento non risulta un programma attivo."
        />

        <Panel
          className="home-state"
          title="Nessun programma attivo"
          index="00"
        >
          <ClipboardCheck size={25} />
          <p>
            Quando il coach pubblichera un programma attivo,
            comparira qui senza perdere allenamenti o test precedenti.
          </p>
        </Panel>
      </div>
    )
  }

  const summary = summarizeWeek(home.sessions)
  const nextSession = summary.nextSession
  const currentWeek = selectCurrentWeek(home.weeks)
  const todayIsoDay = ((new Date().getDay() + 6) % 7) + 1
  const progress =
    summary.total > 0
      ? Math.round((summary.completed / summary.total) * 100)
      : 0

  const stageValues = home.sessions.map(session =>
    session.status === 'completed'
      ? 100
      : session.status === 'in_progress'
        ? 72
        : session.status === 'skipped'
          ? 10
          : 34,
  )

  const nextIndex = nextSession
    ? home.sessions.findIndex(session => session.id === nextSession.id)
    : -1

  const weekIndex = home.weeks.findIndex(
    week => week.id === home.week.id,
  )

  const previousWeek =
    weekIndex > 0
      ? home.weeks[weekIndex - 1]
      : null

  const followingWeek =
    weekIndex >= 0 && weekIndex < home.weeks.length - 1
      ? home.weeks[weekIndex + 1]
      : null

  const blocks = buildAthleteWeekBlocks(home.weeks)

  const currentBlock = blockForWeek(blocks, home.week.id)
  const blockWeeks = currentBlock?.weeks ?? [home.week]
  const isCurrentWeek =
    currentWeek?.id === home.week.id

  const selectBlock = (blockKey: string) => {
    const block = blocks.find(item => item.key === blockKey)
    if (!block) return

    const currentInsideBlock =
      currentWeek &&
      block.weeks.some(week => week.id === currentWeek.id)
        ? currentWeek
        : null

    setSelectedWeekId(
      currentInsideBlock?.id ??
        block.weeks[0]?.id ??
        '',
    )
  }

  return (
    <div className="screen">
      <ScreenHeader
        eyebrow={`ATLETA / ${today}`}
        title={`Ciao, ${profile.displayName.split(' ')[0]}.`}
        text="Programma, blocco, settimana e sessione sono sempre navigabili dallo stesso punto."
        action={
          <Tag tone={home.source === 'legacy-v1' ? 'success' : 'neutral'}>
            {home.source === 'legacy-v1' ? 'DATI LIVE' : 'DEMO'}
          </Tag>
        }
      />

      <div className="readiness-strip">
        <div>
          <span>SETTIMANA</span>
          <strong>{String(home.week.weekNumber).padStart(2, '0')}</strong>
          <em>/{home.program.name}</em>
        </div>

        <p>
          {home.program.goal ||
            home.week.blockName ||
            home.week.phase ||
            'Programma attivo'}
          {' - '}
          {summary.completed} sessioni completate su {summary.total}.
        </p>

        <Tag tone={progress === 100 ? 'success' : 'purple'}>
          {progress}% completato
        </Tag>
      </div>

      <div className="grid grid--2-1">
        <Panel
          className="session-hero"
          title={
            nextSession
              ? 'Prossima sessione'
              : home.sessions.length === 0
                ? 'Settimana senza sessioni'
                : 'Nessuna sessione da eseguire'
          }
          index="01"
          action={
            nextSession?.durationMinutes
              ? <Tag tone="signal">{nextSession.durationMinutes} min</Tag>
              : undefined
          }
        >
          <div className="session-hero__title">
            <Grip size={30} />

            <div>
              <small>
                {home.week.phase ||
                  home.week.blockName ||
                  'ALLENAMENTO'}
                {' - '}
                W{String(home.week.weekNumber).padStart(2, '0')}
                {nextSession
                  ? `/D${String(nextSession.scheduledDay).padStart(2, '0')}`
                  : ''}
              </small>

              <h2>
                {nextSession?.title ??
                  (home.sessions.length === 0
                    ? 'Il coach non ha ancora inserito sessioni'
                    : 'Tutte le sessioni disponibili sono state gestite')}
              </h2>
            </div>
          </div>

          <div className="session-facts">
            <span>
              <b>{nextSession?.exerciseCount ?? summary.exerciseCount}</b>
              {' '}esercizi
            </span>
            <span>
              <b>{nextSession?.order ?? summary.total}</b>
              {' '}posizione
            </span>
            <span>
              <b>{nextSession?.sessionRpe ?? '-'}</b>
              {' '}RPE
            </span>
          </div>

          {nextSession && (
            <button
              className="button button--signal button--wide"
              onClick={() => openSession(nextSession.id)}
            >
              <Play size={17} fill="currentColor" />
              <span>
                {nextSession.status === 'in_progress'
                  ? 'Riprendi sessione'
                  : 'Apri sessione'}
              </span>
              <ArrowRight size={17} />
            </button>
          )}

          {!nextSession && followingWeek && (
            <button
              className="button button--secondary button--wide"
              onClick={() => setSelectedWeekId(followingWeek.id)}
            >
              <span>Vai alla settimana successiva</span>
              <ArrowRight size={17} />
            </button>
          )}
        </Panel>

        <Panel
          title="Percorso"
          index="02"
          action={
            <div className="header-actions">
              <button
                className="icon-button"
                disabled={!previousWeek}
                onClick={() =>
                  previousWeek &&
                  setSelectedWeekId(previousWeek.id)
                }
                aria-label="Settimana precedente"
                title="Settimana precedente"
              >
                <ArrowLeft size={17} />
              </button>

              <Tag tone={isCurrentWeek ? 'signal' : 'purple'}>
                W{String(home.week.weekNumber).padStart(2, '0')} / {home.weeks.length}
              </Tag>

              <button
                className="icon-button"
                disabled={!followingWeek}
                onClick={() =>
                  followingWeek &&
                  setSelectedWeekId(followingWeek.id)
                }
                aria-label="Settimana successiva"
                title="Settimana successiva"
              >
                <ArrowRight size={17} />
              </button>
            </div>
          }
        >
          <label className="athlete-block-select">
            <span>Programma</span>
            <select
              value={home.program.id}
              disabled={home.programs.length <= 1}
              onChange={event => {
                setSelectedProgramId(event.target.value)
                setSelectedWeekId('')
              }}
            >
              {home.programs.map(program => (
                <option key={program.id} value={program.id}>
                  {program.name}
                </option>
              ))}
            </select>
          </label>

          <label className="athlete-block-select">
            <span>Blocco</span>
            <select
              value={currentBlock?.key ?? ''}
              disabled={blocks.length <= 1}
              onChange={event => selectBlock(event.target.value)}
            >
              {blocks.map(block => (
                <option key={block.key} value={block.key}>
                  {block.label}
                </option>
              ))}
            </select>
          </label>

          <label className="athlete-block-select">
            <span>Settimana</span>
            <select
              value={home.week.id}
              disabled={blockWeeks.length <= 1}
              onChange={event =>
                setSelectedWeekId(event.target.value)
              }
            >
              {blockWeeks.map(week => (
                <option key={week.id} value={week.id}>
                  Settimana {week.weekNumber}
                  {week.status === 'current' ? ' - corrente' : ''}
                </option>
              ))}
            </select>
          </label>

          {!isCurrentWeek && currentWeek && (
            <button
              className="text-button"
              onClick={() => setSelectedWeekId(currentWeek.id)}
            >
              Torna alla settimana corrente
            </button>
          )}

          <div className="week-days">
            {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map(
              (day, index) => {
                const scheduled = home.sessions.filter(
                  session => session.scheduledDay === index + 1,
                )
                const isDone =
                  scheduled.length > 0 &&
                  scheduled.every(
                    session => session.status === 'completed',
                  )

                return (
                  <div
                    key={`${day}${index}`}
                    className={
                      index + 1 === todayIsoDay
                        ? 'today'
                        : isDone
                          ? 'done'
                          : ''
                    }
                  >
                    <span>{day}</span>
                    <b>{index + 1}</b>
                  </div>
                )
              },
            )}
          </div>

          <div className="progress-line">
            <span style={{ width: `${progress}%` }} />
          </div>

          <p className="muted-copy">
            {summary.completed} di {summary.total} sessioni completate
            {' - '}
            {summary.exerciseCount} esercizi prescritti.
          </p>

          <p className="muted-copy">
            {home.week.startDate
              ? `Inizio settimana: ${new Intl.DateTimeFormat('it-IT', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                }).format(new Date(`${home.week.startDate}T12:00:00`))}`
              : `Settimana ${home.week.weekNumber}`}
          </p>
        </Panel>
      </div>

      <div className="metric-grid metric-grid--4">
        <Metric
          label="Sessioni"
          value={String(summary.completed).padStart(2, '0')}
          unit={`/${String(summary.total).padStart(2, '0')}`}
        />
        <Metric
          label="Esercizi"
          value={String(summary.exerciseCount).padStart(2, '0')}
        />
        <Metric
          label="Durata prevista"
          value={String(summary.plannedMinutes)}
          unit=" min"
        />
        <Metric
          label="RPE medio"
          value={summary.averageRpe?.toFixed(1) ?? '-'}
          unit="/10"
        />
      </div>

      <Panel
        title="Sessioni della settimana"
        index="03"
        action={<Tag tone="purple">{home.week.status}</Tag>}
      >
        <div className="trend-panel">
          <div>
            <b>
              {home.week.blockName ||
                home.week.phase ||
                home.program.name}
            </b>
            <p>
              Apri una sessione specifica oppure riprendi quella gia in corso.
            </p>
          </div>

          <Bars
            values={stageValues.length > 0 ? stageValues : [8]}
            accentAt={nextIndex}
          />
        </div>

        {home.sessions.length === 0 ? (
          <div className="empty-state empty-state--compact">
            <ClipboardCheck size={20} />
            <b>Nessuna sessione in questa settimana</b>
            <span>
              Puoi scegliere un'altra settimana o attendere un aggiornamento del coach.
            </span>
          </div>
        ) : (
          <div className="component-row">
            {home.sessions.map(session => (
              <button
                key={session.id}
                className={`button ${
                  session.status === 'in_progress'
                    ? 'button--signal'
                    : 'button--secondary'
                }`}
                disabled={session.status === 'skipped'}
                onClick={() => openSession(session.id)}
                title={
                  session.status === 'skipped'
                    ? 'Sessione marcata come saltata'
                    : undefined
                }
              >
                <span>
                  D{String(session.scheduledDay).padStart(2, '0')}
                  {' - '}
                  {session.title}
                  {' - '}
                  {statusLabel(session.status)}
                </span>
                {session.status !== 'skipped' && (
                  <ArrowRight size={16} />
                )}
              </button>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}
