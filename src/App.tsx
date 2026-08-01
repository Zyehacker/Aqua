import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import MainLayout from './layouts/MainLayout'
import { ToastProvider } from './components/ToastProvider'
import './index.css'

const HomePage = lazy(() => import('./pages/Home/HomePage'))
const InstancesPage = lazy(() => import('./pages/Instances/InstancesPage'))
const ContentPage = lazy(() => import('./pages/Content/ContentPage'))
const ProfilesPage = lazy(() => import('./pages/Profiles/ProfilesPage'))
const DownloadsPage = lazy(() => import('./pages/Downloads/DownloadsPage'))
const PerformancePage = lazy(() => import('./pages/Performance/PerformancePage'))
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage'))

function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="instances" element={<InstancesPage />} />
            <Route path="content" element={<ContentPage />} />
            <Route path="profiles" element={<ProfilesPage />} />
            <Route path="downloads" element={<DownloadsPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}

export default App
