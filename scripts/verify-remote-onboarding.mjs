import { execFileSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const projectRef = (await readFile(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8')).trim()

if (!/^[a-z0-9]{20}$/.test(projectRef)) {
  throw new Error('Project ref Supabase non valido o progetto non collegato.')
}

const cli = new URL('../node_modules/supabase/dist/supabase.js', import.meta.url)
const rawKeys = execFileSync(
  process.execPath,
  [fileURLToPath(cli), 'projects', 'api-keys', '--project-ref', projectRef, '--reveal', '--output-format', 'json', '--agent', 'no'],
  { encoding: 'utf8', windowsHide: true },
)
const keyResponse = JSON.parse(rawKeys)
const keys = Array.isArray(keyResponse)
  ? keyResponse
  : keyResponse.apiKeys ?? keyResponse.keys ?? keyResponse.data ?? []
const publishableKey = keys.find((key) => key.type === 'publishable')?.api_key
const serverKey = keys.find((key) => key.type === 'secret')?.api_key
  ?? keys.find((key) => key.name === 'service_role')?.api_key

if (!publishableKey || !serverKey || serverKey.includes('...')) {
  throw new Error('Chiavi di test non disponibili. Esegui prima `supabase login`.')
}

const url = `https://${projectRef}.supabase.co`
const runId = `${Date.now()}-${randomBytes(3).toString('hex')}`
const password = `Cc2-${randomBytes(18).toString('base64url')}`
const invitationToken = randomBytes(24).toString('base64url')
const ownerEmail = `climbing-coach-owner-${runId}@example.com`
const athleteEmail = `climbing-coach-athlete-${runId}@example.com`

const clientOptions = {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
}
const admin = createClient(url, serverKey, clientOptions)
let ownerId = null
let athleteId = null
let workspaceId = null
let stage = 'bootstrap'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function createConfirmedUser(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return data.user.id
}

async function signIn(email) {
  const client = createClient(url, publishableKey, clientOptions)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

async function cleanup() {
  const errors = []
  if (workspaceId) {
    const { error } = await admin.from('workspaces').delete().eq('id', workspaceId)
    if (error) errors.push(`workspace: ${error.message}`)
  }
  for (const [label, userId] of [['athlete', athleteId], ['owner', ownerId]]) {
    if (!userId) continue
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) errors.push(`${label}: ${error.message}`)
  }
  return errors
}

try {
  stage = 'create-owner'
  ownerId = await createConfirmedUser(ownerEmail)
  stage = 'create-athlete'
  athleteId = await createConfirmedUser(athleteEmail)
  stage = 'sign-in-owner'
  const owner = await signIn(ownerEmail)

  stage = 'coach-onboarding'
  const { data: firstOnboarding, error: firstError } = await owner.rpc('complete_onboarding', {
    p_display_name: 'Coach E2E',
    p_role: 'coach',
    p_workspace_name: `Workspace E2E ${runId}`,
    p_invitation_token: null,
  })
  if (firstError) throw firstError
  assert(firstOnboarding?.length === 1, 'Onboarding coach non ha restituito un workspace.')
  workspaceId = firstOnboarding[0].workspace_id
  assert(firstOnboarding[0].member_role === 'coach', 'Ruolo coach non preservato.')

  stage = 'idempotent-onboarding'
  const { data: repeated, error: repeatedError } = await owner.rpc('complete_onboarding', {
    p_display_name: 'Nome ignorato dopo completamento',
    p_role: 'athlete',
    p_workspace_name: 'Workspace duplicato',
    p_invitation_token: null,
  })
  if (repeatedError) throw repeatedError
  assert(repeated?.[0]?.workspace_id === workspaceId, 'Onboarding ripetuto non è idempotente.')

  stage = 'create-invitation'
  const tokenHash = `\\x${createHash('sha256').update(invitationToken).digest('hex')}`
  const { error: invitationError } = await admin.from('workspace_invitations').insert({
    workspace_id: workspaceId,
    email: athleteEmail,
    role: 'athlete',
    token_hash: tokenHash,
    created_by: ownerId,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  })
  if (invitationError) throw invitationError

  stage = 'sign-in-athlete'
  const athlete = await signIn(athleteEmail)
  stage = 'accept-invitation'
  const { data: joined, error: joinError } = await athlete.rpc('complete_onboarding', {
    p_display_name: 'Atleta E2E',
    p_role: 'coach',
    p_workspace_name: null,
    p_invitation_token: invitationToken,
  })
  if (joinError) throw joinError
  assert(joined?.[0]?.workspace_id === workspaceId, 'Invito associato al workspace errato.')
  assert(joined[0].member_role === 'athlete', 'Il ruolo client ha prevalso sul ruolo dell’invito.')

  stage = 'membership-rls'
  const { data: athleteMemberships, error: membershipError } = await athlete
    .from('workspace_members')
    .select('workspace_id,user_id,role,status')
  if (membershipError) throw membershipError
  assert(athleteMemberships.length === 1, 'RLS atleta non restituisce esattamente la propria membership.')
  assert(athleteMemberships[0].user_id === athleteId, 'RLS ha esposto una membership altrui.')

  stage = 'anonymous-access'
  const anonymous = createClient(url, publishableKey, clientOptions)
  const { error: anonymousReadError } = await anonymous.from('profiles').select('user_id').limit(1)
  assert(Boolean(anonymousReadError), 'Anon ha potuto interrogare profiles.')

  stage = 'invitation-access'
  const { error: invitationReadError } = await athlete.from('workspace_invitations').select('id').limit(1)
  assert(Boolean(invitationReadError), 'Un utente autenticato ha potuto leggere direttamente gli inviti.')

  stage = 'cleanup'
  const cleanupErrors = await cleanup()
  assert(cleanupErrors.length === 0, `Cleanup incompleto: ${cleanupErrors.join('; ')}`)
  workspaceId = null
  ownerId = null
  athleteId = null

  console.log(JSON.stringify({
    projectRef,
    passed: true,
    checks: {
      passwordLogin: true,
      coachOnboarding: true,
      idempotentOnboarding: true,
      invitationAcceptance: true,
      invitationRoleAuthoritative: true,
      membershipRls: true,
      anonymousProfilesBlocked: true,
      directInvitationsBlocked: true,
      cleanup: true,
    },
  }, null, 2))
} catch (error) {
  const cleanupErrors = await cleanup()
  const safeError = error && typeof error === 'object'
    ? {
        name: error.name ?? null,
        message: error.message ?? null,
        status: error.status ?? null,
        code: error.code ?? null,
      }
    : String(error)
  console.error(JSON.stringify({
    projectRef,
    passed: false,
    stage,
    error: safeError,
    cleanupErrors,
  }, null, 2))
  process.exitCode = 1
}
