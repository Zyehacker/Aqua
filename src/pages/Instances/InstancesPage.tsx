import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Copy, FolderOpen, LoaderCircle, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import Button from '../../components/ui/Button'
import * as tauri from '../../utils/tauri'
import type { BackendInstance } from '../../utils/tauri'
import Card from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { formatInstanceDisplayName, formatInstanceHeading } from '../../utils/instanceDisplay'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { open, save } from '@tauri-apps/plugin-dialog'
import { useTranslation } from '../../useTranslation'

type LoaderOption = { version: string; stable?: boolean; recommended?: boolean }
type CreateForm = { name: string; mcVersion: string; loader: 'vanilla' | 'fabric' | 'forge'; loaderVersion: string }
type ProvisioningStep = { stage: string; state: 'pending' | 'active' | 'complete' | 'failed'; message: string }

const emptyForm: CreateForm = { name: '', mcVersion: '', loader: 'vanilla', loaderVersion: '' }

function instanceStatus(instance: BackendInstance) {
  const state = instance.install_state?.trim().toLowerCase() ?? ''
  if (state === 'installed' || state === 'ready') return 'Ready'
  if (state.includes('download')) return 'Downloading...'
  if (state.includes('install')) return 'Installing...'
  if (state.includes('validat')) return 'Validating...'
  if (state.includes('fail') || state.includes('error')) return 'Failed'
  return 'Not installed'
}

function statusClass(status: string) {
  if (status === 'Ready') return 'chip-success'
  if (status === 'Failed') return 'chip-danger'
  if (status === 'Not installed') return 'chip-muted'
  return 'chip-accent'
}

export default function InstancesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { settings, versions, javaRuntimes, loading: launcherLoading, error: launcherError, refresh: refreshLauncher, selectInstance, detectJava, busy: launcherBusy, activeInstanceId } = useLauncherData()
  const [instances, setInstances] = useState<BackendInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createBusy, setCreateBusy] = useState(false)
  const [loaderBusy, setLoaderBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [defaultMcDir, setDefaultMcDir] = useState<string | null>(null)
  const [loaderOptions, setLoaderOptions] = useState<LoaderOption[]>([])
  const [form, setForm] = useState<CreateForm>(emptyForm)
  const [editInstance, setEditInstance] = useState<BackendInstance | null>(null)
  const [editName, setEditName] = useState('')
  const [editMemory, setEditMemory] = useState('')
  const [editJavaArgs, setEditJavaArgs] = useState('')
  const [provisioningSteps, setProvisioningSteps] = useState<ProvisioningStep[]>([])
  const [instanceQuery, setInstanceQuery] = useState('')
  const creatingRef = useRef(false)

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
    setLoading(true)
    setError(null)
    try {
      setInstances((await tauri.listInstances(settings?.mc_dir)) ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load instances.')
    } finally {
      setLoading(false)
    }
  }, [settings])

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
    const request = form.loader === 'fabric'
      ? tauri.listFabricLoaders(form.mcVersion)
      : tauri.listForgeLoaders(form.mcVersion)
    request
      .then((result) => {
        if (!cancelled) {
          const options = result ?? []
          setLoaderOptions(options)
          setForm((current) => ({ ...current, loaderVersion: '' }))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaderOptions([])
          setCreateError(`Unable to load ${form.loader} versions.`)
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
    try {
      if (launcherLoading) {
        setCreateError('Loading real launcher data…')
        return
      }
      if (!versions.length) {
        setCreateError(launcherError ?? 'No Minecraft versions are available. Check your connection and try again.')
        await refreshLauncher()
        return
      }
      const nextDefaultDir = await tauri.getDefaultMcDir()
      setDefaultMcDir(nextDefaultDir)
      setForm((current) => {
        const mcVersion = current.mcVersion || versions[0]?.id || ''
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
  }, [launcherError, launcherLoading, refreshLauncher, versions])

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
      await refreshLauncher()
      await loadInstances()
      setEditInstance(null)
      toast.pushToast('Instance settings saved', 'success')
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Unable to save instance settings.', 'error')
    }
  }, [editInstance, editJavaArgs, editMemory, editName, loadInstances, refreshLauncher, settings, toast])

  const filteredInstances = useMemo(() => {
    const query = instanceQuery.trim().toLowerCase()
    if (!query) return instances
    return instances.filter((instance) => [instance.name, instance.mc_version, instance.loader].some((value) => value.toLowerCase().includes(query)))
  }, [instanceQuery, instances])
  
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
      const id = await tauri.createInstance(form.name.trim(), form.mcVersion, form.loader, form.loaderVersion || null, settings.mc_dir ?? defaultMcDir)
      if (!id) throw new Error('Instance creation did not return an instance ID.')
      await tauri.updateInstance(id, {
        memory_mb: settings.ram_mb,
        java_args: settings.jvm_args,
      }, settings.mc_dir ?? defaultMcDir)
      await selectInstance(id)
      await refreshLauncher()
      toast.pushToast('Instance created', 'success')
      setCreateOpen(false)
      setForm(emptyForm)
      await loadInstances()
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

      {loading ? (
        <div className="grid-2" aria-busy="true">
          <div className="skeleton" style={{ height: 190 }} />
          <div className="skeleton" style={{ height: 190 }} />
        </div>
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
        ) : <div className="grid-2">
          {filteredInstances.map((instance, index) => {
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: index * 0.04 }}
            >
              <div className="instance-card__top">
                <div>
                  <strong className="instance-card__name">{heading}</strong>
                  <p className="instance-card__meta">{subtitle}</p>
                </div>
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
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openEdit(instance)}
                >
                  <Pencil size={14} />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openFolder(instance.id, heading)}
                >
                  <FolderOpen size={14} />
                  Folder
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => duplicateInst(instance.id, heading, instance.name)}
                >
                  <Copy size={14} />
                  Duplicate
                </Button>
                {status === 'Failed' || status === 'Not installed' ? (
                  <Button size="sm" variant="ghost" onClick={() => void repairInst(instance.id, heading)}>
                    Repair
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteInst(instance.id, heading)}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </motion.article>
            )
          })}
        </div>}
        </>
      )}

      {createOpen ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => !createBusy && setCreateOpen(false)}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="create-instance-title" onMouseDown={(event) => event.stopPropagation()}>
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
                  <select value={form.mcVersion} onChange={(event) => setForm((current) => ({ ...current, mcVersion: event.target.value, loaderVersion: '' }))} disabled={createBusy || !versions.length}>
                    <option value="">{createBusy ? 'Loading...' : 'Select version'}</option>
                    {versions.map((version) => <option key={version.id} value={version.id}>{version.id}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span>Loader</span>
                  <select value={form.loader} onChange={(event) => setForm((current) => ({ ...current, loader: event.target.value as CreateForm['loader'], loaderVersion: '' }))} disabled={createBusy}>
                    <option value="vanilla">Vanilla</option>
                    <option value="fabric">Fabric</option>
                    <option value="forge">Forge</option>
                  </select>
                </label>
                <label className="field field-wide">
                  <span>Loader version</span>
                  <select value={form.loaderVersion} onChange={(event) => setForm((current) => ({ ...current, loaderVersion: event.target.value }))} disabled={createBusy || form.loader === 'vanilla' || loaderBusy || !loaderOptions.length}>
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
                  {createBusy ? t('instances.creating') : t('common.createInstance')}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {editInstance ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setEditInstance(null)}>
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-instance-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="dialog__header">
              <div><p className="eyebrow">{t('common.instanceSettings')}</p><h2 id="edit-instance-title">{t('common.edit')} {editInstance.name}</h2></div>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setEditInstance(null)}><X size={16} /></Button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="form-grid">
                <label className="field field-wide"><span>Name</span><input value={editName} onChange={(event) => setEditName(event.target.value)} /></label>
                <label className="field"><span>Memory (MB)</span><input type="number" min="512" step="512" value={editMemory} onChange={(event) => setEditMemory(event.target.value)} /></label>
                <label className="field"><span>Java runtime</span><input value={editInstance.java_path ?? settings?.java_path ?? 'Auto-resolved'} readOnly /></label>
                <label className="field field-wide"><span>Game directory</span><input value={editInstance.game_dir ?? 'Default instance folder'} readOnly /></label>
                <label className="field field-wide"><span>Java arguments</span><textarea rows={4} value={editJavaArgs} onChange={(event) => setEditJavaArgs(event.target.value)} /></label>
              </div>
              <div className="dialog__actions"><Button variant="ghost" type="button" onClick={() => setEditInstance(null)}>{t('common.cancel')}</Button><Button variant="aqua" type="submit">{t('common.saveChanges')}</Button></div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  )
}
