import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
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
import { useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import SearchInput from '../../components/ui/SearchInput'
import ProgressBar from '../../components/ui/ProgressBar'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { fetchInstalledItems, fetchRemoteContent, invalidateContentCache } from '../../services/contentService'
import * as tauri from '../../utils/tauri'
import type { ContentCategory, ContentItem, ContentPlatform } from '../../types'
import { cn } from '../../utils/cn'
import { formatInstanceHeading } from '../../utils/instanceDisplay'
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

const NAV: Array<{ id: ContentCategory; label: string; icon: typeof Gauge }> = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'mods', label: 'Mods', icon: Box },
  { id: 'modpacks', label: 'Modpacks', icon: Package },
  { id: 'resource-packs', label: 'Resource Packs', icon: ImageIcon },
  { id: 'shaders', label: 'Shaders', icon: Sparkles },
  { id: 'data-packs', label: 'Data Packs', icon: FileText },
]

function ContentSidebar({
  active,
  onSelect,
  profileLabel,
  instances,
  activeInstanceId,
  onInstanceChange,
}: {
  active: ContentCategory
  onSelect: (id: ContentCategory) => void
  profileLabel: string
  instances: tauri.BackendInstance[]
  activeInstanceId: string | null
  onInstanceChange: (id: string) => void
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

      <div className="content-sidebar__footer">
        <label className="content-instance-select">
          <span>{t('content.installTarget')}</span>
          <select value={activeInstanceId ?? ''} onChange={(event) => onInstanceChange(event.target.value)}>
            {instances.length === 0 ? <option value="">{t('content.noInstance')}</option> : null}
            {instances.map((instance) => <option key={instance.id} value={instance.id}>{formatInstanceHeading(instance)}</option>)}
          </select>
        </label>
        <strong>{profileLabel}</strong>
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
              whileHover={{ y: -2 }}
              transition={{ duration: 0.18 }}
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
          {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" decoding="async" /> : item.iconLabel}
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
        <ProgressBar value={item.installed ? 100 : 0} label={item.installed ? 'Installed' : 'Ready to install'} showValue />
        <div style={{ marginTop: 14 }}>
          <Button
            block
            disabled={installing || (categoryIsMod(item.category) && activeLoader === 'vanilla')}
            onClick={() => onInstall(item)}
          >
            {installing ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            {item.installed ? 'Reinstall' : 'Install'}
          </Button>
          {item.installed ? (
            <Button block variant="danger" disabled={installing} onClick={() => onRemove(item)}>
              Remove
            </Button>
          ) : null}
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
}: {
  category: Exclude<ContentCategory, 'overview'>
  onClose: () => void
  activeInstance: tauri.BackendInstance | null
  mcDir?: string | null
}) {
  const toast = useToast()
  const meta = CATEGORY_META[category]
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [platform, setPlatform] = useState<ContentPlatform>('modrinth')
  const [sort, setSort] = useState('downloads')
  const [order, setOrder] = useState('desc')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [items, setItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const mcVersion = activeInstance?.mc_version || null
  const loader = activeInstance?.loader || null

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!activeInstance) {
        setItems([])
        setLoadError(null)
        return
      }
      setLoading(true)
      setLoadError(null)
      try {
        if (tab === 'installed') {
          const list = await fetchInstalledItems(category, activeInstance?.id, mcDir)
          if (!cancelled) setItems(list)
        } else {
          const list = await fetchRemoteContent(
            category,
            query,
            mcVersion,
            loader,
            activeInstance?.id ?? null,
            activeInstance?.loader_version ?? null,
            mcDir,
          )
          if (!cancelled) setItems(list)
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

    const timer = window.setTimeout(load, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [category, tab, query, mcVersion, loader, activeInstance, activeInstance?.id, mcDir, reload])

  const sortedItems = useMemo(() => {
    const list = [...items]
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      return (Number.parseFloat(b.downloads) || 0) - (Number.parseFloat(a.downloads) || 0)
    })
    if (order === 'asc') list.reverse()
    return list
  }, [items, order, sort])

  const selected = sortedItems.find((item) => item.id === selectedId) ?? sortedItems[0] ?? null

  const handleRemove = async (item: ContentItem) => {
    if (!activeInstance || !item.installed) return
    setInstallingId(item.id)
    try {
      await tauri.removeInstanceItem(item.id, activeInstance.id, category, mcDir)
      invalidateContentCache()
      const list = await fetchInstalledItems(category, activeInstance.id, mcDir)
      setItems(list)
      setSelectedId(null)
      toast.pushToast(`${item.name} removed`, 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Unable to remove content.', 'error')
    } finally {
      setInstallingId(null)
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
      invalidateContentCache()
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

  return (
    <>
    <section className="content-main">
        <div className="content-main__header">
          <div>
            <h2 className="page-title" style={{ fontSize: 28 }}>
              {meta.label}
            </h2>
            <p className="page-subtitle">{meta.description}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Back to overview" onClick={onClose}>
            <X size={18} />
          </Button>
        </div>

        <div className="content-toolbar">
          <div className="segmented" role="tablist" aria-label="Library view">
            <button type="button" className={cn(tab === 'browse' && 'active')} onClick={() => setTab('browse')}>
              Browse
            </button>
            <button type="button" className={cn(tab === 'installed' && 'active')} onClick={() => setTab('installed')}>
              Installed
            </button>
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

          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh results"
            onClick={async () => {
              invalidateContentCache()
              if (tab === 'installed') {
                const list = await fetchInstalledItems(category, activeInstance?.id, mcDir)
                setItems(list)
              } else {
                const list = await fetchRemoteContent(category, query, mcVersion, loader, activeInstance?.id ?? null, activeInstance?.loader_version ?? null, mcDir)
                setItems(list)
              }
              toast.pushToast(`${meta.label} refreshed`, 'success')
            }}
          >
            <RefreshCw size={16} />
          </Button>
        </div>

        <SearchInput
          id={`search-${category}`}
          value={query}
          onChange={setQuery}
          placeholder={`Search ${meta.label.toLowerCase()}...`}
        />

        <div className="content-list" role="listbox" aria-label={meta.label}>
          {loadError ? (
            <EmptyState title={contentErrorTitle(loadError)} description={loadError} actionLabel="Retry" onAction={() => setReload((value) => value + 1)} />
          ) : !activeInstance ? (
            <EmptyState title="Select an install target" description="Choose an instance in the sidebar before browsing or installing content." />
          ) : loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <LoaderCircle size={24} className="spin" color="var(--primary)" />
            </div>
          ) : sortedItems.length === 0 ? (
            <EmptyState
              title={tab === 'installed' ? `No installed ${meta.label.toLowerCase()}` : 'No results'}
              description={tab === 'installed' ? 'No items installed in this instance folder.' : 'Try another search term.'}
              actionLabel={query ? 'Clear search' : undefined}
              onAction={() => setQuery('')}
            />
          ) : (
            sortedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={(selected?.id ?? null) === item.id}
                className={cn('content-item', selected?.id === item.id && 'active')}
                onClick={() => setSelectedId(item.id)}
              >
                <div
                  className="content-item__icon"
                  style={{ background: `linear-gradient(135deg, ${item.accent}66, ${item.accent}22)` }}
                >
                  {item.iconUrl ? <img src={item.iconUrl} alt="" loading="lazy" decoding="async" /> : item.iconLabel}
                </div>
                <div className="content-item__meta">
                  <strong>{item.name}</strong>
                  <span>{item.author}</span>
                </div>
                <div className="content-item__downloads">
                  <Download size={13} />
                  {item.downloads}
                </div>
              </button>
            ))
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
  const [category, setCategory] = useState<ContentCategory>('overview')
  const { instances, activeInstance, activeInstanceId, selectInstance, settings } = useLauncherData()

  const profileLabel = activeInstance ? formatInstanceHeading(activeInstance) : 'No instance selected'

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className={cn('content-shell', category !== 'overview' && 'with-detail')}>
        <ContentSidebar active={category} onSelect={setCategory} profileLabel={profileLabel} instances={instances} activeInstanceId={activeInstanceId} onInstanceChange={(id) => void selectInstance(id)} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'contents' }}
          >
            {category === 'overview' ? (
              <OverviewPanel
                onManage={(id) => setCategory(id)}
                onClose={() => navigate('/')}
                profileLabel={profileLabel}
              />
            ) : (
              <BrowsePanel
                category={category}
                onClose={() => setCategory('overview')}
                activeInstance={activeInstance}
                mcDir={settings?.mc_dir}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

