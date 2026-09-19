import { useSyncExternalStore } from 'react'

type ThemeMode = 'dark' | 'dim'
type AccentMode = 'aqua' | 'cyan' | 'mint' | 'lavender' | 'amber'
type BackgroundMode = 'default' | 'solid' | 'gradient' | 'video'
type LayoutDensity = 'comfortable' | 'compact'
type AppState = {
  theme: ThemeMode
  accent: AccentMode | 'custom'
  accentColor: string
  reduceMotion: boolean
  uiSounds: boolean
  uiSoundVolume: number
  backgroundMode: BackgroundMode
  layoutDensity: LayoutDensity
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
  reduceMotion: readStorage<boolean>('aqua.reduceMotion', window.matchMedia('(prefers-reduced-motion: reduce)').matches),
  uiSounds: readStorage<boolean>('aqua.uiSounds', true),
  uiSoundVolume: readStorage<number>('aqua.uiSoundVolume', 0.28),
  backgroundMode: readStorage<BackgroundMode>('aqua.backgroundMode', 'default'),
  layoutDensity: readStorage<LayoutDensity>('aqua.layoutDensity', 'comfortable'),
  notificationsOpen: false,
  accountOpen: false,
  mobileNavOpen: false,
}

// Apply persisted data attributes on load
document.documentElement.dataset.theme = state.theme
document.documentElement.dataset.reduceMotion = state.reduceMotion ? 'true' : 'false'
document.documentElement.dataset.background = state.backgroundMode
document.documentElement.dataset.density = state.layoutDensity

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
  if (partial.uiSounds !== undefined) persist('aqua.uiSounds', partial.uiSounds)
  if (partial.uiSoundVolume !== undefined) persist('aqua.uiSoundVolume', partial.uiSoundVolume)
  if (partial.backgroundMode) {
    document.documentElement.dataset.background = partial.backgroundMode
    persist('aqua.backgroundMode', partial.backgroundMode)
  }
  if (partial.layoutDensity) {
    document.documentElement.dataset.density = partial.layoutDensity
    persist('aqua.layoutDensity', partial.layoutDensity)
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
  setReduceMotion(enabled: boolean) {
    setState({ reduceMotion: enabled })
  },
  setUiSounds(enabled: boolean) { setState({ uiSounds: enabled }) },
  setUiSoundVolume(volume: number) { setState({ uiSoundVolume: Math.max(0, Math.min(1, volume)) }) },
  toggleTheme() {
    setState({ theme: state.theme === 'dark' ? 'dim' : 'dark' })
  },
  setBackgroundMode(mode: BackgroundMode) {
    setState({ backgroundMode: mode })
  },
  setLayoutDensity(density: LayoutDensity) {
    setState({ layoutDensity: density })
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
