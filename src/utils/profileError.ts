export function formatProfileError(reason: unknown): string {
  let message: string

  if (reason instanceof Error) {
    message = reason.message
  } else if (typeof reason === 'string') {
    message = reason
  } else if (typeof reason === 'object' && reason !== null) {
    // Handle Supabase or other structured errors
    const obj = reason as Record<string, unknown>
    if (typeof obj.message === 'string') {
      message = obj.message
    } else if (typeof obj.error_description === 'string') {
      message = obj.error_description
    } else if (typeof obj.error === 'string') {
      message = obj.error
    } else if (typeof obj.code === 'string') {
      message = obj.code
    } else {
      message = JSON.stringify(reason)
    }
  } else {
    message = String(reason)
  }

  // Fallback for empty message
  if (!message || message === '{}' || message === '[object Object]') {
    message = 'An error occurred.'
  }

  if (/sql|postgres|relation .* does not exist|column .* does not exist|schema|database|constraint|foreign key|violates/i.test(message)) {
    return 'Aqua social services are temporarily unavailable. Please try again.'
  }

  // Check for username-related errors
  if (/username/i.test(message) && /(premium|paid|can't change|cannot change|not allowed)/i.test(message)) {
    return "You can't change your username."
  }

  // Check for cooldown period
  const match = message.match(/(\d{4}-\d{2}-\d{2}(?:[T ][^\s,.]+)?)/)
  if (match?.[1]) {
    const date = new Date(match[1])
    if (!Number.isNaN(date.getTime())) {
      return `You can change your display name again on ${date.toLocaleDateString()}.`
    }
  }

  return message || 'Unable to update your profile.'
}
