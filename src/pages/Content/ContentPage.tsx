import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  Box,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Gauge,
  Image as ImageIcon,
  Layers,
  LoaderCircle,
  Package,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Button from '../../components/ui/Button'
import SearchInput from '../../components/ui/SearchInput'
import LoadingIndicator from '../../components/ui/LoadingIndicator'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { fetchInstalledItems, fetchRemoteContent, fetchUpdates, invalidateContentCache, invalidateInstalledCache } from '../../services/contentService'
import * as tauri from '../../utils/tauri'
import type { ContentCategory, ContentItem, ContentPlatform } from '../../types'
import { cn } from '../../utils/cn'
import { formatInstanceHeading } from '../../utils/instanceDisplay'
import { MOTION, contentItemMotion, contentShellMotion } from '../../lib/motion'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { useTranslation } from '../../useTranslation'

const CATEGORY_META: Record<
  Exclude<ContentCategory, 'overview'>,
  { label: string; description: string; icon: typeof Box; color: string; soft: string }
> = {
  mods: {
    label: 'content.mods',
    description: 'content.modsDescription',
    icon: Box,
    color: 'var(--primary)',
    soft: 'var(--primary-soft)',
  },
  modpacks: {
    label: 'content.modpacks',
    description: 'content.modpacksDescription',
    icon: Package,
    color: 'var(--primary)',
    soft: 'var(--primary-soft)',
  },
  'resource-packs': {
    label: 'content.resourcePacks',
    description: 'content.resourcePacksDescription',
    icon: ImageIcon,
    color: 'var(--primary)',
    soft: 'var(--primary-soft)',
  },
  shaders: {
    label: 'content.shaders',
    description: 'content.shadersDescription',
    icon: Sparkles,
    color: 'var(--primary)',
    soft: 'var(--primary-soft)',
  },
  'data-packs': {
    label: 'content.dataPacks',
    description: 'content.dataPacksDescription',
    icon: FileText,
    color: 'var(--primary)',
    soft: 'var(--primary-soft)',
  },
}

// Render the content list in bounded windows so a long (installed) list never
// mounts every row at once — which would both stall the DOM and fire every icon
// <img> request simultaneously. "Show more" pages through the rest.
const RESULT_STEP = 20

const NAV: Array<{ id: ContentCategory; label: string; icon: typeof Gauge }> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'mods', label: 'Mods', icon: Box },
  { id: 'modpacks', label: 'Modpacks', icon: Package },
  { id: 'resource-packs', label: 'Resource Packs', icon: ImageIcon },
  { id: 'shaders', label: 'Shaders', icon: Sparkles },
  { id: 'data-packs', label: 'Data Packs', icon: FileText },
]

function ContentIcon({ src, label, className = '' }: { src?: string; label: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const validSrc = src && /^https?:\/\//i.test(src)
  return validSrc && !failed
    ? <img className={className} src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
    : <span className="content-icon-fallback" aria-label={label}><Box size={18} strokeWidth={1.8} /></span>
}

function modFilename(item: ContentItem) {
  return (item.id.split(/[\\/]/).pop() ?? item.name).replace(/\.disabled$/i, '')
}

function ContentSidebar({
  active,
  onSelect,
  profileLabel,
}: {
  active: ContentCategory
  onSelect: (id: ContentCategory) => void
  profileLabel: string
}) {
  const { t } = useTranslation()
  return (
    <aside className="content-sidebar" aria-label="Content Manager">
      <div className="content-sidebar__brand">
        <div className="content-sidebar__icon">
          <Layers size={20} />
        </div>
        <div>
          <h1>{t('content.manager')}</h1>
          <p>{profileLabel}</p>
        </div>
      </div>

      <div className="content-nav">
        <button
          type="button"
          className={cn('content-nav__item', active === 'overview' && 'active')}
          onClick={() => onSelect('overview')}
        >
          <Gauge size={18} />
          {t('content.overview')}
        </button>

        <div className="content-nav__label">{t('content.library')}</div>
        {NAV.filter((item) => item.id !== 'overview').map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              className={cn('content-nav__item', active === item.id && 'active')}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={18} />
              {t(`content.${item.id === 'resource-packs' ? 'resourcePacks' : item.id === 'data-packs' ? 'dataPacks' : item.id}`)}
            </button>
          )
        })}
      </div>

    </aside>
  )
}

function OverviewPanel({
  onManage,
  onClose,
  profileLabel,
}: {
  onManage: (id: Exclude<ContentCategory, 'overview'>) => void
  onClose: () => void
  profileLabel: string
}) {
  const { t } = useTranslation()
  return (
    <section className="content-main">
      <div className="content-main__header">
        <div>
          <h2 className="page-title" style={{ fontSize: 28 }}>
            {t('content.overview')}
          </h2>
          <p className="page-subtitle">{t('content.installedFor')} {profileLabel}.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close content manager" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>

      <div className="overview-hero">
        <div className="overview-hero__top">
          <div>
            <p className="eyebrow">Selected instance</p>
            <h2>Content library</h2>
              <p>{t('content.selectCategory')}</p>
          </div>
        </div>
      </div>

      <div className="category-grid">
        {(Object.keys(CATEGORY_META) as Array<Exclude<ContentCategory, 'overview'>>).map((key) => {
          const meta = CATEGORY_META[key]
          const Icon = meta.icon
          return (
            <motion.button
              key={key}
              type="button"
              className="category-card"
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.985 }}
              transition={MOTION.button}
              onClick={() => onManage(key)}
            >
              <div className="category-card__top">
                <div className="category-card__icon" style={{ background: meta.soft, color: meta.color }}>
                  <Icon size={20} />
                </div>
              </div>
              <strong>{t(meta.label)}</strong>
              <small>{t(meta.description)}</small>
              <span>
                {t('common.manage')} <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
              </span>
            </motion.button>
          )
        })}
      </div>
    </section>
  )
}

function DetailPanel({
  item,
  onInstall,
  onRemove,
  installing,
  activeLoader,
}: {
  item: ContentItem | null
  onInstall: (item: ContentItem) => void
  onRemove: (item: ContentItem) => void
  installing: boolean
  activeLoader?: string | null
}) {
  if (!item) {
    return (
      <aside className="content-detail glass">
        <EmptyState
          title="Select content"
          description="Choose an item from the list to inspect details, tags, and install progress."
        />
      </aside>
    )
  }

  return (
    <aside className="content-detail glass">
      <div className="content-detail__head">
        <div className="content-detail__icon" style={{ background: `linear-gradient(135deg, ${item.accent}55, ${item.accent}22)` }}>
          <ContentIcon src={item.iconUrl} label={item.iconLabel} />
        </div>
        <div>
          <h2>{item.name}</h2>
          <p>{item.author}</p>
        </div>
      </div>

      <p className="content-detail__desc">{item.description}</p>

      <div className="info-box">
        {item.installed
          ? 'Installed in the selected instance.'
          : activeLoader === 'vanilla'
            ? 'Mods cannot be installed into a Vanilla instance. Use Fabric or Forge.'
            : 'Compatibility checked against the selected Minecraft version and loader.'}
      </div>

      <div className="tag-row">
        {item.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>

      <a className="ext-link" href={item.pageUrl ?? 'https://modrinth.com'} target="_blank" rel="noreferrer">
        View on Modrinth
        <ExternalLink size={14} />
      </a>

      <div className="content-detail__footer">
        {installing ? (
          <div className="content-installing">
            <LoaderCircle size={15} className="spin" />
            <span>Installing…</span>
          </div>
        ) : null}
        <div style={{ marginTop: 14 }}>
          {item.installed ? (
            <>
              <div className="content-installed-state">{item.compatibility === 'Update available' ? 'Update available' : 'Installed'}</div>
              <Button block onClick={() => onInstall(item)}>{item.compatibility === 'Update available' ? <RefreshCw size={16} /> : null}{item.compatibility === 'Update available' ? 'Update' : 'Reinstall'}</Button>
              {item.compatibility !== 'Update available' ? <Button block variant="danger" disabled={installing} onClick={() => onRemove(item)}>
                Remove
              </Button> : null}
            </>
          ) : (
            <Button
              block
              disabled={installing || (categoryIsMod(item.category) && activeLoader === 'vanilla')}
              onClick={() => onInstall(item)}
            >
              <Download size={16} />
              Install
            </Button>
          )}
        </div>
      </div>
    </aside>
  )
}

function categoryIsMod(category: ContentItem['category']) {
  return category === 'mods'
}

function contentErrorTitle(message: string) {
  const normalized = message.toLowerCase()
  if (normalized.includes('unable to reach') || normalized.includes('request failed') || normalized.includes('network')) {
    return 'Unable to reach Modrinth'
  }
  if (normalized.includes('no compatible')) {
    return 'No compatible versions for this instance'
  }
  if (normalized.includes('metadata unavailable')) {
    return 'Instance compatibility information unavailable'
  }
  return 'Unable to resolve content'
}

function BrowsePanel({
  category,
  onClose,
  activeInstance,
  mcDir,
  initialTab = 'browse',
  onTabChange,
}: {
  category: Exclude<ContentCategory, 'overview'>
  onClose: () => void
  activeInstance: tauri.BackendInstance | null
  mcDir?: string | null
  initialTab?: 'browse' | 'installed' | 'updates'
  onTabChange?: (tab: 'browse' | 'installed' | 'updates') => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const meta = CATEGORY_META[category]
  // CATEGORY_META stores the i18n *key* (e.g. 'content.mods'). Resolve once
  // here and drive every display string from it, so the loading label, search
  // placeholder and empty states never leak a raw `content.*` key.
  const displayLabel = t(meta.label)
  const displayDescription = t(meta.description)
  const [tab, setTabState] = useState<'browse' | 'installed' | 'updates'>(initialTab)
  const setTab = (next: 'browse' | 'installed' | 'updates') => {
    setSelectedId(null)
    setItems([])
    setLoadError(null)
    setTabState(next)
    onTabChange?.(next)
  }
  const [platform, setPlatform] = useState<ContentPlatform>('modrinth')
  const [sort, setSort] = useState('downloads')
  const [order, setOrder] = useState('desc')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<ContentItem[]>([])
  const itemsRef = useRef<ContentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [installProgress, setInstallProgress] = useState<{ percentage: number; message: string; done: number; total: number } | null>(null)
  const [reload, setReload] = useState(0)
  const [loaderFilter, setLoaderFilter] = useState('all')
  const [compatibilityFilter, setCompatibilityFilter] = useState('all')
  const [shown, setShown] = useState(RESULT_STEP)
  const [modStates, setModStates] = useState<Record<string, boolean>>({})
  const [togglingMod, setTogglingMod] = useState<string | null>(null)

  useEffect(() => { itemsRef.current = items }, [items])

  const mcVersion = activeInstance?.mc_version || null
  const loader = activeInstance?.loader || null

  useEffect(() => {
    let dispose: (() => void) | null = null
    void tauri.listen<{ phase?: string; message?: string; percentage?: number; done?: number; total?: number }>('install-status', (event) => {
      if (event.phase === 'done') {
        setInstallProgress(null)
        return
      }
      if (event.phase === 'downloading' || event.phase === 'prepared' || event.phase === 'installing') {
        setInstallProgress({ percentage: Math.max(0, Math.min(100, event.percentage ?? (event.phase === 'installing' ? 100 : 0))), message: event.message ?? 'Installing content', done: event.done ?? 0, total: event.total ?? 0 })
      }
    }).then((cleanup) => { dispose = cleanup })
    return () => dispose?.()
  }, [])

  // Browse and Installed use separate effects so switching tabs never discards
  // the already-loaded list. Each effect cancels stale work on retrigger.
  const baseCategory = category

  // Installed list — reloads whenever the installed data may have changed.
  useEffect(() => {
    if (tab !== 'installed' && tab !== 'updates') return
    let cancelled = false
    const load = async () => {
      if (!activeInstance) {
        setItems([])
        setLoadError(null)
        return
      }
      if (itemsRef.current.length === 0) setLoading(true)
      setLoadError(null)
      setShown(RESULT_STEP)
      try {
        const list = tab === 'updates'
          ? await fetchUpdates(baseCategory, activeInstance?.id, mcDir)
          : await fetchInstalledItems(baseCategory, activeInstance?.id, mcDir)
        if (!cancelled) {
          setItems(list)
          setLoadError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setItems([])
          setLoadError(err instanceof Error ? err.message : 'Unable to load content from Modrinth.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const timer = window.setTimeout(load, 30)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [tab, baseCategory, activeInstance, activeInstance?.id, mcDir, reload])

  useEffect(() => {
    if (category !== 'mods' || !activeInstance) { window.setTimeout(() => setModStates({}), 0); return }
    let cancelled = false
    void tauri.listMods(mcDir, activeInstance.id, 'mods').then((mods) => {
      if (!cancelled) setModStates(Object.fromEntries(mods.map((mod) => [mod.filename, mod.enabled])))
    }).catch(() => { if (!cancelled) setModStates({}) })
    return () => { cancelled = true }
  }, [activeInstance, activeInstance?.id, category, mcDir, reload, tab])

  // Browse — debounced on query so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (tab !== 'browse') return
    let cancelled = false
    const load = async () => {
      if (!activeInstance) {
        setItems([])
        setLoadError(null)
        setLoading(false)
        return
      }
      setShown(RESULT_STEP)
      if (itemsRef.current.length === 0) setLoading(true)
      setLoadError(null)
      try {
        const list = await fetchRemoteContent(
          baseCategory,
          query,
          mcVersion,
          loader,
          activeInstance?.id ?? null,
          activeInstance?.loader_version ?? null,
          mcDir,
        )
        if (!cancelled) {
          setItems(list)
          setLoadError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setItems([])
          setLoadError(err instanceof Error ? err.message : 'Unable to load content from Modrinth.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    const timer = window.setTimeout(load, 350)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [tab, baseCategory, query, mcVersion, loader, activeInstance, activeInstance?.id, mcDir, reload])

  const sortedItems = useMemo(() => {
    const list = items.filter((item) => {
      const matchesLoader = loaderFilter === 'all' || item.loaders?.some((value) => value.toLowerCase() === loaderFilter)
      const matchesCompatibility = compatibilityFilter === 'all' || item.compatibility === compatibilityFilter
      return matchesLoader && matchesCompatibility
    })
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      return (Number.parseFloat(b.downloads) || 0) - (Number.parseFloat(a.downloads) || 0)
    })
    if (order === 'asc') list.reverse()
    return list
  }, [compatibilityFilter, items, loaderFilter, order, sort])

  const selected = selectedId ? sortedItems.find((item) => item.id === selectedId) ?? null : null

  const handleRemove = async (item: ContentItem) => {
    if (!activeInstance || !item.installed) return
    setInstallingId(item.id)
    setInstallProgress({ percentage: 0, message: `Preparing ${item.name}`, done: 0, total: 0 })
    try {
      await tauri.removeInstanceItem(item.id, activeInstance.id, category, mcDir)
      invalidateInstalledCache(category, activeInstance.id, mcDir)
      const list = await fetchInstalledItems(category, activeInstance.id, mcDir)
      setItems(list)
      setSelectedId(null)
      toast.pushToast(`${item.name} removed`, 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Unable to remove content.', 'error')
    } finally {
      setInstallingId(null)
      setInstallProgress(null)
    }
  }

  const handleInstall = async (item: ContentItem) => {
    if (!activeInstance || !mcVersion || !loader) {
      toast.pushToast('Select an instance first', 'info')
      return
    }
    setInstallingId(item.id)
    try {
      await tauri.installModrinthProject(
        item.id,
        category,
        mcVersion,
        activeInstance?.id,
        loader,
        activeInstance.loader_version,
        mcDir,
        category === 'modpacks' ? item.name : null,
        item.iconUrl,
      )
      toast.pushToast(`${item.name} installed successfully`, 'success')
      invalidateInstalledCache(category, activeInstance.id, mcDir)
      // Confirm the persisted instance state, rather than marking a search hit
      // as installed locally before the backend has written the file.
      const list = await fetchInstalledItems(category, activeInstance.id, mcDir)
      setItems(list)
      setTab('installed')
      setSelectedId(null)
    } catch (err) {
      toast.pushToast(`Install failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setInstallingId(null)
    }
  }

  const toggleInstalledMod = async (item: ContentItem) => {
    if (!activeInstance || category !== 'mods' || !item.installed) return
    const filename = modFilename(item)
    const enabled = !(modStates[filename] ?? item.compatibility !== 'Disabled')
    setTogglingMod(item.id)
    try {
      await tauri.toggleMod(mcDir, activeInstance.id, filename, enabled, 'mods')
      setModStates((current) => ({ ...current, [filename]: enabled }))
      toast.pushToast(`${item.name} ${enabled ? 'enabled' : 'disabled'}`, 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Unable to change mod state.', 'error')
    } finally { setTogglingMod(null) }
  }

  return (
    <>
    <section className="content-main">
        <div className="content-main__header">
          <div>
            <h2 className="page-title" style={{ fontSize: 28 }}>
              {displayLabel}
            </h2>
            <p className="page-subtitle">{displayDescription}</p>
            <div className="content-target-banner"><span>Target</span><strong>{activeInstance ? `${activeInstance.mc_version} • ${activeInstance.loader === 'vanilla' ? 'Vanilla' : activeInstance.loader}` : 'Select an instance'}</strong><small>{activeInstance ? formatInstanceHeading(activeInstance) : 'Choose an instance from Instances or Home.'}</small></div>
          </div>
          <Button variant="ghost" size="icon" aria-label="Back to overview" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="content-toolbar">
          <div className="segmented" role="tablist" aria-label="Library view">
            <motion.button type="button" className={cn(tab === 'browse' && 'active')} onClick={() => setTab('browse')} whileTap={{ scale: 0.98 }}>
              Browse
              {tab === 'browse' ? <motion.span className="segmented__indicator" layoutId="content-tab-indicator" transition={MOTION.spring} /> : null}
            </motion.button>
            <motion.button type="button" className={cn(tab === 'installed' && 'active')} onClick={() => setTab('installed')} whileTap={{ scale: 0.98 }}>
              Installed
              {tab === 'installed' ? <motion.span className="segmented__indicator" layoutId="content-tab-indicator" transition={MOTION.spring} /> : null}
            </motion.button>
            <motion.button type="button" className={cn(tab === 'updates' && 'active')} onClick={() => setTab('updates')} whileTap={{ scale: 0.98 }}>
              Updates
              {tab === 'updates' ? <motion.span className="segmented__indicator" layoutId="content-tab-indicator" transition={MOTION.spring} /> : null}
            </motion.button>
          </div>

          <label className="select-pill">
            <SlidersHorizontal size={14} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
              <option value="downloads">Downloads</option>
              <option value="name">Name</option>
            </select>
          </label>

          <label className="select-pill">
            <select value={order} onChange={(e) => setOrder(e.target.value)} aria-label="Sort order">
              <option value="desc">Descending</option>
              <option value="asc">Ascending</option>
            </select>
          </label>

          <div className="platform-toggle" role="group" aria-label="Content platform">
            <button
              type="button"
              className={cn(platform === 'modrinth' && 'active')}
              onClick={() => setPlatform('modrinth')}
            >
              Modrinth
            </button>
          </div>

          <div className="content-filters" aria-label="Content filters">
            <label className="select-pill"><span>Loader</span><select value={loaderFilter} onChange={(event) => setLoaderFilter(event.target.value)}><option value="all">All</option><option value="fabric">Fabric</option><option value="forge">Forge</option></select></label>
            <label className="select-pill"><span>Compatibility</span><select value={compatibilityFilter} onChange={(event) => setCompatibilityFilter(event.target.value)}><option value="all">All</option><option value="Compatible">Compatible</option><option value="Incompatible">Incompatible</option><option value="NoVersion">No version</option></select></label>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh results"
            onClick={async () => {
              setLoading(true)
              setLoadError(null)
              invalidateContentCache()
              try {
                if (tab === 'installed') {
                  const list = await fetchInstalledItems(category, activeInstance?.id, mcDir)
                  setItems(list)
                } else if (tab === 'updates') {
                  const list = await fetchUpdates(category, activeInstance?.id, mcDir)
                  setItems(list)
                } else {
                  const list = await fetchRemoteContent(category, query, mcVersion, loader, activeInstance?.id ?? null, activeInstance?.loader_version ?? null, mcDir)
                  setItems(list)
                }
                toast.pushToast(`${displayLabel} refreshed`, 'success')
              } catch (error) {
                setLoadError(error instanceof Error ? error.message : 'Unable to refresh content.')
              } finally { setLoading(false) }
            }}
          >
            <RefreshCw size={16} />
          </Button>
        </div>
        {installProgress ? <div className="content-download-progress" role="status" aria-live="polite"><div className="content-download-progress__head"><span>{installProgress.message}</span><strong>{Math.round(installProgress.percentage)}%</strong></div><div className="content-download-progress__track"><div className="content-download-progress__fill" style={{ width: `${installProgress.percentage}%` }} /></div>{installProgress.total > 1 ? <small>Dependency {installProgress.done + 1} of {installProgress.total}</small> : null}</div> : null}

        <SearchInput
          id={`search-${category}`}
          value={query}
          onChange={setQuery}
          placeholder={`Search ${displayLabel.toLowerCase()}...`}
        />

        <div className="content-list" role="listbox" aria-label={displayLabel}>
          {loadError ? (
            <EmptyState title={contentErrorTitle(loadError)} description={loadError} actionLabel="Retry" onAction={() => setReload((value) => value + 1)} />
          ) : !activeInstance ? (
            <EmptyState title="Select an install target" description="Choose an instance in the sidebar before browsing or installing content." />
          ) : loading ? (
            <LoadingIndicator label={`Loading ${displayLabel.toLowerCase()}`} detail={activeInstance ? `For ${formatInstanceHeading(activeInstance)}` : undefined} />
          ) : sortedItems.length === 0 ? (
            <EmptyState
              title={tab === 'installed' ? `No installed ${displayLabel.toLowerCase()}` : tab === 'updates' ? 'No compatible updates' : 'No results'}
              description={tab === 'installed' ? 'No items installed in this instance folder.' : tab === 'updates' ? 'Installed items are up to date for this Minecraft version and loader.' : 'Try another search term.'}
              actionLabel={query ? 'Clear search' : undefined}
              onAction={() => setQuery('')}
            />
          ) : (
             <>
             <AnimatePresence initial={false} mode="popLayout">
             {sortedItems.slice(0, shown).map((item, index) => (
               <motion.div
                 key={item.id}
                 role="option"
                 aria-selected={(selected?.id ?? null) === item.id}
                 className={cn('content-item', selected?.id === item.id && 'active')}
                 layout
                 variants={contentItemMotion}
                 initial="initial"
                 animate="enter"
                 exit="exit"
                 whileHover={{ x: 3, backgroundColor: 'rgba(105, 215, 255, 0.055)' }}
                 transition={{ layout: MOTION.spring, delay: Math.min(index * 0.025, 0.15) }}
                 onClick={() => setSelectedId(item.id)}
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedId(item.id) }}
              >
                <div
                  className="content-item__icon"
                  style={{ background: `linear-gradient(135deg, ${item.accent}66, ${item.accent}22)` }}
                >
                  <ContentIcon src={item.iconUrl} label={item.iconLabel} />
                </div>
                <div className="content-item__meta">
                  <strong>{item.name}</strong>
                  <span>{item.author}{item.version !== 'local' ? ` · ${item.version}` : ''}</span>
                  <small>{item.description}</small>
                </div>
                <div className="content-item__actions">
                  <div className={cn('content-item__downloads', item.compatibility === 'Incompatible' && 'content-item__downloads--danger')}>
                    {item.installed ? (category === 'mods' ? ((modStates[modFilename(item)] ?? item.compatibility !== 'Disabled') ? 'Enabled' : 'Disabled') : item.compatibility) : item.compatibility}
                  </div>
                  {tab === 'updates' ? <Button size="sm" variant="aqua" loading={installingId === item.id} onClick={(event) => { event.stopPropagation(); void handleInstall(item) }}><RefreshCw size={13} />Update</Button> : null}
                  {tab === 'installed' && category === 'mods' ? <button type="button" className={cn('mod-toggle', (modStates[modFilename(item)] ?? item.compatibility !== 'Disabled') && 'active')} disabled={togglingMod === item.id} onClick={(event) => { event.stopPropagation(); void toggleInstalledMod(item) }} aria-label={`${item.name} ${((modStates[modFilename(item)] ?? item.compatibility !== 'Disabled') ? 'enabled' : 'disabled')}`}><span /></button> : null}
                </div>
               </motion.div>
             ))}
             </AnimatePresence>
            {shown < sortedItems.length ? (
              <button
                type="button"
                className="content-item content-item--more"
                onClick={() => setShown((value) => value + RESULT_STEP)}
              >
                Show {Math.min(RESULT_STEP, sortedItems.length - shown)} more of {sortedItems.length}
              </button>
            ) : null}
            </>
          )}
        </div>
      </section>

      <DetailPanel
        item={selected}
        installing={installingId === selected?.id}
        activeLoader={loader}
        onInstall={handleInstall}
        onRemove={handleRemove}
      />
    </>
  )
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const initialTab = requestedTab === 'installed' || requestedTab === 'updates' ? requestedTab : 'browse'
  const [category, setCategory] = useState<ContentCategory>(requestedTab ? 'mods' : 'overview')
  const { activeInstance, settings } = useLauncherData()

  const profileLabel = activeInstance ? formatInstanceHeading(activeInstance) : 'No instance selected'

  return (
    <motion.div className="page" style={{ paddingBottom: 0 }} variants={contentShellMotion} initial="initial" animate="enter">
      <div className={cn('content-shell', category !== 'overview' && 'with-detail')}>
        <ContentSidebar active={category} onSelect={setCategory} profileLabel={profileLabel} />

        {category === 'overview' ? (
          <OverviewPanel
            onManage={(id) => setCategory(id)}
            onClose={() => navigate('/')}
            profileLabel={profileLabel}
          />
        ) : (
          <BrowsePanel
            key={category}
            category={category}
            onClose={() => setCategory('overview')}
            activeInstance={activeInstance}
            mcDir={settings?.mc_dir}
            initialTab={initialTab}
            onTabChange={(tab) => setSearchParams(tab === 'browse' ? {} : { tab })}
          />
        )}
      </div>
    </motion.div>
  )
}


