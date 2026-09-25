import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Copy, FolderOpen, LoaderCircle, MoreHorizontal, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import * as tauri from '../../utils/tauri'
import type { BackendInstance } from '../../utils/tauri'
import Card from '../../components/ui/Card'
import InstanceIcon from '../../components/ui/InstanceIcon'
import { EmptyState } from '../../components/ui/EmptyState'
import LoadingIndicator from '../../components/ui/LoadingIndicator'
import { useToast } from '../../hooks/useToast'
import { formatInstanceDisplayName, formatInstanceHeading } from '../../utils/instanceDisplay'
import { instanceStatus, statusClass } from '../../utils/instanceStatus'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from '../../useTranslation'
import { Link } from 'react-router-dom'
import { MOTION } from '../../lib/motion'
import { AnimatedList, AnimatedModal } from '../../components/motion'

type LoaderOption = { version: string; stable?: boolean; recommended?: boolean }
type CreateForm = { name: string; mcVersion: string; loader: 'vanilla' | 'fabric' | 'forge'; loaderVersion: string }
type ProvisioningStep = { stage: string; state: 'pending' | 'active' | 'complete' | 'failed'; message: string }

const emptyForm: CreateForm = { name: '', mcVersion: '', loader: 'vanilla', loaderVersion: '' }
const CREATE_TIMEOUT_MS = 3 * 60 * 1000
const LOADER_TIMEOUT_MS = 30 * 1000

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeoutId: number | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  })
}

export default function InstancesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { settings, instances, versions, javaRuntimes, loading: launcherLoading, refresh: refreshLauncher, selectInstance, detectJava, busy: launcherBusy, activeInstanceId } = useLauncherData()
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [loaderBusy, setLoaderBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [defaultMcDir, setDefaultMcDir] = useState<string | null>(null)
  const [loaderOptions, setLoaderOptions] = useState<LoaderOption[]>([])
  const [createVersions, setCreateVersions] = useState<typeof versions>([])
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [editInstance, setEditInstance] = useState<BackendInstance | null>(null)
  const [editName, setEditName] = useState('')
  const [editIconPath, setEditIconPath] = useState<string | null>(null)
  const [editMemory, setEditMemory] = useState('')
  const [editJavaArgs, setEditJavaArgs] = useState('')
  const [provisioningSteps, setProvisioningSteps] = useState<ProvisioningStep[]>([])
  const [instanceQuery, setInstanceQuery] = useState('')
  const [instanceFilter, setInstanceFilter] = useState('')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const creatingRef = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setInstanceFilter(instanceQuery), 180)
    return () => window.clearTimeout(timer)
  }, [instanceQuery])

  useEffect(() => {
    if (!createOpen) return
    let disposed = false
    let unlisten: (() => void) | null = null
    void tauri.listen<ProvisioningStep & { instance_id: string }>('instance-provisioning', (payload) => {
      if (disposed) return
      setProvisioningSteps((current) => {
        const next = current.filter((step) => step.stage !== payload.stage)
        next.push({ stage: payload.stage, state: payload.state, message: payload.message })
        return next
      })
    }).then((stop) => {
      if (disposed) stop?.()
      else unlisten = stop
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [createOpen])

  const exportSelected = useCallback(async () => {
    const selected = instances.find((instance) => instance.id === activeInstanceId)
    if (!selected) return
    try {
      const destination = await save({
        defaultPath: `${selected.name.replace(/[^a-z0-9._-]+/gi, '-')}.aquainst`,
        filters: [{ name: 'Aqua Instance', extensions: ['aquainst'] }],
      })
      if (!destination) return
      await tauri.exportInstance(selected.id, destination, settings?.mc_dir)
      toast.pushToast('Instance exported', 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Export failed.', 'error')
    }
  }, [activeInstanceId, instances, settings, toast])

  const loadInstances = useCallback(async () => {
    setError(null)
    try {
      await refreshLauncher()
      setHasLoadedOnce(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load instances.')
    }
  }, [refreshLauncher])

  const importPackage = useCallback(async () => {
    try {
      const packagePath = await open({ filters: [{ name: 'Aqua Instance', extensions: ['aquainst'] }], multiple: false, directory: false })
      if (!packagePath || Array.isArray(packagePath)) return
      await tauri.importInstance(packagePath, settings?.mc_dir)
      await refreshLauncher()
      await loadInstances()
      toast.pushToast('Instance imported', 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Import failed.', 'error')
    }
  }, [loadInstances, refreshLauncher, settings, toast])

  useEffect(() => {
    const id = window.setTimeout(() => { void loadInstances() }, 0)
    return () => window.clearTimeout(id)
  }, [loadInstances])

  useEffect(() => {
    if (!createOpen || !form.mcVersion || form.loader === 'vanilla') {
      const id = window.setTimeout(() => {
        setLoaderOptions([])
        setLoaderBusy(false)
      }, 0)
      return () => window.clearTimeout(id)
    }
    let cancelled = false
    const busyId = window.setTimeout(() => setLoaderBusy(true), 0)
    const request: Promise<LoaderOption[] | null> = form.loader === 'fabric'
      ? tauri.listFabricLoaders(form.mcVersion).then((options) => options?.map((option) => ({ version: option.version, stable: option.stable })) ?? null)
      : tauri.listForgeLoaders(form.mcVersion).then((options) => options?.map((option) => ({ version: option.version, recommended: option.recommended })) ?? null)
    withTimeout(request, LOADER_TIMEOUT_MS, `Unable to load ${form.loader} versions before the request timed out.`)
      .then((result) => {
        if (!cancelled) {
          const options = result ?? []
          setLoaderOptions(options)
          setForm((current) => ({ ...current, loaderVersion: '' }))
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoaderOptions([])
          setCreateError(error instanceof Error ? error.message : `Unable to load ${form.loader} versions.`)
        }
      })
      .finally(() => {
        if (!cancelled) setLoaderBusy(false)
      })
    return () => {
      cancelled = true
      window.clearTimeout(busyId)
    }
  }, [createOpen, form.loader, form.mcVersion])

  const openCreate = useCallback(async () => {
    setCreateOpen(true)
    setCreateBusy(true)
    setCreateError(null)
    setProvisioningSteps([])
    setCreateVersions(versions)
    try {
      if (launcherLoading) setCreateError('Minecraft versions are still loading. You can keep this dialog open while they arrive.')
      let availableVersions = versions
      if (!availableVersions.length) {
        const fetched = await tauri.listRemoteVersions(settings?.show_snapshots ?? false)
        if (fetched?.length) {
          availableVersions = fetched
          setCreateVersions(fetched)
        }
        else await refreshLauncher()
      }
      const nextDefaultDir = await tauri.getDefaultMcDir()
      setDefaultMcDir(nextDefaultDir)
      setForm((current) => {
        const mcVersion = current.mcVersion || availableVersions[0]?.id || ''
        return {
          ...current,
          mcVersion,
          name: current.name || (mcVersion ? `Minecraft ${mcVersion}` : ''),
        }
      })
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Unable to load instance options.')
    } finally {
      setCreateBusy(false)
    }
  }, [launcherLoading, refreshLauncher, settings, versions])

  const launch = useCallback(async (id: string, name: string) => {
    toast.pushToast(`Starting ${name}…`, 'info')
    try {
      await tauri.launchInstance(id)
      toast.pushToast(`Launch started for ${name}`, 'success')
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : `Unable to launch ${name}.`, 'error')
    }
  }, [toast])

  const deleteInst = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete “${name}”? This removes the instance files and cannot be undone.`)) return
    try {
      await tauri.deleteInstance(id, settings?.mc_dir)
      toast.pushToast(`Deleted ${name}`, 'success')
      if (activeInstanceId === id) await selectInstance(null)
      await refreshLauncher()
      await loadInstances()
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : `Unable to delete ${name}.`, 'error')
    }
  }, [activeInstanceId, loadInstances, refreshLauncher, selectInstance, settings, toast])

  const duplicateInst = useCallback(async (id: string, displayLabel: string, copyName: string) => {
    try {
      await tauri.duplicateInstance(id, `${copyName} (Copy)`, settings?.mc_dir)
      toast.pushToast(`Duplicated ${displayLabel}`, 'success')
      await loadInstances()
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : `Unable to duplicate ${displayLabel}.`, 'error')
    }
  }, [loadInstances, settings, toast])

  const repairInst = useCallback(async (id: string, name: string) => {
    try {
      await tauri.repairInstance(id, settings?.mc_dir)
      await refreshLauncher()
      await loadInstances()
      toast.pushToast(`Repaired ${name} metadata`, 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : `Unable to repair ${name}.`, 'error')
    }
  }, [loadInstances, refreshLauncher, settings, toast])

  const openEdit = useCallback((instance: BackendInstance) => {
    setEditInstance(instance)
    setEditName(instance.name)
    setEditIconPath(null)
    setEditMemory(String(instance.memory_mb ?? settings?.ram_mb ?? 2048))
    setEditJavaArgs(instance.java_args ?? settings?.jvm_args ?? '')
  }, [settings])

  const saveEdit = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editInstance || !editName.trim()) return
    try {
      await tauri.updateInstance(editInstance.id, {
        name: editName.trim(),
        memory_mb: Math.max(512, Number(editMemory) || 2048),
        java_args: editJavaArgs,
      }, settings?.mc_dir)
      if (editIconPath) await tauri.saveInstanceIcon(editInstance.id, editIconPath, settings?.mc_dir)
      await refreshLauncher()
      await loadInstances()
      setEditInstance(null)
      toast.pushToast('Instance settings saved', 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Unable to save instance settings.', 'error')
    }
  }, [editIconPath, editInstance, editJavaArgs, editMemory, editName, loadInstances, refreshLauncher, settings, toast])

  const filteredInstances = useMemo(() => {
    const query = instanceFilter.trim().toLowerCase()
    if (!query) return instances
    return instances.filter((instance) => [instance.name, instance.mc_version, instance.loader].some((value) => value.toLowerCase().includes(query)))
  }, [instanceFilter, instances])
  
  const createInst = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (creatingRef.current) return
    if (!form.name.trim()) {
      setCreateError('Enter an instance name.')
      return
    }
    if (!form.mcVersion) {
      setCreateError('Select a Minecraft version.')
      return
    }
    if (!settings) {
      setCreateError('Launcher settings are still loading.')
      return
    }
    creatingRef.current = true
    setCreateBusy(true)
    setCreateError(null)
    try {
      const mcDir = settings.mc_dir ?? defaultMcDir
      const id = await withTimeout(
        tauri.createInstance(form.name.trim(), form.mcVersion, form.loader, form.loaderVersion || null, mcDir),
        CREATE_TIMEOUT_MS,
        'Instance creation timed out while provisioning files. Check the launcher logs and retry.',
      )
      if (!id) throw new Error('Instance creation did not return an instance ID.')
      await tauri.updateInstance(id, {
        memory_mb: settings.ram_mb,
        java_args: settings.jvm_args,
      }, mcDir)
      await refreshLauncher()
      const created = await tauri.getInstance(id, mcDir)
      if (!created || created.id !== id || created.mc_version !== form.mcVersion || created.loader !== form.loader) {
        throw new Error('Instance provisioning completed, but the new instance could not be read back from storage.')
      }
      await selectInstance(id)
      await loadInstances()
      toast.pushToast('Instance created', 'success')
      setCreateOpen(false)
      setForm(emptyForm)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Unable to create instance.')
    } finally {
      creatingRef.current = false
      setCreateBusy(false)
    }
  }, [defaultMcDir, form, loadInstances, refreshLauncher, selectInstance, settings, toast])

  const setupJava = useCallback(async () => {
    const path = await detectJava()
    if (path) {
      toast.pushToast('Java runtime ready', 'success')
      setCreateError(null)
    } else {
      toast.pushToast('Java runtime could not be resolved.', 'error')
    }
  }, [detectJava, toast])

  const openFolder = useCallback(async (id: string, name: string) => {
    try {
      await tauri.openInstanceFolder(id, settings?.mc_dir)
      toast.pushToast(`Opened folder for ${name}`, 'info')
    } catch (e) {
      toast.pushToast(e instanceof Error ? e.message : `Unable to open folder for ${name}.`, 'error')
    }
  }, [settings, toast])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">{t('nav.instances')}</p>
          <h1 className="page-title">{t('nav.instances')}</h1>
          <p className="page-subtitle">Launch and manage Minecraft installations.</p>
        </div>
        <div className="page-header__actions">
          <Button variant="ghost" onClick={() => void importPackage()}>{t('common.import')} .aquainst</Button>
          {activeInstanceId ? <Button variant="ghost" onClick={() => void exportSelected()}>{t('common.export')}</Button> : null}
          <Button onClick={() => void openCreate()}><Plus size={16} />{t('common.createInstance')}</Button>
        </div>
      </div>

      {error ? (
        <div className="state-banner error" role="alert">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadInstances()}>{t('common.retry')}</Button>
        </div>
      ) : null}

      {!hasLoadedOnce && launcherLoading ? (
        <Card>
          <LoadingIndicator label={t('common.loading')} detail="Loading your instances…" />
        </Card>
      ) : instances.length === 0 ? (
        <Card>
          <EmptyState
            title="No instances"
            description="Create an instance to start playing."
            actionLabel="Create instance"
            onAction={() => void openCreate()}
          />
        </Card>
      ) : (
        <>
        <div className="content-toolbar" style={{ marginBottom: 18 }}>
          <input aria-label="Search instances" placeholder="Search by name, Minecraft version, or loader" value={instanceQuery} onChange={(event) => setInstanceQuery(event.target.value)} />
        </div>
        {filteredInstances.length === 0 ? (
          <Card><EmptyState title="No matching instances" description="Try a different name, Minecraft version, or loader." /></Card>
        ) : <AnimatedList className="grid-2"><AnimatePresence initial={false} mode="popLayout">
          {filteredInstances.map((instance) => {
            const displayName = formatInstanceDisplayName(instance)
            const heading = formatInstanceHeading(instance)
            const status = instanceStatus(instance)
            const subtitle = heading === displayName
              ? `${instance.mod_count} mods`
              : `${displayName} · ${instance.mod_count} mods`

            return (
            <motion.article
              key={instance.id}
              className="instance-card"
              aria-current={activeInstanceId === instance.id ? 'true' : undefined}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={MOTION.list}
            >
              <div className="instance-card__top">
                <div className="instance-card__identity"><InstanceIcon instance={instance} size={20} /><div>
                  <strong className="instance-card__name">{heading}</strong>
                  <p className="instance-card__meta">{subtitle}</p>
                </div></div>
                <span className={`chip ${statusClass(status)}`}>{status}</span>
              </div>

              <div className="instance-card__details">
                <div><span>Minecraft</span><strong>{instance.mc_version || 'Unavailable'}</strong></div>
                <div><span>Loader</span><strong>{instance.loader === 'vanilla' ? 'Vanilla' : instance.loader || 'Unavailable'}</strong></div>
                <div><span>Mods</span><strong>{instance.mod_count}</strong></div>
              </div>

              <p className="small muted instance-card__last-played">
                Last played {instance.last_played_at ? new Date(instance.last_played_at * 1000).toLocaleString() : 'Never'}
              </p>

              <div className="instance-card__actions">
                <Button
                  size="sm"
                  variant="aqua"
                  onClick={() => { void selectInstance(instance.id); void launch(instance.id, heading) }}
                >
                  <Play size={14} />
                  Launch
                </Button>
                <Link to="/content?tab=installed" className="btn btn-ghost btn-sm" onClick={() => void selectInstance(instance.id)}>Manage content</Link>
                <div className="instance-card__menu-wrap">
                  <Button size="sm" variant="ghost" aria-label={`More actions for ${heading}`} onClick={() => setOpenMenu((current) => current === instance.id ? null : instance.id)}><MoreHorizontal size={15} /></Button>
                  {openMenu === instance.id ? <div className="instance-card__menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); openEdit(instance) }}><Pencil size={13} />Edit instance</button>
                    <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); void openFolder(instance.id, heading) }}><FolderOpen size={13} />Open folder</button>
                    <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); void duplicateInst(instance.id, heading, instance.name) }}><Copy size={13} />Duplicate</button>
                    {status === 'Failed' || status === 'Not installed' ? <button type="button" role="menuitem" onClick={() => { setOpenMenu(null); void repairInst(instance.id, heading) }}><LoaderCircle size={13} />Repair</button> : null}
                    <button type="button" role="menuitem" className="danger" onClick={() => { setOpenMenu(null); void deleteInst(instance.id, heading) }}><Trash2 size={13} />Delete</button>
                  </div> : null}
                </div>
              </div>
            </motion.article>
            )
          })}
        </AnimatePresence></AnimatedList>}
        </>
      )}

      <AnimatedModal open={createOpen} onClose={() => { if (!createBusy) setCreateOpen(false) }}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-instance-title">
            <div className="dialog__header">
              <div>
                <p className="eyebrow">{t('nav.instances')}</p>
                <h2 id="create-instance-title">{t('common.createInstance')}</h2>
              </div>
              <Button variant="ghost" size="icon" aria-label="Close" disabled={createBusy} onClick={() => setCreateOpen(false)}>
                <X size={16} />
              </Button>
            </div>

            <form onSubmit={createInst}>
              <div className="form-grid">
                <label className="field field-wide">
                  <span>Name</span>
                  <input autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Instance name" />
                </label>
                <label className="field">
                  <span>Minecraft version</span>
                  <select value={form.mcVersion} onChange={(event) => setForm((current) => ({ ...current, mcVersion: event.target.value, loaderVersion: '' }))} disabled={!createVersions.length}>
                    <option value="">{launcherLoading && !createVersions.length ? 'Loading versions…' : 'Select version'}</option>
                    {createVersions.map((version) => <option key={version.id} value={version.id}>{version.id}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Loader</span>
                  <select value={form.loader} onChange={(event) => setForm((current) => ({ ...current, loader: event.target.value as CreateForm['loader'], loaderVersion: '' }))} disabled={false}>
                    <option value="vanilla">Vanilla</option>
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                  </select>
                </label>
                <label className="field field-wide">
                  <span>Loader version</span>
                  <select value={form.loaderVersion} onChange={(event) => setForm((current) => ({ ...current, loaderVersion: event.target.value }))} disabled={form.loader === 'vanilla' || loaderBusy || !loaderOptions.length}>
                    {!loaderOptions.length ? <option value="">{form.loader === 'vanilla' ? 'Not applicable' : loaderBusy ? 'Loading...' : 'Unavailable'}</option> : null}
                    {form.loader !== 'vanilla' && loaderOptions.length ? <option value="">Automatic</option> : null}
                    {loaderOptions.map((option) => <option key={option.version} value={option.version}>{option.version}</option>)}
                  </select>
                </label>
              </div>

              <div className="create-instance-summary">
                <div><span>Java</span><strong title={settings?.java_path ?? settings?.java_runtime ?? javaRuntimes[0]?.path ?? 'Not detected'}>{settings?.java_path ?? settings?.java_runtime ?? javaRuntimes[0]?.path ?? 'Not detected'}</strong></div>
                <div><span>Memory</span><strong>{settings?.ram_mb ? `${settings.ram_mb} MB` : 'Not configured'}</strong></div>
                <div className="summary-wide"><span>Game directory</span><strong title={settings?.mc_dir ?? defaultMcDir ?? 'Not configured'}>{settings?.mc_dir ?? defaultMcDir ?? 'Not configured'}</strong></div>
              </div>

              {provisioningSteps.length ? (
                <div className="state-banner" role="status" aria-live="polite">
                  <div>
                    <strong>Provisioning instance</strong>
                    {provisioningSteps.map((step) => (
                      <div key={step.stage} className="small muted">
                        {step.state === 'complete' ? '✓' : step.state === 'failed' ? '!' : '↓'} {step.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {createError ? <p className="form-error" role="alert">Instance creation failed: {createError}</p> : null}

              {!settings?.java_path && !settings?.java_runtime ? (
                <div className="state-banner" role="status">
                  <span>{javaRuntimes.length ? 'A Java runtime was found but is not configured.' : 'No compatible Java runtime has been resolved yet.'}</span>
                  <Button type="button" variant="ghost" size="sm" disabled={launcherBusy === 'java'} onClick={() => void setupJava()}>
                    {launcherBusy === 'java' ? 'Resolving Java...' : 'Set up Java'}
                  </Button>
                </div>
              ) : null}

              <div className="dialog__actions">
                <Button type="button" variant="ghost" disabled={createBusy} onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
                <Button type="submit" variant="aqua" disabled={createBusy || loaderBusy || !form.name.trim() || !form.mcVersion || (!settings?.java_path && !settings?.java_runtime)}>
                  {createBusy ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
                  {createBusy ? (provisioningSteps.at(-1)?.message ?? t('instances.creating')) : t('common.createInstance')}
                </Button>
              </div>
            </form>
          </section>
      </AnimatedModal>

      <AnimatedModal open={Boolean(editInstance)} onClose={() => setEditInstance(null)}>
          {editInstance ? <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-instance-title">
            <div className="dialog__header">
              <div><p className="eyebrow">INSTANCE SETTINGS</p><h2 id="edit-instance-title">{t('common.edit')} {editInstance.name}</h2></div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditInstance(null)}><X size={16} /></Button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="instance-editor">
                <fieldset className="instance-editor__group"><legend>Identity</legend><div className="form-grid">
                  <label className="field field-wide"><span>Name</span><input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
                  <div className="field field-wide"><span>Instance icon</span><div className="instance-icon-picker"><img src={editInstance.icon_data || '/favicon.png'} alt="Current instance icon" /><div><strong>{editIconPath ? 'PNG selected' : editInstance.icon_data ? 'Custom PNG' : 'Aqua default PNG'}</strong><small>Local PNG only. Stored in this instance.</small></div><Button type="button" variant="ghost" size="sm" onClick={async () => { const path = await open({ filters: [{ name: 'PNG image', extensions: ['png'] }], multiple: false, directory: false }); if (typeof path === 'string') setEditIconPath(path) }}>Choose PNG</Button></div></div>
                </div></fieldset>
                <fieldset className="instance-editor__group"><legend>Runtime</legend><div className="form-grid">
                  <label className="field field-wide"><span>Java runtime</span><input className="path-input" value={editInstance.java_path ?? settings?.java_path ?? 'Auto-resolved'} readOnly title={editInstance.java_path ?? settings?.java_path ?? 'Auto-resolved'} /></label>
                  <label className="field field-wide"><span>Game directory</span><input value={editInstance.game_dir ?? 'Default instance folder'} readOnly title={editInstance.game_dir ?? 'Default instance folder'} /></label>
                </div></fieldset>
                <fieldset className="instance-editor__group"><legend>Memory</legend><div className="form-grid">
                  <label className="field"><span>Memory (MB)</span><input type="number" min="512" step="512" value={editMemory} onChange={(event) => setEditMemory(event.target.value)} /></label>
                </div></fieldset>
                <details className="instance-editor__advanced"><summary>Advanced / JVM arguments</summary><label className="field"><span>Java arguments</span><textarea className="code-input" rows={5} spellCheck={false} value={editJavaArgs} onChange={(event) => setEditJavaArgs(event.target.value)} placeholder="-XX:+UseG1GC&#10;-XX:+UnlockExperimentalVMOptions" /></label></details>
              </div>
              <div className="dialog__actions"><Button variant="ghost" type="button" onClick={() => setEditInstance(null)}>{t('common.cancel')}</Button><Button variant="aqua" type="submit">{t('common.saveChanges')}</Button></div>
            </form>
          </section> : null}
      </AnimatedModal>
    </div>
  )
}


