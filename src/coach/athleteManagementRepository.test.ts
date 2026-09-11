import { describe, expect, it } from 'vitest'
import { buildInvitationPayload, resolveInvitationEmail } from './athleteManagementRepository'

describe('resolveInvitationEmail', () => {
  it('usa la mail salvata quando il campo visibile non è stato modificato', () => {
    expect(resolveInvitationEmail('', 'Atleta@Example.com')).toBe('atleta@example.com')
  })

  it('preferisce e normalizza la mail digitata dal coach', () => {
    expect(resolveInvitationEmail(' Nuova@Example.com ', 'vecchia@example.com')).toBe('nuova@example.com')
  })

  it('lascia al database la colonna email_normalized generata', () => {
    const payload = buildInvitationPayload('athlete-id', 'atleta@example.com')
    expect(payload).toEqual({ athlete_id: 'athlete-id', email: 'atleta@example.com', status: 'pending' })
    expect(payload).not.toHaveProperty('email_normalized')
  })
})
