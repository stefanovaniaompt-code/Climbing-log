import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import type { AppProfile } from '../onboarding/types'
import { loadConversation, markConversationRead, sendMessage, subscribeToMessages, type Message } from './messageRepository'

export function MessageThread({ profile, coachId, athleteId, counterpartName }: { profile: AppProfile; coachId: string; athleteId: string; counterpartName: string }) {
  const [messages, setMessages] = useState<Message[]>([]); const [body, setBody] = useState(''); const [error, setError] = useState(''); const [sending, setSending] = useState(false); const endRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    let active = true
    loadConversation(profile, coachId, athleteId).then(rows => { if (active) setMessages(rows); return markConversationRead(profile, coachId, athleteId) }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Conversazione non disponibile.') })
    const unsubscribe = subscribeToMessages(profile, message => { if (!active) return; setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]); if (message.senderUserId !== profile.userId) void markConversationRead(profile, coachId, athleteId) }, { coachId, athleteId })
    return () => { active = false; unsubscribe() }
  }, [profile, coachId, athleteId])
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length])
  const submit = async (event: FormEvent) => { event.preventDefault(); setSending(true); setError(''); try { const message = await sendMessage(profile, coachId, athleteId, body); setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]); setBody('') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Messaggio non inviato.') } finally { setSending(false) } }
  return <div className="message-thread" data-message-thread={athleteId}><div className="message-thread__head"><b>Messaggi</b><span>{counterpartName}</span></div><div className="message-list" aria-live="polite">{messages.length === 0 && <div className="empty-state"><b>Nessun messaggio</b><span>La conversazione è pronta.</span></div>}{messages.map(message => <div className={`message-bubble ${message.senderUserId === profile.userId ? 'is-own' : 'is-other'}`} key={message.id}><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleString('it-IT')}{message.senderUserId === profile.userId && !message.readAt ? ' · Non letto' : ''}</small></div>)}<div ref={endRef} /></div><form className="message-compose" onSubmit={submit}><textarea value={body} maxLength={5000} onChange={event => setBody(event.target.value)} placeholder="Scrivi un messaggio…" required /><button className="button button--signal" disabled={sending || !body.trim()}><Send size={16} /> {sending ? 'Invio…' : 'Invia'}</button></form>{error && <p className="form-error" role="alert">{error}</p>}</div>
}
