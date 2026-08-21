import type { ContentCategory, ContentItem } from '../types'
import { searchModrinth, listInstanceItems, type ModSearchResult } from '../utils/tauri'

const CONTENT_CACHE_TTL_MS = 60_000
const INSTALLED_CACHE_TTL_MS = 5_000
const remoteCache = new Map<string, { expiresAt: number; value: ContentItem[] }>()
const installedCache = new Map<string, { expiresAt: number; value: ContentItem[] }>()
const pendingRemote = new Map<string, Promise<ContentItem[]>>()
const pendingInstalled = new Map<string, Promise<ContentItem[]>>()

function mapModrinthToContentItem(
  result: ModSearchResult,
  category: Exclude<ContentCategory, 'overview'>,
  isInstalled = false,
): ContentItem {
  return {
    id: result.id,
    name: result.title,
    author: result.slug || result.title,
    description: result.description,
    category,
    downloads:
      result.downloads > 1000000
        ? `${(result.downloads / 1000000).toFixed(1)}M`
        : result.downloads > 1000
          ? `${(result.downloads / 1000).toFixed(0)}K`
          : `${result.downloads}`,
    tags: [result.compatibility, ...(result.loaders || []), ...(result.game_versions || []).slice(0, 2)],
    version: result.game_versions?.[0] || '',
    installed: isInstalled,
    iconLabel: (result.title || 'MC').slice(0, 2).toUpperCase(),
    accent: '#00c8ff',
    pageUrl: result.page_url,
    iconUrl: result.icon_url ?? undefined,
  }
}
export async function fetchRemoteContent(
  category: Exclude<ContentCategory, 'overview'>,
  query = '',
  mcVersion?: string | null,
  loader?: string | null,
  instanceId?: string | null,
  loaderVersion?: string | null,
  mcDir?: string | null,
): Promise<ContentItem[]> {
  const key = JSON.stringify([category, query.trim(), mcVersion, loader, instanceId, loaderVersion, mcDir])
  const cached = remoteCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const existing = pendingRemote.get(key)
  if (existing) return existing

  const request = searchModrinth(query, category, mcVersion, loader, 24, instanceId, loaderVersion, mcDir)
    .then((results) => results.map((r) => mapModrinthToContentItem(r, category)))
    .then((value) => {
      remoteCache.set(key, { expiresAt: Date.now() + CONTENT_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => pendingRemote.delete(key))
  pendingRemote.set(key, request)
  return request
}

export async function fetchInstalledItems(
  category: Exclude<ContentCategory, 'overview'>,
  instanceId?: string | null,
  mcDir?: string | null,
): Promise<ContentItem[]> {
  if (!instanceId) return []
  const key = JSON.stringify([category, instanceId, mcDir])
  const cached = installedCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const existing = pendingInstalled.get(key)
  if (existing) return existing

  const request = listInstanceItems(category, instanceId, mcDir).then((items) => items.map((item) => ({
      id: item.path,
      name: item.name,
      author: 'Local item',
      description: `Local file: ${item.path}`,
      category,
      downloads: `${(item.size / 1024).toFixed(0)} KB`,
      tags: ['Installed', category],
      version: 'local',
      installed: true,
      iconLabel: item.name.slice(0, 2).toUpperCase(),
      accent: '#22c55e',
    })))
    .then((value) => {
      installedCache.set(key, { expiresAt: Date.now() + INSTALLED_CACHE_TTL_MS, value })
      return value
    })
    .finally(() => pendingInstalled.delete(key))
  pendingInstalled.set(key, request)
  return request
}

export function invalidateContentCache() {
  installedCache.clear()
}

