type TauriWindowApi = {
  getCurrentWindow?: () => {
    minimize?: () => Promise<void>
    toggleMaximize?: () => Promise<void>
    close?: () => Promise<void>
  }
}

type TauriGlobal = {
  invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  event?: {
    listen?: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
  }
  window?: TauriWindowApi
}

type LegacyIpc = {
  invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal
    ipc?: LegacyIpc
  }
}

export type LauncherSettings = {
  username: string
  version: string
  loader_type: string
  fabric_loader_version?: string | null
  java_path?: string | null
  java_runtime?: string | null
  mc_dir?: string | null
  instance_id?: string | null
  ram_mb: number
  jvm_args: string
  show_snapshots: boolean
  minimize_on_launch: boolean
  window_x?: number | null
  window_y?: number | null
  window_width?: number | null
  window_height?: number | null
  window_maximized?: boolean | null
}

export type JvmSuggestion = {
  recommended_ram_mb: number
  recommended_args: string
  memory_mb: number
  cores: number
}

export type RemoteVersion = {
  id: string
  type: string
  url: string
}

export type FabricLoader = {
  version: string
  stable: boolean
}

export type ForgeLoader = {
  version: string
  recommended: boolean
}

export type BackendInstance = {
  id: string
  name: string
  mc_version: string
  loader: 'vanilla' | 'fabric' | 'forge' | string
  loader_version?: string | null
  installed_version_id: string
  created_at: number
  updated_at: number
  last_played_at?: number | null
  mod_count: number
  pack_count: number
  shader_count: number
}

export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  const tauri = window.__TAURI__
  try {
    if (tauri && typeof tauri.invoke === 'function') {
      return await tauri.invoke(cmd, args)
    }
    if (window.ipc && typeof window.ipc.invoke === 'function') {
      return await window.ipc.invoke(cmd, args)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || `${cmd} failed`)
  }
  return null
}

export async function getSettings() {
  return invoke<LauncherSettings>('get_settings')
}

export async function saveSettings(settings: LauncherSettings) {
  return invoke<void>('save_settings', { settings })
}

export async function getDefaultMcDir() {
  return invoke<string>('get_default_mc_dir')
}

export async function listVersions(mcDir?: string | null) {
  return invoke<string[]>('list_versions', { mcDir })
}

export async function listRemoteVersions(includeSnapshots = false) {
  return invoke<RemoteVersion[]>('list_remote_versions', { includeSnapshots })
}

export async function listFabricLoaders(mcVersion: string) {
  return invoke<FabricLoader[]>('list_fabric_loaders', { mcVersion })
}

export async function listForgeLoaders(mcVersion: string) {
  return invoke<ForgeLoader[]>('list_forge_loaders', { mcVersion })
}

export async function installVersion(
  loader: string,
  mcVersion: string,
  fabricLoaderVersion?: string | null,
  mcDir?: string | null,
) {
  return invoke<string>('install_version', { loader, mcVersion, fabricLoaderVersion, mcDir })
}

export async function ensureJava(settings: LauncherSettings) {
  return invoke<string>('ensure_java', {
    configured: settings.java_path,
    javaRuntime: settings.java_runtime,
    version: settings.version,
  })
}

export async function generateOptimalArgs() {
  return invoke<JvmSuggestion>('generate_optimal_args')
}

export async function listInstances(mcDir?: string | null) {
  return invoke<BackendInstance[]>('list_instances', { mcDir })
}

function settingsForInstalledVersion(settings: LauncherSettings, instanceId: string): LauncherSettings {
  if (instanceId.includes('forge')) {
    const forgeMatch = instanceId.match(/^(.+?)-(?:forge-)?([0-9][\w.-]*)$/)
    return {
      ...settings,
      version: forgeMatch?.[1] ?? settings.version,
      loader_type: 'forge',
      fabric_loader_version: forgeMatch?.[2] ?? null,
      instance_id: instanceId,
    }
  }
  if (!instanceId.startsWith('fabric-loader-')) {
    return { ...settings, version: instanceId, loader_type: 'vanilla', fabric_loader_version: null, instance_id: instanceId }
  }

  const rest = instanceId.replace('fabric-loader-', '')
  const parts = rest.split('-')
  const mcVersionIndex = parts.findIndex((part) => /^\d+\.\d+/.test(part))
  if (mcVersionIndex <= 0) return { ...settings, version: instanceId }

  return {
    ...settings,
    loader_type: 'fabric',
    fabric_loader_version: parts.slice(0, mcVersionIndex).join('-'),
    version: parts.slice(mcVersionIndex).join('-'),
    instance_id: instanceId,
  }
}

function settingsForInstance(settings: LauncherSettings, instance: BackendInstance): LauncherSettings {
  return {
    ...settings,
    version: instance.mc_version || instance.installed_version_id,
    loader_type: instance.loader,
    fabric_loader_version: instance.loader_version ?? null,
    instance_id: instance.id,
  }
}

export async function createInstance(
  instanceName: string,
  mcVersion: string,
  loader: string,
  loaderVersion?: string | null,
  mcDir?: string | null,
) {
  return invoke<string>('create_instance', {
    instanceName,
    mcVersion,
    loader,
    fabricLoaderVersion: loaderVersion,
    mcDir,
  })
}

export async function updateInstance(instanceId: string, update: Record<string, unknown>, mcDir?: string | null) {
  return invoke<BackendInstance>('update_instance', { instanceId, update, mcDir })
}

export async function duplicateInstance(instanceId: string, newName: string, mcDir?: string | null) {
  return invoke<string>('duplicate_instance', { instanceId, newName, mcDir })
}

export async function deleteInstance(instanceId: string, mcDir?: string | null) {
  return invoke<void>('delete_instance', { instanceId, mcDir })
}

export async function openInstanceFolder(instanceId: string, mcDir?: string | null) {
  return invoke<void>('open_instance_folder', { instanceId, mcDir })
}

export async function markInstancePlayed(instanceId: string, mcDir?: string | null) {
  return invoke<void>('mark_instance_played', { instanceId, mcDir })
}

export async function launchInstance(instance?: string | BackendInstance) {
  const settings = await getSettings()
  if (!settings) return null
  const launchSettings =
    typeof instance === 'object'
      ? settingsForInstance(settings, instance)
      : instance
        ? settingsForInstalledVersion(settings, instance)
        : settings
  const result = await invoke<void>('launch_minecraft', { settings: launchSettings })
  if (typeof instance === 'object') {
    await markInstancePlayed(instance.id, settings.mc_dir).catch(() => null)
  } else if (instance) {
    await markInstancePlayed(instance, settings.mc_dir).catch(() => null)
  }
  return result
}

export async function listen<T>(event: string, handler: (payload: T) => void) {
  const listener = window.__TAURI__?.event?.listen
  if (!listener) return null
  return listener<T>(event, ({ payload }) => handler(payload))
}

export async function openContent(id: string) {
  return invoke('open_content', { id })
}

export async function startDownload(jobId: string) {
  return invoke('start_download', { id: jobId })
}

export async function microsoftLogin() {
  return invoke<string>('msa_login')
}

export async function getAccount() {
  return invoke<Record<string, unknown>>('get_account')
}

async function withCurrentWindow(action: 'minimize' | 'toggleMaximize' | 'close') {
  const current = window.__TAURI__?.window?.getCurrentWindow?.()
  await current?.[action]?.()
}

export const windowControls = {
  minimize: () => withCurrentWindow('minimize'),
  toggleMaximize: () => withCurrentWindow('toggleMaximize'),
  close: () => withCurrentWindow('close'),
}
