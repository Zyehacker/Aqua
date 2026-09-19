export type UiSoundTone = 'click1' | 'click2' | 'popup' | 'close' | 'notification' | 'error'

const SOUND_FILES: Record<UiSoundTone, string> = {
  click1: 'UI Click1.mp3', click2: 'UI Click2.mp3', popup: 'Popup.mp3', close: 'UI Close.mp3', notification: 'Notification.mp3', error: 'Notification.mp3',
}

function soundUrl(file: string) {
  return `/sounds/${encodeURIComponent(file)}`
}

const lastPlayedAt = new Map<UiSoundTone, number>()
const DUPLICATE_WINDOW_MS = 180

export function playUiSound(tone: UiSoundTone = 'click1', volume?: number) {
  if (window.localStorage.getItem('aqua.uiSounds') === 'false') return
  const now = performance.now()
  if (now - (lastPlayedAt.get(tone) ?? -Infinity) < DUPLICATE_WINDOW_MS) return
  lastPlayedAt.set(tone, now)
  const url = soundUrl(SOUND_FILES[tone])
  const audio = new Audio(url)
  const configuredVolume = volume ?? Number(window.localStorage.getItem('aqua.uiSoundVolume') ?? '0.28')
  const safeVolume = Number.isFinite(configuredVolume) ? configuredVolume : 0.28
  audio.volume = Math.max(0, Math.min(1, safeVolume * 0.28))
  audio.preload = 'auto'
  void audio.play().catch(() => undefined)
}
