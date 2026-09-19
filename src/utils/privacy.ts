export function maskEmail(email: string | null | undefined) {
  if (!email) return 'Unavailable'
  const [local, domain] = email.split('@')
  if (!local || !domain) return 'Hidden email'
  return `${local.slice(0, 2)}${'*'.repeat(Math.max(3, local.length - 2))}@${domain}`
}