export function formatProfileError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason)
  if (/username/i.test(message) && /(premium|paid|can't change|cannot change|not allowed)/i.test(message)) return "You can't change your username."
  const match = message.match(/(\d{4}-\d{2}-\d{2}(?:[T ][^\s,.]+)?)/)
  if (match?.[1]) {
    const date = new Date(match[1])
    if (!Number.isNaN(date.getTime())) return `You can change your display name again on ${date.toLocaleDateString()}.`
  }
  return message || 'Unable to update your profile.'
}
