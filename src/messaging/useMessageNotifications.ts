import { useEffect, useState } from 'react'
import type { AppProfile } from '../onboarding/types'
import { loadUnreadCount, MESSAGES_READ_EVENT, subscribeToMessages } from './messageRepository'

export function useMessageNotifications(profile: AppProfile) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [toast, setToast] = useState('')
  useEffect(() => {
    const refresh = () => { void loadUnreadCount(profile).then(setUnreadCount).catch(() => setUnreadCount(0)) }
    refresh()
    const unsubscribe = subscribeToMessages(profile, message => {
      if (message.senderUserId === profile.userId) return
      refresh()
      if (!document.querySelector(`[data-message-thread="${message.athleteId}"]`)) setToast('Nuovo messaggio ricevuto')
    })
    window.addEventListener(MESSAGES_READ_EVENT, refresh)
    return () => { unsubscribe(); window.removeEventListener(MESSAGES_READ_EVENT, refresh) }
  }, [profile])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 4000); return () => window.clearTimeout(timer) }, [toast])
  return { unreadCount, toast }
}
