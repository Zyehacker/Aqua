import { createContext } from 'react'
import type * as tauri from '../utils/tauri'

export type LauncherData = {
  settings: tauri.LauncherSettings | null
  instances: tauri.BackendInstance[]
  versions: tauri.RemoteVersion[]
  jvm: tauri.JvmSuggestion | null
  javaPath: string | null
  javaRuntimes: tauri.JavaRuntime[]
  loading: boolean
  error: string | null
  busy: string | null
  activeInstanceId: string | null
  activeInstance: tauri.BackendInstance | null
  refresh: () => Promise<void>
  updateSettings: (partial: Partial<tauri.LauncherSettings>) => Promise<tauri.LauncherSettings | null>
  selectInstance: (id: string | null) => Promise<void>
  detectJava: () => Promise<string | null>
}

export const LauncherDataContext = createContext<LauncherData | null>(null)
