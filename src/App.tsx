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

const HomePage = lazy(() => import('./pages/Home/HomePage'))
const InstancesPage = lazy(() => import('./pages/Instances/InstancesPage'))
const ContentPage = lazy(() => import('./pages/Content/ContentPage'))
const DownloadsPage = lazy(() => import('./pages/Downloads/DownloadsPage'))
const AccountsPage = lazy(() => import('./pages/Accounts/AccountsPage'))
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'))
const LogsPage = lazy(() => import('./pages/Logs/LogsPage'))

function AppThemeBridge() {
  const theme = useAppStore((s) => s.theme)
  const accent = useAppStore((s) => s.accent)
  const accentColor = useAppStore((s) => s.accentColor)
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const density = useAppStore((s) => s.density)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.reduceMotion = reduceMotion ? 'true' : 'false'
    document.documentElement.dataset.density = density

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
  }, [theme, accent, accentColor, reduceMotion, density])

  return null
}

function Application() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="instances" element={<InstancesPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
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
  useLauncherData()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), STARTUP_MOTION.splashDuration)
    return () => window.clearTimeout(timer)
  }, [])

  return ready ? <Application /> : <StartupSplash />
}

function App() {
  return (
    <ToastProvider>
      <LauncherDataProvider>
        <LocalizationProvider>
          <AppThemeBridge />
          <StartupGate />
        </LocalizationProvider>
      </LauncherDataProvider>
    </ToastProvider>
  )
}

export default App
