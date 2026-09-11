import { useEffect, useState } from 'react'

export function useScreenWakeLock(enabled: boolean) {
  const [status, setStatus] = useState<'active' | 'unsupported' | 'blocked' | 'inactive'>('inactive')

  useEffect(() => {
    type WakeLockSentinelLike = { released: boolean; release: () => Promise<void>; addEventListener: (type: 'release', listener: () => void) => void }
    type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }
    let sentinel: WakeLockSentinelLike | null = null
    let disposed = false
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock

    if (!enabled) { setStatus('inactive'); return }
    if (!wakeLock) { setStatus('unsupported'); return }

    const acquire = async () => {
      if (disposed || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      try {
        sentinel = await wakeLock.request('screen')
        if (disposed) { await sentinel.release(); return }
        setStatus('active')
        sentinel.addEventListener('release', () => { if (!disposed) setStatus('inactive') })
      } catch { if (!disposed) setStatus('blocked') }
    }
    const handleVisibility = () => { if (document.visibilityState === 'visible') void acquire() }
    void acquire()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', handleVisibility)
      if (sentinel && !sentinel.released) void sentinel.release()
    }
  }, [enabled])

  return status
}
