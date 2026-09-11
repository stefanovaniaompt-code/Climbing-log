export function validatePassword(password: string, confirmation: string) {
  if (password.length < 8) return 'La password deve contenere almeno 8 caratteri.'
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Usa almeno una lettera e un numero.'
  if (password !== confirmation) return 'Le due password non coincidono.'
  return null
}

export function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('invalid login credentials')) return 'Email o password non corrette. Se non hai ancora una password, usa il link di primo accesso.'
  if (normalized.includes('email not confirmed')) return 'L’indirizzo email non è ancora confermato.'
  if (normalized.includes('weak_password') || normalized.includes('password should be')) return 'La password non rispetta i requisiti di sicurezza.'
  return message
}
