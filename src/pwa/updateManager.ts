import {
  canApplyAppUpdate,
  isNewBuild,
} from './updatePolicy'

import {
  getUpdateBlockerCount,
  subscribeUpdateSafety,
} from './updateSafety'

type VersionPayload = {
  buildId?: unknown
}

const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ ===
    'string'
    ? __APP_BUILD_ID__
    : 'development'

const UPDATE_INTERVAL_MS =
  15 * 60 * 1000

const ATTEMPT_KEY =
  'cc-v2:pwa-update-attempt'

let pendingBuildId:
  string | null = null

let freshLoad =
  true

let reloadStarted =
  false

let registration:
  ServiceWorkerRegistration | null =
    null

function emitUpdateState(
  state:
    'current' |
    'waiting' |
    'applying',
) {
  window.dispatchEvent(
    new CustomEvent(
      'cc:pwa-update-state',
      {
        detail: {
          state,
          currentBuildId:
            CURRENT_BUILD_ID,
          pendingBuildId,
          blockerCount:
            getUpdateBlockerCount(),
        },
      },
    ),
  )
}

function alreadyAttempted(
  buildId: string,
) {
  try {
    return (
      window.sessionStorage
        .getItem(
          ATTEMPT_KEY,
        ) === buildId
    )
  } catch {
    return false
  }
}

function rememberAttempt(
  buildId: string,
) {
  try {
    window.sessionStorage
      .setItem(
        ATTEMPT_KEY,
        buildId,
      )
  } catch {
    // Storage can be unavailable.
  }
}

function tryApplyPendingUpdate() {
  if (
    !pendingBuildId ||
    reloadStarted
  ) {
    return
  }

  const allowed =
    canApplyAppUpdate({
      visible:
        document.visibilityState ===
        'visible',

      blockerCount:
        getUpdateBlockerCount(),

      freshLoad,
    })

  if (!allowed) {
    emitUpdateState(
      'waiting',
    )
    return
  }

  if (
    alreadyAttempted(
      pendingBuildId,
    )
  ) {
    return
  }

  rememberAttempt(
    pendingBuildId,
  )

  reloadStarted =
    true

  emitUpdateState(
    'applying',
  )

  window.location.reload()
}

async function fetchRemoteBuildId() {
  const url =
    `${import.meta.env.BASE_URL}version.json?ts=${Date.now()}`

  const response =
    await fetch(
      url,
      {
        cache:
          'no-store',

        headers: {
          Accept:
            'application/json',
        },
      },
    )

  if (!response.ok) {
    return null
  }

  const payload =
    await response.json() as
      VersionPayload

  return (
    typeof payload.buildId ===
      'string'
      ? payload.buildId
          .trim()
      : null
  )
}

async function checkForAppUpdate() {
  if (
    document.visibilityState !==
    'visible'
  ) {
    return
  }

  try {
    await registration
      ?.update()
  } catch {
    // App version checking still works even if
    // service worker update probing fails.
  }

  let remoteBuildId:
    string | null = null

  try {
    remoteBuildId =
      await fetchRemoteBuildId()
  } catch {
    /*
     * Offline or transient network errors must never
     * disturb the currently running application.
     */
    return
  }

  if (!remoteBuildId) {
    return
  }

  if (
    isNewBuild(
      CURRENT_BUILD_ID,
      remoteBuildId,
    )
  ) {
    pendingBuildId =
      remoteBuildId

    tryApplyPendingUpdate()
  } else {
    pendingBuildId =
      null

    emitUpdateState(
      'current',
    )
  }

  /*
   * From this point onwards this is no longer the
   * initial startup window. Future updates obey all
   * interactive-screen blockers.
   */
  freshLoad =
    false
}

export function registerPwaUpdateManager() {
  if (
    !import.meta.env.PROD ||
    !(
      'serviceWorker'
      in navigator
    )
  ) {
    return
  }

  const serviceWorkerUrl =
    `${import.meta.env.BASE_URL}sw.js`

  void navigator
    .serviceWorker
    .register(
      serviceWorkerUrl,
      {
        updateViaCache:
          'none',
      },
    )
    .then(
      value => {
        registration =
          value

        void checkForAppUpdate()
      },
    )
    .catch(
      () => {
        /*
         * The web app must remain usable if service
         * worker registration is unavailable.
         */
        void checkForAppUpdate()
      },
    )

  const checkWhenVisible =
    () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void checkForAppUpdate()
      }
    }

  const checkWhenFocused =
    () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void checkForAppUpdate()
      }
    }

  const checkWhenOnline =
    () => {
      void checkForAppUpdate()
    }

  document.addEventListener(
    'visibilitychange',
    checkWhenVisible,
  )

  window.addEventListener(
    'focus',
    checkWhenFocused,
  )

  window.addEventListener(
    'online',
    checkWhenOnline,
  )

  subscribeUpdateSafety(
    tryApplyPendingUpdate,
  )

  window.setInterval(
    () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        void checkForAppUpdate()
      }
    },
    UPDATE_INTERVAL_MS,
  )
}
