import type { ContentCategory, ContentItem } from '../types'
import { searchModrinth, listInstanceItems, type ModSearchResult } from '../utils/tauri'

const CONTENT_CACHE_TTL_MS = 120_000
const CONTENT_CACHE_STALE_MS = 6_000
const INSTALLED_CACHE_TTL_MS = 5_000
const remoteCache = new Map<string, { expiresAt: number; value: ContentItem[] }>()
const installedCache = new Map<string, { expiresAt: number; value: ContentItem[] }>()
const pendingRemote = new Map<string, Promise<ContentItem[]>>()
const pendingInstalled = new Map<string, Promise<ContentItem[]>>()

// Preloaded empty-category payloads (no query) for one active instance, so
// switching between content categories in the manager is served from cache
// instead of blocking on a fresh Modrinth call for every tab.
const preloaded = new Map<string, { at: number; instanceId: string; mcVersion: string; loader: string }>()

export type ContentPreload = { category: Exclude<ContentCategory, 'overview'>; mcVersion: string | null; loader: string | null; instanceId: string | null; loaderVersion: string | null; mcDir: string | null }

/** Kick off background fetches for every category for the current instance.
 *  Each call is deduped and non-awaited, so launcher startup is never blocked. */
export function preloadContentCategories(preload: ContentPreload) {
  const categories: Exclude<ContentCategory, 'overview'>[] = ['mods', 'modpacks', 'resource-packs', 'shaders', 'data-packs']
  if (!preload.instanceId && !preload.mcVersion) return
  for (const category of categories) {
    void fetchRemoteContent(
      category,
      '',
      preload.mcVersion,
      preload.loader,
      preload.instanceId,
      preload.loaderVersion,
      preload.mcDir,
    ).catch(() => {
      /* first-load failure surfaced when the user opens the tab */
    })
  }
}

export function shouldUsePreloadedCache(preload: ContentPreload): boolean {
  const entry = preloaded.get('default')
  return Boolean(
    entry &&
      Date.now() - entry.at < CONTENT_CACHE_TTL_MS &&
      entry.instanceId === (preload.instanceId ?? null) &&
      entry.mcVersion === (preload.mcVersion ?? null) &&
      entry.loader === (preload.loader ?? null),
  )
}

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
    compatibility: result.compatibility,
    compatibilityReason: result.compatibility_reason,
    loaders: result.loaders,
    gameVersions: result.game_versions,
    source: 'modrinth',
  }
}
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error(`${label} timed out. Check your connection and try again.`)),
      ms,
    )
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (err) => { window.clearTimeout(timer); reject(err) },
    )
  })
}

/**
 * Fetch remote content with a hard timeout so a hung Modrinth/CurseForge call
 * surfaces as a visible error (+ Retry) instead of an indefinite loading state.
 */
export async function fetchRemoteContent(
  category: Exclude<ContentCategory, 'overview'>,
  query = '',
  mcVersion?: string | null,
  loader?: string | null,
  instanceId?: string | null,
  loaderVersion?: string | null,
  mcDir?: string | null,
  timeoutMs = 45_000,
): Promise<ContentItem[]> {
  const trimmed = query.trim()
  const key = JSON.stringify([category, trimmed, mcVersion, loader, instanceId, loaderVersion, mcDir])

  // Fresh cache hit → serve instantly.
  const cached = remoteCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // In-flight dedup → share the same promise.
  const existing = pendingRemote.get(key)
  if (existing) return existing

  const base = searchModrinth(trimmed, category, mcVersion, loader, 24, instanceId, loaderVersion, mcDir)
    .then((results) => results.map((r) => mapModrinthToContentItem(r, category)))
    .then((value) => {
      remoteCache.set(key, { expiresAt: Date.now() + CONTENT_CACHE_TTL_MS, value })
      // Remember the most recent stable (empty-query) context for preload checks.
      if (trimmed === '') {
        preloaded.set('default', {
          at: Date.now(),
          instanceId: instanceId ?? '',
          mcVersion: mcVersion ?? '',
          loader: loader ?? '',
        })
      }
      return value
    })
    .catch((err) => {
      // On failure, serve a recent stale payload if we have one so the panel
      // shows content (and an error state) instead of hanging forever.
      const stale = remoteCache.get(key)
      if (stale && Date.now() - stale.expiresAt < CONTENT_CACHE_STALE_MS) {
        remoteCache.delete(key)
        return stale.value
      }
      throw err
    })

  const request = withTimeout(base, timeoutMs, 'Modrinth request').finally(() => pendingRemote.delete(key))
  pendingRemote.set(key, request)
  return request
}

/** Turn a raw installed filename into a clean, human-readable display name.
 *  Strips the file extension and any trailing version/number suffix, so
 *  `fabric-api-0.160.026.2.jar` becomes `Fabric API`. The original path is
 *  preserved as the item id for technical use, not shown to the user. */
function cleanFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '')
  const trimmed = base
    .replace(/[-_ ]+(\d+(\.\d+)*|\d+)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  if (!trimmed) return base
  return trimmed
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bApi\b/g, 'API')
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

  const request = listInstanceItems(category, instanceId, mcDir).then((items): ContentItem[] => items.map((item) => {
    const displayName = cleanFileName(item.name)
    return {
      id: item.path,
      name: displayName,
      author: 'Local item',
      description: `Installed locally · ${(item.size / 1024).toFixed(0)} KB`,
      category,
      downloads: `${(item.size / 1024).toFixed(0)} KB`,
      tags: [category],
      version: 'local',
      installed: true,
      iconLabel: displayName.slice(0, 2).toUpperCase(),
      accent: '#22c55e',
      source: 'local',
    }
  }))
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
  // Clearing the remote cache too guarantees a refresh always refetches live
  // data instead of silently serving a still-fresh keyed entry.
  remoteCache.clear()
  preloaded.clear()
}

