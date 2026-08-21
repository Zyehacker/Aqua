import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as tauri from '../utils/tauri'
import { LauncherDataContext } from './launcherDataContext'

const DEFAULT_SETTINGS: tauri.LauncherSettings = {
  language: 'en',
  username: 'Player', version: '', loader_type: 'vanilla', fabric_loader_version: null,
  java_path: null, java_runtime: null, mc_dir: null, instance_id: null, ram_mb: 2048,
  jvm_args: '', show_snapshots: false, minimize_on_launch: true,
}

export function LauncherDataProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<tauri.LauncherSettings | null>(null)
  const [instances, setInstances] = useState<tauri.BackendInstance[]>([])
  const [versions, setVersions] = useState<tauri.RemoteVersion[]>([])
  const [jvm, setJvm] = useState<tauri.JvmSuggestion | null>(null)
  const [javaPath, setJavaPath] = useState<string | null>(null)
  const [javaRuntimes, setJavaRuntimes] = useState<tauri.JavaRuntime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const nextSettings = (await tauri.getSettings()) ?? DEFAULT_SETTINGS
      const nextInstances = await tauri.listInstances(nextSettings.mc_dir)
      setSettings(nextSettings)
      setInstances(nextInstances ?? [])
      setJavaPath(nextSettings.java_path ?? null)
      setLoading(false)

      // These calls are useful but not required to render the launcher shell.
      // Keep them off the critical path so each lazy route can show its own skeleton.
      void Promise.all([
        tauri.listRemoteVersions(nextSettings.show_snapshots),
        tauri.generateOptimalArgs(),
        tauri.listJavaRuntimes(nextSettings.version || undefined),
      ]).then(([nextVersions, nextJvm, nextJavaRuntimes]) => {
        setVersions(nextVersions ?? [])
        setJvm(nextJvm)
        setJavaRuntimes(nextJavaRuntimes ?? [])
      }).catch((err) => {
        setError(err instanceof Error ? err.message : 'Unable to load optional launcher data.')
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load launcher data.')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void refresh() }, 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const updateSettings = useCallback(async (partial: Partial<tauri.LauncherSettings>) => {
    const current = settings ?? (await tauri.getSettings()) ?? DEFAULT_SETTINGS
    const next = { ...current, ...partial }
    setBusy('settings')
    try { await tauri.saveSettings(next); setSettings(next); return next }
    finally { setBusy(null) }
  }, [settings])

  const selectInstance = useCallback(async (id: string | null) => { await updateSettings({ instance_id: id }) }, [updateSettings])
  const detectJava = useCallback(async () => {
    const current = settings ?? DEFAULT_SETTINGS
    setBusy('java'); setError(null)
    try {
      const selected = current.instance_id
        ? await tauri.getInstance(current.instance_id, current.mc_dir).catch(() => null)
        : null
      const javaSettings = selected ? { ...current, version: selected.mc_version } : current
      const found = await tauri.ensureJava(javaSettings)
      if (found) {
        const next = await updateSettings({ java_path: found, ram_mb: current.ram_mb || jvm?.recommended_ram_mb || DEFAULT_SETTINGS.ram_mb, jvm_args: current.jvm_args || jvm?.recommended_args || '' })
        setJavaPath(next?.java_path ?? found)
        setJavaRuntimes((await tauri.listJavaRuntimes(javaSettings.version || undefined)) ?? [])
      }
      return found
    } catch (err) { setError(err instanceof Error ? err.message : 'Java setup failed.'); return null }
    finally { setBusy(null) }
  }, [jvm, settings, updateSettings])

  const activeInstanceId = settings?.instance_id ?? instances[0]?.id ?? null
  const activeInstance = useMemo(() => instances.find((instance) => instance.id === activeInstanceId) ?? instances[0] ?? null, [activeInstanceId, instances])
  useEffect(() => {
    if (loading || window.localStorage.getItem('aqua.discord.rpc') !== 'true') return
    void tauri.startRichPresence()
      .then(() => tauri.setIdlePresence())
      .catch(() => undefined)
  }, [loading])

  const value = useMemo(() => ({ settings, instances, versions, jvm, javaPath, javaRuntimes, loading, error, busy, activeInstanceId, activeInstance, refresh, updateSettings, selectInstance, detectJava }), [settings, instances, versions, jvm, javaPath, javaRuntimes, loading, error, busy, activeInstanceId, activeInstance, refresh, updateSettings, selectInstance, detectJava])
  return <LauncherDataContext.Provider value={value}>{children}</LauncherDataContext.Provider>
}
