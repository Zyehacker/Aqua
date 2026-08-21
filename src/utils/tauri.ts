type TauriWindowApi = {
  getCurrentWindow?: () => {
    minimize?: () => Promise<void>
    toggleMaximize?: () => Promise<void>
    close?: () => Promise<void>
  }
}

type TauriGlobal = {
  core?: {
    invoke?: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
  }
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
  language: string
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

export type JavaRuntime = {
  path: string
  version: string
  major_version: number
  vendor: string
  architecture: string
  valid: boolean
  compatible: boolean
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
  loader_mode?: 'automatic' | 'manual' | string
  installed_version_id: string
  game_dir?: string | null
  java_path?: string | null
  java_runtime?: string | null
  java_version?: string | null
  memory_mb?: number | null
  java_args?: string | null
  install_state?: string | null
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
    if (tauri?.core && typeof tauri.core.invoke === 'function') {
      return await tauri.core.invoke(cmd, args)
    }
    if (tauri && typeof tauri.invoke === 'function') {
      return await tauri.invoke(cmd, args)
    }
    if (window.ipc && typeof window.ipc.invoke === 'function') {
      return await window.ipc.invoke(cmd, args)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message || `${cmd} failed`, { cause: error })
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
  return invoke<[string, string | null]>('install_version', { loader, mcVersion, fabricLoaderVersion, mcDir })
}

export async function ensureJava(settings: LauncherSettings) {
  return invoke<string>('ensure_java', {
    configured: settings.java_path,
    javaRuntime: settings.java_runtime,
    version: settings.version,
  })
}

export async function listJavaRuntimes(mcVersion?: string) {
  return invoke<JavaRuntime[]>('list_java_runtimes', { mcVersion })
}

export async function generateOptimalArgs() {
  return invoke<JvmSuggestion>('generate_optimal_args')
}

export async function listInstances(mcDir?: string | null) {
  return invoke<BackendInstance[]>('list_instances', { mcDir })
}

export async function getInstance(instanceId: string, mcDir?: string | null) {
  return invoke<BackendInstance>('get_instance', { instanceId, mcDir })
}

export type MsaAccount = {
  uuid: string
  username: string
  mc_access_token: string
  refresh_token: string
  expires_at: number
}

function settingsForInstalledVersion(settings: LauncherSettings, instanceId: string): LauncherSettings {
  return {
    ...settings,
    version: instanceId,
    loader_type: 'vanilla',
    fabric_loader_version: null,
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
  let launchSettings = settings

  if (typeof instance === 'object') {
    launchSettings = settingsForInstance(settings, instance)
  } else if (instance) {
    const resolvedInstance = await getInstance(instance, settings.mc_dir).catch(() => null)
    launchSettings = resolvedInstance
      ? settingsForInstance(settings, resolvedInstance)
      : settingsForInstalledVersion(settings, instance)
  }

  const result = await invoke<void>('launch_minecraft', { settings: launchSettings })
  await setSingleplayerPresence(launchSettings.version).catch(() => null)
  if (typeof instance === 'object') {
    await markInstancePlayed(instance.id, settings.mc_dir).catch(() => null)
  } else if (instance) {
    const resolvedInstance = await getInstance(instance, settings.mc_dir).catch(() => null)
    await markInstancePlayed(resolvedInstance?.id ?? instance, settings.mc_dir).catch(() => null)
  }
  return result
}

export async function isMinecraftRunning() {
  return Boolean(await invoke<boolean>('is_running'))
}

export async function stopMinecraft() {
  return invoke<void>('stop_minecraft')
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
  return invoke<MsaAccount>('msa_login')
}

export async function microsoftLogout() {
  return invoke<void>('msa_logout')
}

export async function getAccount() {
  return invoke<MsaAccount>('get_account')
}

export type AccountTextures = {
  skin_data_url: string | null
  cape_data_url: string | null
}

export async function getAccountTextures() {
  return invoke<AccountTextures>('get_account_textures')
}

export async function startRichPresence() {
  return invoke<void>('start_rich_presence')
}

export async function stopRichPresence() {
  return invoke<void>('stop_rich_presence')
}

export async function setIdlePresence() {
  return invoke<void>('set_idle_presence')
}

export async function setSingleplayerPresence(version: string) {
  return invoke<void>('set_singleplayer_presence', { version })
}

export async function setMultiplayerPresence(serverAddress: string) {
  return invoke<void>('set_multiplayer_presence', { serverName: serverAddress })
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

export type UpdateInfo = {
  current_version: string
  version: string
  body?: string | null
  date?: string | null
}

export type UpdateProgressPayload = {
  chunk_length: number
  downloaded_bytes: number
  total_bytes?: number | null
  percent?: number | null
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  return invoke<UpdateInfo>('check_for_update')
}

export async function installUpdate(): Promise<void> {
  await invoke<void>('install_update')
}

export async function restartApp(): Promise<void> {
  await invoke<void>('restart_app')
}

export async function exportInstance(instanceId: string, destination: string, mcDir?: string | null) {
  return invoke<string>('export_instance', { instanceId, destination, mcDir })
}

export async function importInstance(packagePath: string, mcDir?: string | null, requestedName?: string | null) {
  return invoke<string>('import_instance', { packagePath, mcDir, requestedName })
}

export type ModSearchResult = {
  id: string
  slug: string
  title: string
  description: string
  icon_url?: string | null
  downloads: number
  project_type: string
  game_versions: string[]
  loaders: string[]
  page_url: string
  compatibility: 'Compatible' | 'Incompatible' | 'RequiresDependency' | 'Conflict' | 'NoVersion' | 'ResolverError' | string
  compatibility_reason: string
  resolved_version_id?: string | null
}

export type LocalItem = {
  name: string
  path: string
  size: number
}

export async function searchModrinth(
  query: string,
  category: string,
  mcVersion?: string | null,
  loader?: string | null,
  limit?: number,
  instanceId?: string | null,
  loaderVersion?: string | null,
  mcDir?: string | null,
): Promise<ModSearchResult[]> {
  return (
    (await invoke<ModSearchResult[]>('search_modrinth', {
      query,
      category,
      mcVersion: mcVersion ?? '',
      loader: loader ?? '',
      limit,
      instanceId: instanceId ?? null,
      loaderVersion: loaderVersion ?? null,
      mcDir: mcDir ?? null,
    })) ?? []
  )
}

export async function listInstanceItems(
  category: string,
  instanceId?: string | null,
  mcDir?: string | null,
): Promise<LocalItem[]> {
  return (
    (await invoke<LocalItem[]>('list_instance_items', {
      instanceId,
      category,
      mcDir,
    })) ?? []
  )
}

export async function installModrinthProject(
  projectId: string,
  category: string,
  mcVersion: string,
  instanceId?: string | null,
  loader?: string | null,
  loaderVersion?: string | null,
  mcDir?: string | null,
  requestedName?: string | null,
  iconUrl?: string | null,
): Promise<string | null> {
  return invoke<string>('install_modrinth_project', {
    projectId,
    category,
    mcVersion,
    instanceId,
    loader,
    loaderVersion,
    mcDir,
    requestedName,
    iconUrl,
  })
}

export async function removeInstanceItem(
  path: string,
  instanceId?: string | null,
  category?: string,
  mcDir?: string | null,
): Promise<void> {
  await invoke<void>('remove_instance_item', {
    path,
    instanceId,
    category,
    mcDir,
  })
}
