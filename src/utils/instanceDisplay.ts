import type { BackendInstance, LauncherSettings } from './tauri'

type InstanceLabelSource = Partial<Pick<
  BackendInstance,
  'id' | 'name' | 'mc_version' | 'loader' | 'loader_version' | 'installed_version_id'
>> & {
  channel?: string | null
  release_channel?: string | null
  version?: string | null
  loader_type?: string | null
  fabric_loader_version?: string | null
}

function normalizeLoaderLabel(loader: string | null | undefined) {
  const value = loader?.trim().toLowerCase()
  if (!value || value === 'vanilla') return ''
  if (value === 'neoforge') return 'NeoForge'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function normalizeChannelLabel(channel: string | null | undefined) {
  const value = channel?.trim().toLowerCase()
  if (!value) return ''
  if (value === 'stable') return 'Stable'
  if (value === 'recommended') return 'Recommended'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function resolveMinecraftVersion(source: InstanceLabelSource) {
  return source.mc_version?.trim() || source.version?.trim() || source.installed_version_id?.trim() || source.id?.trim() || 'Minecraft'
}

function resolveLoader(source: InstanceLabelSource) {
  return source.loader?.trim() || source.loader_type?.trim() || ''
}

function resolveChannel(source: InstanceLabelSource) {
  return source.channel?.trim() || source.release_channel?.trim() || ''
}

export function formatInstanceDisplayName(source: InstanceLabelSource): string {
  const mcVersion = resolveMinecraftVersion(source)
  const loaderLabel = normalizeLoaderLabel(resolveLoader(source))
  const channelLabel = normalizeChannelLabel(resolveChannel(source))

  const parts = [mcVersion]

  if (loaderLabel) {
    parts.push(loaderLabel)
    if (channelLabel) {
      parts[parts.length - 1] = `${parts[parts.length - 1]} (${channelLabel})`
    }
  }

  return parts.join(' ').trim()
}

export function formatInstanceHeading(source: InstanceLabelSource) {
  const customName = source.name?.trim() ?? ''
  if (customName) {
    return customName
  }
  return `Minecraft ${resolveMinecraftVersion(source)}`
}

export function formatLauncherSelectionLabel(settings: Pick<
  LauncherSettings,
  'version' | 'loader_type' | 'fabric_loader_version'
>) {
  return formatInstanceDisplayName({
    id: settings.version,
    name: settings.version,
    mc_version: settings.version,
    loader: settings.loader_type,
    loader_version: settings.fabric_loader_version ?? undefined,
    installed_version_id: settings.version,
  })
}
