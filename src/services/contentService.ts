import type { ContentCategory, ContentItem } from '../types'
import { searchModrinth, listInstanceItems, listInstanceUpdates, type ModSearchResult } from '../utils/tauri'

const CONTENT_CACHE_TTL_MS = 10 * 60_000
const CONTENT_CACHE_STALE_MS = 30 * 60_000
const INSTALLED_CACHE_TTL_MS = 5_000
const CONTENT_CACHE_SCHEMA = 1
const CONTENT_CACHE_DB = 'aqua-content-cache'
const CONTENT_CACHE_STORE = 'responses'
const remoteCache = new Map<string, { expiresAt: number; value: ContentItem[] }>()
const installedCache = new Map<string, { expiresAt: number; value: ContentItem[] }>()
const pendingRemote = new Map<string, Promise<ContentItem[]>>()
const pendingInstalled = new Map<string, Promise<ContentItem[]>>()

type PersistedContent = {
  schema: number
  key: string
  fetchedAt: number
  expiresAt: number
  value: ContentItem[]
}

let contentDb: Promise<IDBDatabase | null> | null = null

function openContentDb(): Promise<IDBDatabase | null> {
  if (contentDb) return contentDb
  contentDb = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return }
    const request = indexedDB.open(CONTENT_CACHE_DB, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(CONTENT_CACHE_STORE)) database.createObjectStore(CONTENT_CACHE_STORE, { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => resolve(null)
  })
  return contentDb
}

async function readPersistedContent(key: string): Promise<PersistedContent | null> {
  const database = await openContentDb()
  if (!database) return null
  return new Promise((resolve) => {
    const request = database.transaction(CONTENT_CACHE_STORE, 'readonly').objectStore(CONTENT_CACHE_STORE).get(key)
    request.onsuccess = () => {
      const entry = request.result as PersistedContent | undefined
      resolve(entry?.schema === CONTENT_CACHE_SCHEMA ? entry : null)
    }
    request.onerror = () => resolve(null)
  })
}

function persistContent(entry: PersistedContent): void {
  void openContentDb().then((database) => {
    if (!database) return
    const transaction = database.transaction(CONTENT_CACHE_STORE, 'readwrite')
    transaction.objectStore(CONTENT_CACHE_STORE).put(entry)
  }).catch(() => undefined)
}

/** Two-tier metadata cache used by content consumers. The memory tier is
 * checked first; IndexedDB is only touched on a cold process read. */
export class ContentCacheManager {
  async get(key: string): Promise<ContentItem[] | null> {
    const memory = remoteCache.get(key)
    if (memory) return memory.value
    const persisted = await readPersistedContent(key)
    if (!persisted) return null
    remoteCache.set(key, { expiresAt: persisted.expiresAt, value: persisted.value })
    return persisted.value
  }

  async has(key: string): Promise<boolean> { return (await this.get(key)) !== null }

  set(key: string, value: ContentItem[], ttlMs = CONTENT_CACHE_TTL_MS): void {
    const expiresAt = Date.now() + ttlMs
    remoteCache.set(key, { expiresAt, value })
    persistContent({ schema: CONTENT_CACHE_SCHEMA, key, fetchedAt: Date.now(), expiresAt, value })
  }

  async invalidate(key: string): Promise<void> {
    remoteCache.delete(key)
    const database = await openContentDb()
    if (!database) return
    database.transaction(CONTENT_CACHE_STORE, 'readwrite').objectStore(CONTENT_CACHE_STORE).delete(key)
  }

  async invalidateByType(type: string): Promise<void> {
    for (const key of remoteCache.keys()) if (key.includes(`"${normalizeCachePart(type)}"`)) remoteCache.delete(key)
  }

  async clear(): Promise<void> {
    remoteCache.clear()
    const database = await openContentDb()
    if (database) database.transaction(CONTENT_CACHE_STORE, 'readwrite').objectStore(CONTENT_CACHE_STORE).clear()
  }
}

export const contentCache = new ContentCacheManager()

function normalizeCachePart(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

function remoteCacheKey(category: string, query: string, mcVersion?: string | null, loader?: string | null, instanceId?: string | null, loaderVersion?: string | null, mcDir?: string | null): string {
  return `remote:${JSON.stringify([normalizeCachePart(category), normalizeCachePart(query), normalizeCachePart(mcVersion), normalizeCachePart(loader), normalizeCachePart(instanceId), normalizeCachePart(loaderVersion), normalizeCachePart(mcDir)])}`
}

// Preloaded empty-category payloads (no query) for one active instance, so
// switching between content categories in the manager is served from cache
// instead of blocking on a fresh Modrinth call for every tab.
const preloaded = new Map<string, { at: number; instanceId: string; mcVersion: string; loader: string }>()

export type ContentPreload = { category: Exclude<ContentCategory, 'overview'>; mcVersion: string | null; loader: string | null; instanceId: string | null; loaderVersion: string | null; mcDir: string | null }

/** Kick off background fetches for every category for the current instance.
 *  Each call is deduped and non-awaited, so launcher startup is never blocked. */
export function preloadContentCategories(preload: ContentPreload) {
  if (!preload.instanceId && !preload.mcVersion) return
  void fetchRemoteContent(
    preload.category,
    '',
    preload.mcVersion,
    preload.loader,
    preload.instanceId,
    preload.loaderVersion,
    preload.mcDir,
  ).catch(() => { /* first-load failure is surfaced when the tab opens */ })
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
  timeoutMs = 10_000,
  forceRefresh = false,
): Promise<ContentItem[]> {
  const trimmed = query.trim()
  const key = remoteCacheKey(category, trimmed, mcVersion, loader, instanceId, loaderVersion, mcDir)

  // Fresh cache hit → serve instantly.
  const cached = remoteCache.get(key)
  if (cached && !forceRefresh) {
    if (cached.expiresAt > Date.now()) return cached.value
    // Keep the last usable list visible while refreshing it in the background.
    // This prevents a tab switch from regressing to a 12-second blank spinner.
    void fetchRemoteContent(category, query, mcVersion, loader, instanceId, loaderVersion, mcDir, timeoutMs, true).catch(() => undefined)
    return cached.value
  }

  if (!forceRefresh && !cached) {
    const persisted = await readPersistedContent(key)
    if (persisted) {
      remoteCache.set(key, { expiresAt: persisted.expiresAt, value: persisted.value })
      if (persisted.expiresAt > Date.now()) return persisted.value
      // Persistent stale data is still useful immediately; refresh below.
      void fetchRemoteContent(category, query, mcVersion, loader, instanceId, loaderVersion, mcDir, timeoutMs, true).catch(() => undefined)
      return persisted.value
    }
  }

  // In-flight dedup → share the same promise.
  const existing = pendingRemote.get(key)
  if (existing) return existing

  const base = searchModrinth(trimmed, category, mcVersion, loader, 24, instanceId, loaderVersion, mcDir)
    .then((results) => results.map((r) => mapModrinthToContentItem(r, category)))
    .then((value) => {
      contentCache.set(key, value)
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
      if (stale && Date.now() - stale.expiresAt < CONTENT_CACHE_STALE_MS) return stale.value
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
  const base = name.replace(/\.disabled$/i, '').replace(/\.[^.]+$/, '')
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

  const request = withTimeout(listInstanceItems(category, instanceId, mcDir), 20_000, 'Installed content request').then((items): ContentItem[] => items.map((item) => {
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
      iconUrl: item.icon_url ?? undefined,
      compatibility: item.enabled ? 'Enabled' : 'Disabled',
      compatibilityReason: item.enabled ? 'Loaded by the selected instance.' : 'Disabled for the selected instance.',
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

export async function fetchUpdates(category: Exclude<ContentCategory, 'overview'>, instanceId?: string | null, mcDir?: string | null): Promise<ContentItem[]> {
  if (!instanceId) return []
  const updates = await withTimeout(listInstanceUpdates(category, instanceId, mcDir), 45_000, 'Updates request')
  return updates.map((update) => ({
    id: update.project_id,
    name: update.filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
    author: 'Modrinth update',
    description: `Installed ${update.current_version_id} · newer compatible version ${update.latest_version_id}`,
    category,
    downloads: '',
    tags: ['Update', category],
    version: update.latest_version_id,
    installed: true,
    iconLabel: 'UP',
    accent: '#f59e0b',
    iconUrl: update.icon_url ?? undefined,
    compatibility: 'Update available',
    source: 'local',
  }))
}

export function invalidateContentCache() {
  installedCache.clear()
  // Clearing the remote cache too guarantees a refresh always refetches live
  // data instead of silently serving a still-fresh keyed entry.
  remoteCache.clear()
  preloaded.clear()
  void openContentDb().then((database) => {
    if (!database) return
    database.transaction(CONTENT_CACHE_STORE, 'readwrite').objectStore(CONTENT_CACHE_STORE).clear()
  }).catch(() => undefined)
}

/** Invalidate only local installation metadata. Remote search results remain reusable. */
export function invalidateInstalledCache(category?: Exclude<ContentCategory, 'overview'>, instanceId?: string | null, mcDir?: string | null) {
  if (!category || !instanceId) { installedCache.clear(); return }
  installedCache.delete(JSON.stringify([category, instanceId, mcDir]))
}
