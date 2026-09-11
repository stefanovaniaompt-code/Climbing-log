import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const [projectRef, rawOldEmail, rawNewEmail] = process.argv.slice(2)
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const oldEmail = rawOldEmail?.trim().toLowerCase()
const newEmail = rawNewEmail?.trim().toLowerCase()

if (!/^[a-z0-9]{20}$/.test(projectRef ?? '') || !emailPattern.test(oldEmail ?? '') || !emailPattern.test(newEmail ?? '') || oldEmail === newEmail) {
  throw new Error('Uso: node scripts/correct-auth-email.mjs <project-ref> <email-attuale> <email-nuova>')
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cli = resolve(projectRoot, 'node_modules', 'supabase', 'dist', 'supabase.js')
const rawKeys = execFileSync(process.execPath, [cli, 'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output-format', 'json', '--agent', 'no'], {
  cwd: projectRoot,
  encoding: 'utf8',
  windowsHide: true,
})
const keyResponse = JSON.parse(rawKeys)
const keys = Array.isArray(keyResponse) ? keyResponse : keyResponse.apiKeys ?? keyResponse.keys ?? keyResponse.data ?? []
const serverKey = keys.find(key => key.type === 'secret')?.api_key ?? keys.find(key => key.name === 'service_role')?.api_key
if (!serverKey || serverKey.includes('...')) throw new Error('Chiave amministrativa non disponibile dal CLI autenticato.')

const admin = createClient(`https://${projectRef}.supabase.co`, serverKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
})

async function protectedCounts() {
  const names = ['profiles', 'session_logs', 'exercise_logs', 'test_results']
  const results = await Promise.all(names.map(async table => {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
    if (error) throw error
    return [table, count ?? 0]
  }))
  return Object.fromEntries(results)
}

const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (usersError) throw usersError
const current = usersData.users.filter(user => user.email?.toLowerCase() === oldEmail)
const collisions = usersData.users.filter(user => user.email?.toLowerCase() === newEmail)
if (current.length !== 1) throw new Error(`Account sorgente non univoco: trovati ${current.length}.`)
if (collisions.length !== 0) throw new Error('L’indirizzo di destinazione è già associato a un account.')

const user = current[0]
const beforeCounts = await protectedCounts()
const { data: invitations, error: invitationsError } = await admin
  .from('athlete_invitations')
  .select('id,coach_id,email,email_normalized,athlete_id,status,invited_at,accepted_at')
  .eq('email_normalized', oldEmail)
if (invitationsError) throw invitationsError

const backupRoot = resolve(projectRoot, 'migration', 'private', `email-correction-${new Date().toISOString().replace(/[-:.]/g, '')}`)
await mkdir(backupRoot, { recursive: true })
await writeFile(resolve(backupRoot, 'before.json'), `${JSON.stringify({
  projectRef,
  capturedAt: new Date().toISOString(),
  authUser: { id: user.id, email: user.email, emailConfirmedAt: user.email_confirmed_at, updatedAt: user.updated_at },
  invitations,
  protectedCounts: beforeCounts,
}, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })

let authUpdated = false
try {
  const { data: updatedData, error: updateError } = await admin.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: true })
  if (updateError) throw updateError
  authUpdated = true
  if (updatedData.user.email?.toLowerCase() !== newEmail) throw new Error('Auth non ha confermato la nuova email.')

  if (invitations.length) {
    const { error: invitationUpdateError } = await admin.from('athlete_invitations').update({ email: newEmail, email_normalized: newEmail }).eq('email_normalized', oldEmail)
    if (invitationUpdateError) throw invitationUpdateError
  }

  const [{ data: verifiedData, error: verifyError }, afterCounts] = await Promise.all([
    admin.auth.admin.getUserById(user.id),
    protectedCounts(),
  ])
  if (verifyError) throw verifyError
  if (verifiedData.user.email?.toLowerCase() !== newEmail) throw new Error('Verifica finale dell’email fallita.')
  if (JSON.stringify(beforeCounts) !== JSON.stringify(afterCounts)) throw new Error('I conteggi protetti sono cambiati durante la correzione.')

  console.log(JSON.stringify({
    updated: true,
    sameUserId: verifiedData.user.id === user.id,
    invitationRowsUpdated: invitations.length,
    protectedCountsUnchanged: true,
    protectedCounts: afterCounts,
    privateBackupDirectory: backupRoot,
  }, null, 2))
} catch (error) {
  if (authUpdated) {
    const { error: rollbackError } = await admin.auth.admin.updateUserById(user.id, { email: oldEmail, email_confirm: true })
    if (rollbackError) throw new Error(`Correzione fallita e rollback Auth non riuscito: ${rollbackError.message}`, { cause: error })
  }
  throw error
}
