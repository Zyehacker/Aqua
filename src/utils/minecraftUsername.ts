const MINECRAFT_USERNAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/

export function validateMinecraftUsername(value: string) {
  const name = value.trim()
  if (!name) return 'Minecraft username is required.'
  if (!MINECRAFT_USERNAME_PATTERN.test(name)) return 'Use 3-16 letters, numbers, or underscores.'
  return null
}