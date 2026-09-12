type SafetyListener =
  () => void

const blockers =
  new Set<string>()

const listeners =
  new Set<SafetyListener>()

function notify() {
  for (
    const listener
    of listeners
  ) {
    listener()
  }
}

export function setUpdateBlocker(
  id: string,
  blocked: boolean,
) {
  const before =
    blockers.size

  if (blocked) {
    blockers.add(id)
  } else {
    blockers.delete(id)
  }

  if (
    blockers.size !== before
  ) {
    notify()
  }
}

export function getUpdateBlockerCount() {
  return blockers.size
}

export function subscribeUpdateSafety(
  listener: SafetyListener,
) {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
