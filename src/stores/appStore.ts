import { useSyncExternalStore } from 'react'

type ThemeMode = 'dark' | 'dim'

type AppState = {
  theme: ThemeMode
  notificationsOpen: boolean
  accountOpen: boolean
  mobileNavOpen: boolean
  installingId: string | null
  installProgress: number
}

let state: AppState = {
  theme: 'dark',
  notificationsOpen: false,
  accountOpen: false,
  mobileNavOpen: false,
  installingId: null,
  installProgress: 0,
}

const listeners = new Set<() => void>()
let installTimer: number | null = null

function emit() {
  listeners.forEach((listener) => listener())
}

function setState(partial: Partial<AppState>) {
  state = { ...state, ...partial }
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
  toggleTheme() {
    setState({ theme: state.theme === 'dark' ? 'dim' : 'dark' })
    document.documentElement.dataset.theme = state.theme
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
  startInstall(id: string) {
    if (installTimer) window.clearInterval(installTimer)
    setState({ installingId: id, installProgress: 8 })
    installTimer = window.setInterval(() => {
      const next = Math.min(100, state.installProgress + Math.random() * 11 + 4)
      setState({ installProgress: next })
      if (next >= 100 && installTimer) {
        window.clearInterval(installTimer)
        installTimer = null
      }
    }, 420)
  },
  resetInstall() {
    if (installTimer) window.clearInterval(installTimer)
    installTimer = null
    setState({ installingId: null, installProgress: 0 })
  },
}
