import type {
  AppProfile,
} from '../onboarding/types'

import {
  createProgressorDevice,
  type ProgressorTransportKind,
} from '../tindeq/deviceFactory'

import {
  createLiveTestRunner,
  type CreateLiveRunnerOptions,
  type LiveTestRunnerState,
} from './liveTestRunner'

import {
  LiveTestRuntime,
} from './liveTestRuntime'

type IdFactory =
  () => string

export type ProgressorLiveRuntimeOptions =
  CreateLiveRunnerOptions & {
    idFactory?: IdFactory
    runner?: LiveTestRunnerState
  }

export type ProgressorLiveRuntimeHandle = {
  runtime: LiveTestRuntime
  transportKind: ProgressorTransportKind
  supported: boolean
  dispose: () => void
}

export function createProgressorLiveTestRuntime(
  profile: AppProfile,
  athleteId: string,
  options:
    ProgressorLiveRuntimeOptions = {},
): ProgressorLiveRuntimeHandle {
  const {
    idFactory,
    runner: restoredRunner,
    ...runnerOptions
  } = options

  const selection =
    createProgressorDevice()

  const runner = restoredRunner ??
    createLiveTestRunner(
      profile,
      athleteId,
      runnerOptions,
    )

  if (
    runner.session.athleteId !== athleteId ||
    runner.session.coachId !== profile.userId
  ) {
    throw new Error(
      'La sessione Tindeq salvata appartiene a un altro profilo.',
    )
  }

  const runtime =
    new LiveTestRuntime(
      profile,
      runner,
      selection.device,
      idFactory,
    )

  /*
   * Live force acquisition is intentionally not
   * permitted to silently continue in background.
   *
   * If the WebView becomes hidden during an active
   * test, preserve the attempt but mark it REVIEW.
   */
  const onVisibilityChange =
    () => {
      if (
        typeof document ===
          'undefined' ||
        document.visibilityState !==
          'hidden' ||
        !runtime.isAcquiring
      ) {
        return
      }

      void runtime
        .interruptAcquisition(
          'app-background',
        )
        .catch(
          () => undefined,
        )
    }

  if (
    typeof document !==
    'undefined'
  ) {
    document.addEventListener(
      'visibilitychange',
      onVisibilityChange,
    )
  }

  return {
    runtime,

    transportKind:
      selection.transportKind,

    supported:
      selection.supported,

    dispose: () => {
      if (
        typeof document !==
        'undefined'
      ) {
        document.removeEventListener(
          'visibilitychange',
          onVisibilityChange,
        )
      }

      runtime.dispose()
    },
  }
}
