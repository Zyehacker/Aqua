import { useSyncExternalStore } from 'react'

type ThemeMode = 'dark' | 'dim'
type AccentMode = 'aqua' | 'cyan' | 'mint' | 'lavender' | 'amber'
export type BackgroundChoice = 'random' | 'background1' | 'background2' | 'background3' | 'background4' | 'background5'

type AppState = {
  theme: ThemeMode
  accent: AccentMode | 'custom'
  accentColor: string
  uiSounds: boolean
  soundVolume: number
  reduceMotion: boolean
  density: 'comfortable' | 'compact'
  background: BackgroundChoice
  notificationsOpen: boolean
  accountOpen: boolean
  mobileNavOpen: boolean
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const value = window.localStorage.getItem(key)
    return value === null ? fallback : JSON.parse(value) as T
  } catch {
    return fallback
  }
}

let state: AppState = {
  theme: (window.localStorage.getItem('aqua.theme') as ThemeMode | null) ?? 'dark',
  accent: readStorage<AccentMode | 'custom'>('aqua.accent', 'aqua'),
  accentColor: readStorage<string>('aqua.accentColor', '#58dfd1'),
  uiSounds: readStorage<boolean>('aqua.uiSounds', true),
  soundVolume: readStorage<number>('aqua.soundVolume', 0.28),
  reduceMotion: readStorage<boolean>('aqua.reduceMotion', window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  density: readStorage<'comfortable' | 'compact'>('aqua.density', 'comfortable'),
  background: readStorage<BackgroundChoice>('aqua.background', 'background1'),
  notificationsOpen: false,
  accountOpen: false,
  mobileNavOpen: false,
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

function persist(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function setState(partial: Partial<AppState>) {
  state = { ...state, ...partial }
  const accentValue = partial.accent ?? state.accent
  const accentColorValue = partial.accentColor ?? state.accentColor
  if (partial.accent || partial.accentColor) {
    const accentMap: Record<AccentMode, string> = {
      aqua: '#58dfd1',
      cyan: '#7dd3fc',
      mint: '#81f7d3',
      lavender: '#b8a9ff',
      amber: '#f8c76a',
    }
    const nextColor = accentValue === 'custom' ? accentColorValue : accentMap[accentValue as AccentMode] ?? accentColorValue
    document.documentElement.style.setProperty('--primary', nextColor)
    document.documentElement.style.setProperty('--primary-dim', nextColor)
    document.documentElement.style.setProperty('--border-focus', `${nextColor}88`)
    persist('aqua.accent', accentValue)
    persist('aqua.accentColor', accentColorValue)
  }
  if (partial.theme) {
    document.documentElement.dataset.theme = partial.theme
    persist('aqua.theme', partial.theme)
  }
  if (partial.reduceMotion !== undefined) {
    document.documentElement.dataset.reduceMotion = partial.reduceMotion ? 'true' : 'false'
    persist('aqua.reduceMotion', partial.reduceMotion)
  }
  if (partial.uiSounds !== undefined) {
    persist('aqua.uiSounds', partial.uiSounds)
  }
  if (partial.soundVolume !== undefined) {
    persist('aqua.soundVolume', partial.soundVolume)
  }
  if (partial.density) {
    document.documentElement.dataset.density = partial.density
    document.documentElement.style.setProperty('--space-unit', partial.density === 'compact' ? '0.82' : '1')
    persist('aqua.density', partial.density)
  }
  emit()
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot() {
  return state
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  )
}

export const appActions = {
  setAccent(accent: AppState['accent'], accentColor = state.accentColor) {
    setState({ accent, accentColor })
  },
  setCustomAccent(hex: string) {
    setState({ accent: 'custom', accentColor: hex })
  },
  setUiSounds(enabled: boolean) {
    setState({ uiSounds: enabled })
  },
  setSoundVolume(volume: number) {
    setState({ soundVolume: volume })
  },
  setReduceMotion(enabled: boolean) {
    setState({ reduceMotion: enabled })
  },
  setDensity(density: AppState['density']) {
    setState({ density })
  },
  setBackground(background: BackgroundChoice) {
    setState({ background })
    persist('aqua.background', background)
  },
  toggleTheme() {
    setState({ theme: state.theme === 'dark' ? 'dim' : 'dark' })
  },
  toggleNotifications() {
    setState({ notificationsOpen: !state.notificationsOpen, accountOpen: false })
  },
  toggleAccount() {
    setState({ accountOpen: !state.accountOpen, notificationsOpen: false })
  },
  toggleMobileNav() {
    setState({ mobileNavOpen: !state.mobileNavOpen })
  },
  closeOverlays() {
    setState({ notificationsOpen: false, accountOpen: false, mobileNavOpen: false })
  },
}
