import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as tauri from '../utils/tauri'
import { LauncherDataContext } from './launcherDataContext'

const DEFAULT_SETTINGS: tauri.LauncherSettings = {
  language: 'en',
  username: 'Player', version: '', loader_type: 'vanilla', fabric_loader_version: null,
  java_path: null, java_runtime: null, mc_dir: null, instance_id: null, offline_mode: false, offline_profile_name: 'Aqua_Player', offline_profiles: [{ id: 'default-offline', name: 'Aqua_Player' }], active_offline_profile_id: 'default-offline', confirm_before_launch: false, resolution_width: 854, resolution_height: 480, fullscreen: false, ram_mb: 2048,
  jvm_args: '', show_snapshots: false, minimize_on_launch: true, quick_startup: true,
  performance_profile: 'balanced',
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
  const [processRunning, setProcessRunning] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const nextSettings = (await tauri.getSettings()) ?? DEFAULT_SETTINGS
      const nextInstances = (await tauri.listInstances(nextSettings.mc_dir)) ?? []

      const sanitizedInstanceId = nextSettings.instance_id && nextInstances.some((instance) => instance.id === nextSettings.instance_id)
        ? nextSettings.instance_id
        : null

      const persistedSettings = sanitizedInstanceId === nextSettings.instance_id
        ? nextSettings
        : { ...nextSettings, instance_id: sanitizedInstanceId }

      if (persistedSettings !== nextSettings) {
        await tauri.saveSettings(persistedSettings)
      }

      setSettings(persistedSettings)
      setInstances(nextInstances)
      setJavaPath(nextSettings.java_path ?? null)
      setLoading(false)

      void Promise.all([
        tauri.listRemoteVersions(nextSettings.show_snapshots),
        tauri.generateOptimalArgs(),
        tauri.listJavaRuntimes(nextSettings.version || undefined),
      ]).then(([nextVersions, nextJvm, nextJavaRuntimes]) => {
        setVersions(nextVersions ?? [])
        setJvm(nextJvm)
        setJavaRuntimes(nextJavaRuntimes ?? [])
      }).catch((err) => {
        // Non-critical: versions/JVM/Java runtime are nice-to-have extras that the
        // pages load lazily when needed. Never block app startup on these.
        if (import.meta.env.DEV) console.warn('Optional launcher data unavailable:', err)
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
    if (loading || window.localStorage.getItem('aqua.discord.rpc') === 'false') return
    let active = true
    let unsubscribe: (() => void) | null = null
    const reconnect = () => {
      if (document.hidden) return
      if (active) void tauri.startRichPresence().then(() => tauri.setIdlePresence()).catch(() => undefined)
    }
    void tauri.listen<{ message?: string }>('richpresence-unavailable', (event) => {
      if (active && event.message) console.warn(event.message)
    }).then((cleanup) => {
      if (active) unsubscribe = cleanup
      else cleanup?.()
    })
    reconnect()
    const timer = window.setInterval(reconnect, 30_000)
    return () => { active = false; unsubscribe?.(); window.clearInterval(timer) }
  }, [loading])

  useEffect(() => {
    let active = true
    const poll = () => {
      if (document.hidden) return
      void tauri.isMinecraftRunning().then((running) => { if (active) setProcessRunning(running) }).catch(() => undefined)
    }
    poll()
    const timer = window.setInterval(poll, 2000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  const value = useMemo(() => ({ settings, instances, versions, jvm, javaPath, javaRuntimes, loading, error, busy, processRunning, activeInstanceId, activeInstance, refresh, updateSettings, selectInstance, detectJava }), [settings, instances, versions, jvm, javaPath, javaRuntimes, loading, error, busy, processRunning, activeInstanceId, activeInstance, refresh, updateSettings, selectInstance, detectJava])
  return <LauncherDataContext.Provider value={value}>{children}</LauncherDataContext.Provider>
}
