import { lazy, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { ToastProvider } from './components/ToastProvider'
import { LauncherDataProvider } from './hooks/useLauncherData'
import { useLauncherData } from './hooks/useLauncherDataHook'
import StartupSplash from './components/startup/StartupSplash'
import { STARTUP_MOTION } from './components/startup/startupMotion'
import SetupWizard from './components/onboarding/SetupWizard'
import { useAppStore } from './stores/appStore'
import './index.css'
import { LocalizationProvider } from './localization'
import { AquaAuthProvider } from './hooks/useAquaAuth'
import TermsGate from './components/legal/TermsGate'
import AuthCallbackGate from './components/account/AuthCallbackGate'
import AdminPage, { AdminRoute } from './pages/Admin/AdminPage'
import { MaintenanceProvider } from './hooks/useMaintenance'

const HomePage = lazy(() => import('./pages/Home/HomePage'))
const InstancesPage = lazy(() => import('./pages/Instances/InstancesPage'))
const ContentPage = lazy(() => import('./pages/Content/ContentPage'))
const DownloadsPage = lazy(() => import('./pages/Downloads/DownloadsPage'))
const AccountsPage = lazy(() => import('./pages/Accounts/AccountsPage'))
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'))
const LogsPage = lazy(() => import('./pages/Logs/LogsPage'))
const SocialsPage = lazy(() => import('./pages/Socials/SocialsPage'))

function AppThemeBridge() {
  const theme = useAppStore((s) => s.theme)
  const accent = useAppStore((s) => s.accent)
  const accentColor = useAppStore((s) => s.accentColor)
  const reduceMotion = useAppStore((s) => s.reduceMotion)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'

    const accentMap: Record<Exclude<typeof accent, 'custom'>, string> = {
      aqua: '#58dfd1',
      cyan: '#7dd3fc',
      mint: '#81f7d3',
      lavender: '#b8a9ff',
      amber: '#f8c76a',
    }

    const value = accent === 'custom' ? accentColor : accentMap[accent]
    document.documentElement.style.setProperty('--primary', value)
    document.documentElement.style.setProperty('--primary-dim', value)
    document.documentElement.style.setProperty('--border-focus', `${value}88`)
  }, [theme, accent, accentColor, reduceMotion])

  return null
}

function Application() {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([
        import('./pages/Instances/InstancesPage'),
        import('./pages/Content/ContentPage'),
        import('./pages/Downloads/DownloadsPage'),
        import('./pages/Accounts/AccountsPage'),
        import('./pages/Settings/SettingsPage'),
        import('./pages/Socials/SocialsPage'),
      ])
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="instances" element={<InstancesPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="socials" element={<SocialsPage />} />
            <Route path="admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="accounts" element={<AccountsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="profiles" element={<Navigate to="/instances" replace />} />
            <Route path="performance" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <SetupWizard />
      </BrowserRouter>
    </>
  )
}

function StartupGate() {
  const { loading, error } = useLauncherData()
  const [splashElapsed, setSplashElapsed] = useState(false)
  const [forceReady, setForceReady] = useState(false)

  // Show the splash only briefly while the core launcher data loads. A hard
  // deadline guarantees the app never sits on a permanent "Loading instances"
  // screen, even if a backend call stalls or a non-critical service errors.
  useEffect(() => {
    if (forceReady) return undefined
    const timer = window.setTimeout(() => setForceReady(true), 5000)
    return () => window.clearTimeout(timer)
  }, [forceReady])

  useEffect(() => {
    if (loading || error || forceReady) return undefined
    const timer = window.setTimeout(() => setSplashElapsed(true), STARTUP_MOTION.splashDuration)
    return () => window.clearTimeout(timer)
  }, [error, forceReady, loading])

  const ready = (splashElapsed && !loading && !error) || forceReady
  return ready ? <><Application /><TermsGate /></> : <StartupSplash />
}

function App() {
  return (
    <ToastProvider>
      <LauncherDataProvider>
        <MaintenanceProvider>
          <AquaAuthProvider>
            <LocalizationProvider>
              <AppThemeBridge />
              <AuthCallbackGate><StartupGate /></AuthCallbackGate>
            </LocalizationProvider>
          </AquaAuthProvider>
        </MaintenanceProvider>
      </LauncherDataProvider>
    </ToastProvider>
  )
}

export default App
