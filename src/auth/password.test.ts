import { describe, expect, it } from 'vitest'
import { friendlyAuthError, validatePassword } from './password'

describe('password auth', () => {
  it('richiede almeno otto caratteri con lettere e numeri', () => {
    expect(validatePassword('corta1', 'corta1')).toContain('8 caratteri')
    expect(validatePassword('solotesto', 'solotesto')).toContain('lettera e un numero')
  })
  it('verifica la conferma', () => expect(validatePassword('sicura123', 'diversa123')).toContain('non coincidono'))
  it('accetta una password valida', () => expect(validatePassword('Roccia2026', 'Roccia2026')).toBeNull())
  it('non rivela se un account esiste', () => expect(friendlyAuthError('Invalid login credentials')).toContain('Email o password'))
})
