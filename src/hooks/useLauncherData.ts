import { useCallback, useEffect, useMemo, useState } from 'react'
import * as tauri from '../utils/tauri'

export type LoaderKind = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt'

const DEFAULT_SETTINGS: tauri.LauncherSettings = {
  username: 'Player',
  version: '1.21.11',
  loader_type: 'vanilla',
  fabric_loader_version: null,
  java_path: null,
  java_runtime: null,
  mc_dir: null,
  ram_mb: 2048,
  jvm_args:
    '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=16M -XX:+ParallelRefProcEnabled -XX:+AlwaysPreTouch -XX:+DisableExplicitGC',
  show_snapshots: false,
  minimize_on_launch: true,
}

export function useLauncherData() {
  const [settings, setSettings] = useState<tauri.LauncherSettings | null>(null)
  const [instances, setInstances] = useState<tauri.BackendInstance[]>([])
  const [versions, setVersions] = useState<tauri.RemoteVersion[]>([])
  const [jvm, setJvm] = useState<tauri.JvmSuggestion | null>(null)
  const [javaPath, setJavaPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [nextSettings, nextInstances, nextVersions, nextJvm] = await Promise.all([
      tauri.getSettings(),
      tauri.listInstances(),
      tauri.listRemoteVersions(false),
      tauri.generateOptimalArgs(),
    ])

    setSettings(nextSettings ?? DEFAULT_SETTINGS)
    setInstances(nextInstances ?? [])
    setVersions(nextVersions ?? [])
    setJvm(nextJvm)
    setLoading(false)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(id)
  }, [refresh])

  const activeInstanceId = useMemo(() => {
    if (instances[0]?.id) return instances[0].id
    return settings?.version ?? DEFAULT_SETTINGS.version
  }, [instances, settings])

  const install = useCallback(
    async (loader: LoaderKind, version?: string) => {
      if (!settings) return null
      setBusy(`install-${loader}`)
      setError(null)
      try {
        const mcVersion = version ?? versions[0]?.id ?? settings.version
        if (loader !== 'vanilla' && loader !== 'fabric') {
          throw new Error(`${loader[0].toUpperCase()}${loader.slice(1)} installer support is not available in the backend yet.`)
        }

        let fabricLoaderVersion = settings.fabric_loader_version
        if (loader === 'fabric' && !fabricLoaderVersion) {
          const loaders = await tauri.listFabricLoaders(mcVersion)
          fabricLoaderVersion = loaders?.find((item) => item.stable)?.version ?? loaders?.[0]?.version ?? null
        }

        const id = await tauri.installVersion(loader, mcVersion, fabricLoaderVersion, settings.mc_dir)
        await refresh()
        return id
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Install failed.'
        setError(message)
        return null
      } finally {
        setBusy(null)
      }
    },
    [refresh, settings, versions],
  )

  const detectJava = useCallback(async () => {
    const current = settings ?? DEFAULT_SETTINGS
    setBusy('java')
    setError(null)
    try {
      const found = await tauri.ensureJava(current)
      setJavaPath(found)
      if (found && settings) {
        const next = { ...settings, java_path: found, ram_mb: jvm?.recommended_ram_mb ?? settings.ram_mb, jvm_args: jvm?.recommended_args ?? settings.jvm_args }
        setSettings(next)
        await tauri.saveSettings(next)
      }
      return found
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Java detection failed.'
      setError(message)
      return null
    } finally {
      setBusy(null)
    }
  }, [jvm, settings])

  return {
    settings,
    instances,
    versions,
    jvm,
    javaPath,
    loading,
    error,
    busy,
    activeInstanceId,
    refresh,
    install,
    detectJava,
  }
}
