export function validatePassword(
  password: string,
  confirmation: string,
) {
  if (password.length < 8) {
    return 'La password deve contenere almeno 8 caratteri.'
  }

  if (
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return 'Usa almeno una lettera e un numero.'
  }

  if (password !== confirmation) {
    return 'Le due password non coincidono.'
  }

  return null
}

export function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('invalid login credentials')
  ) {
    return 'Email o password non corrette. Se non hai ancora una password, usa il link di primo accesso.'
  }

  if (normalized.includes('email not confirmed')) {
    return 'L indirizzo email non è ancora confermato.'
  }

  if (
    normalized.includes('weak_password') ||
    normalized.includes('password should be')
  ) {
    return 'La password non rispetta i requisiti di sicurezza.'
  }

  if (
    normalized.includes('signups not allowed') ||
    normalized.includes('signup is disabled')
  ) {
    return 'Questo account deve essere creato o invitato dal coach. Usa l invito ricevuto oppure contatta il coach.'
  }

  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('email rate limit')
  ) {
    return 'Sono stati richiesti troppi accessi in poco tempo. Attendi qualche minuto prima di richiedere un nuovo link.'
  }

  if (
    normalized.includes('otp expired') ||
    normalized.includes('token has expired') ||
    normalized.includes('invalid token') ||
    normalized.includes('expired')
  ) {
    return 'Il link non è più valido oppure è scaduto. Richiedine uno nuovo.'
  }

  return message
}
