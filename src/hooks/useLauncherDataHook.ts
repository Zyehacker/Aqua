import { useContext } from 'react'
import { LauncherDataContext } from './launcherDataContext'

export function useLauncherData() {
  const value = useContext(LauncherDataContext)
  if (!value) throw new Error('useLauncherData must be used inside LauncherDataProvider')
  return value
}
