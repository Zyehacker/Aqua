type UiSoundTone = 'primary' | 'success' | 'error' | 'nav'

const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

let audioContext: AudioContext | null = null

function getContext() {
  if (!AudioContextClass) return null
  if (!audioContext) {
    audioContext = new AudioContextClass()
  }
  return audioContext
}

export function playUiSound(tone: UiSoundTone = 'primary', volume = 0.28) {
  const context = getContext()
  if (!context) return

  const now = context.currentTime
  const oscillator = context.createOscillator()
  const gain = context.createGain()

  oscillator.type = tone === 'error' ? 'square' : tone === 'success' ? 'triangle' : 'sine'
  oscillator.frequency.setValueAtTime(
    tone === 'error' ? 180 : tone === 'success' ? 620 : tone === 'nav' ? 420 : 510,
    now,
  )

  const end = tone === 'error' ? 0.12 : tone === 'success' ? 0.18 : 0.1
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + end)

  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(now)
  oscillator.stop(now + end)
}
