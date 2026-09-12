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
} from './liveTestRunner'

import {
  LiveTestRuntime,
} from './liveTestRuntime'

type IdFactory =
  () => string

export type ProgressorLiveRuntimeOptions =
  CreateLiveRunnerOptions & {
    idFactory?: IdFactory
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
    ...runnerOptions
  } = options

  const selection =
    createProgressorDevice()

  const runner =
    createLiveTestRunner(
      profile,
      athleteId,
      runnerOptions,
    )

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
