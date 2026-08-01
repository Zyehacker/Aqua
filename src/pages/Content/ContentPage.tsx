import { useMemo, useState } from 'react'
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
import { CURRENT_PROFILE } from '../../data/mock'
import { getInstalledCount, searchContent } from '../../services/contentService'
import { appActions, useAppStore } from '../../stores/appStore'
import type { ContentCategory, ContentItem, ContentPlatform } from '../../types'
import { cn } from '../../utils/cn'

const CATEGORY_META: Record<
  Exclude<ContentCategory, 'overview'>,
  { label: string; description: string; icon: typeof Box; color: string; soft: string }
> = {
  mods: {
    label: 'Mods',
    description: 'Gameplay, performance, and utility mods.',
    icon: Box,
    color: '#c084fc',
    soft: 'rgba(192,132,252,0.16)',
  },
  modpacks: {
    label: 'Modpacks',
    description: 'Complete, curated profile setups.',
    icon: Package,
    color: '#ff9f1a',
    soft: 'rgba(255,159,26,0.16)',
  },
  'resource-packs': {
    label: 'Resource Packs',
    description: 'Textures and visual style packs.',
    icon: ImageIcon,
    color: '#4ade80',
    soft: 'rgba(74,222,128,0.16)',
  },
  shaders: {
    label: 'Shaders',
    description: 'Lighting and atmosphere presets.',
    icon: Sparkles,
    color: '#38bdf8',
    soft: 'rgba(56,189,248,0.16)',
  },
  'data-packs': {
    label: 'Data Packs',
    description: 'World rules and gameplay tweaks.',
    icon: FileText,
    color: '#facc15',
    soft: 'rgba(250,204,21,0.16)',
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

function countInstalled(category: Exclude<ContentCategory, 'overview'>) {
  return getInstalledCount(category)
}

function ContentSidebar({
  active,
  onSelect,
}: {
  active: ContentCategory
  onSelect: (id: ContentCategory) => void
}) {
  return (
    <aside className="content-sidebar glass-strong" aria-label="Content Manager">
      <div className="content-sidebar__brand">
        <div className="content-sidebar__icon">
          <Layers size={20} />
        </div>
        <div>
          <h1>Content Manager</h1>
          <p>
            {CURRENT_PROFILE.version}-{CURRENT_PROFILE.loader.split(' ')[0]}
          </p>
        </div>
      </div>

      <div className="content-nav">
        <button
          type="button"
          className={cn('content-nav__item', active === 'overview' && 'active')}
          onClick={() => onSelect('overview')}
        >
          <Gauge size={18} />
          Overview
        </button>

        <div className="content-nav__label">Library</div>
        {NAV.filter((item) => item.id !== 'overview').map((item) => {
          const Icon = item.icon
          const count = countInstalled(item.id as Exclude<ContentCategory, 'overview'>)
          return (
            <button
              key={item.id}
              type="button"
              className={cn('content-nav__item', active === item.id && 'active')}
              onClick={() => onSelect(item.id)}
            >
              <Icon size={18} />
              {item.label}
              <span className="spacer" />
              {count > 0 ? <span className="count-badge">{count}</span> : null}
            </button>
          )
        })}
      </div>

      <div className="content-sidebar__footer">
        <strong>Minecraft {CURRENT_PROFILE.version}</strong>
        <p className="small muted" style={{ marginTop: 4 }}>
          {CURRENT_PROFILE.loader.split(' ')[0]} · Isolated Profile
        </p>
      </div>
    </aside>
  )
}

function OverviewPanel({
  onManage,
  onClose,
}: {
  onManage: (id: Exclude<ContentCategory, 'overview'>) => void
  onClose: () => void
}) {
  const toast = useToast()
  const totalInstalled = getInstalledCount()

  return (
    <section className="content-main glass">
      <div className="content-main__header">
        <div>
          <h2 className="page-title" style={{ fontSize: 28 }}>
            Overview
          </h2>
          <p className="page-subtitle">Everything installed for this profile, in one place.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close content manager" onClick={onClose}>
          <X size={18} />
        </Button>
      </div>

      <div className="overview-hero">
        <div className="overview-hero__top">
          <div>
            <p className="eyebrow">Profile library</p>
            <h2>{totalInstalled} items installed</h2>
            <p>
              Content stays isolated to this profile and is checked against Minecraft {CURRENT_PROFILE.version} before
              launch.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toast.pushToast('Library refreshed', 'success')}
          >
            <RefreshCw size={15} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="category-grid">
        {(Object.keys(CATEGORY_META) as Array<Exclude<ContentCategory, 'overview'>>).map((key) => {
          const meta = CATEGORY_META[key]
          const Icon = meta.icon
          const count = countInstalled(key)
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
                <div className="category-card__count">{count}</div>
              </div>
              <strong>{meta.label}</strong>
              <span>
                Manage <ChevronRight size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
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
}: {
  item: ContentItem | null
  onInstall: (item: ContentItem) => void
}) {
  const installingId = useAppStore((s) => s.installingId)
  const installProgress = useAppStore((s) => s.installProgress)

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

  const installing = installingId === item.id
  const done = installing && installProgress >= 100

  return (
    <aside className="content-detail glass">
      <div className="content-detail__head">
        <div className="content-detail__icon" style={{ background: `linear-gradient(135deg, ${item.accent}55, ${item.accent}22)` }}>
          {item.iconLabel}
        </div>
        <div>
          <h2>{item.name}</h2>
          <p>{item.author}</p>
        </div>
      </div>

      <p className="content-detail__desc">{item.description}</p>

      <div className="info-box">
        Aqua stages this {item.category.replace('-', ' ')} into an isolated profile folder and verifies loader
        compatibility before enabling it at launch.
      </div>

      <div className="tag-row">
        {item.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>

      <a className="ext-link" href="https://modrinth.com" target="_blank" rel="noreferrer">
        View on Modrinth
        <ExternalLink size={14} />
      </a>

      <div className="content-detail__footer">
        {installing ? (
          <ProgressBar
            value={installProgress}
            label={done ? 'Install complete' : 'Downloading pack files...'}
            showValue
          />
        ) : (
          <ProgressBar value={item.installed ? 100 : 0} label={item.installed ? 'Installed' : 'Ready to install'} showValue />
        )}
        <div style={{ marginTop: 14 }}>
          <Button
            block
            disabled={installing && !done}
            onClick={() => onInstall(item)}
          >
            {installing && !done ? <LoaderCircle size={16} className="spin" /> : <Download size={16} />}
            {item.installed || done ? 'Reinstall' : installing ? 'Install' : 'Install'}
          </Button>
        </div>
      </div>
    </aside>
  )
}

function BrowsePanel({
  category,
  onClose,
}: {
  category: Exclude<ContentCategory, 'overview'>
  onClose: () => void
}) {
  const toast = useToast()
  const meta = CATEGORY_META[category]
  const [tab, setTab] = useState<'browse' | 'installed'>('browse')
  const [platform, setPlatform] = useState<ContentPlatform>('modrinth')
  const [sort, setSort] = useState('downloads')
  const [order, setOrder] = useState('desc')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const items = useMemo(() => {
    let list = searchContent(category, query, tab === 'installed')
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name)
      return Number.parseFloat(b.downloads) - Number.parseFloat(a.downloads)
    })
    if (order === 'asc') list.reverse()
    return list
  }, [category, order, query, sort, tab])

  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null

  const installedCount = countInstalled(category)

  return (
    <>
      <section className="content-main glass">
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
              Installed {installedCount}
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
            <button
              type="button"
              className={cn(platform === 'curseforge' && 'active')}
              onClick={() => setPlatform('curseforge')}
            >
              CurseForge
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh results"
            onClick={() => toast.pushToast(`${meta.label} refreshed from ${platform}`, 'success')}
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
          {items.length === 0 ? (
            <EmptyState
              title={`No ${meta.label.toLowerCase()} found`}
              description="Try another search, switch platforms, or clear installed filters."
              actionLabel="Clear search"
              onAction={() => setQuery('')}
            />
          ) : (
            items.map((item) => (
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
                  {item.iconLabel}
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
        onInstall={(item) => {
          appActions.startInstall(item.id)
          toast.pushToast(`Installing ${item.name}`, 'info')
        }}
      />
    </>
  )
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [category, setCategory] = useState<ContentCategory>('overview')

  return (
    <div className="page" style={{ paddingBottom: 0 }}>
      <div className={cn('content-shell', category !== 'overview' && 'with-detail')}>
        <ContentSidebar active={category} onSelect={setCategory} />

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
              <OverviewPanel onManage={(id) => setCategory(id)} onClose={() => navigate('/')} />
            ) : (
              <BrowsePanel category={category} onClose={() => setCategory('overview')} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
