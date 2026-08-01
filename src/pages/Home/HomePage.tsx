import { motion } from 'framer-motion'
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  LoaderCircle,
  LogIn,
  PackageCheck,
  Play,
  RefreshCw,
  Sparkles,
  Wand2,
} from 'lucide-react'
import Button from '../../components/ui/Button'
import ProgressBar from '../../components/ui/ProgressBar'
import Skeleton from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../hooks/useToast'
import { useLauncherData, type LoaderKind } from '../../hooks/useLauncherData'
import * as tauri from '../../utils/tauri'

const loaderCards: Array<{
  id: LoaderKind
  title: string
  copy: string
  state: 'ready' | 'partial' | 'blocked'
}> = [
  { id: 'fabric', title: 'Fabric', copy: 'Auto-selects a compatible stable loader from Fabric Meta.', state: 'ready' },
  { id: 'vanilla', title: 'Vanilla', copy: 'Installs official Minecraft manifests, libraries, assets, and natives.', state: 'ready' },
  { id: 'forge', title: 'Forge', copy: 'Backend installer command is not available yet.', state: 'blocked' },
  { id: 'neoforge', title: 'NeoForge', copy: 'Backend installer command is not available yet.', state: 'blocked' },
  { id: 'quilt', title: 'Quilt', copy: 'Backend installer command is not available yet.', state: 'blocked' },
]

export default function HomePage() {
  const toast = useToast()
  const {
    settings,
    instances,
    versions,
    jvm,
    javaPath,
    loading,
    error,
    busy,
    activeInstanceId,
    refresh,
    install,
    detectJava,
  } = useLauncherData()

  const currentVersion = versions[0]?.id ?? settings?.version ?? '1.21.11'
  const selectedInstance = instances.find((item) => item.id === activeInstanceId)
  const isFirstRun = !loading && instances.length === 0
  const playDisabled = loading || Boolean(busy) || !settings

  async function launch() {
    toast.pushToast(`Starting ${activeInstanceId}...`, 'info')
    const result = await tauri.launchInstance(selectedInstance?.id ?? activeInstanceId)
    toast.pushToast(result === null ? 'Launch requires the desktop backend.' : 'Minecraft launch started.', result === null ? 'info' : 'success')
  }

  async function runInstall(loader: LoaderKind) {
    const result = await install(loader, currentVersion)
    toast.pushToast(result ? `Installed ${result}` : 'Installer did not complete.', result ? 'success' : 'error')
  }

  async function runJavaCheck() {
    const result = await detectJava()
    toast.pushToast(result ? 'Java runtime ready.' : 'Java check did not complete.', result ? 'success' : 'error')
  }

  return (
    <div className="page launcher-page">
      <motion.section
        className="launcher-hero"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="launcher-hero__copy">
          <p className="eyebrow">Aqua Client</p>
          <h1>{isFirstRun ? 'Build your first playable profile.' : selectedInstance?.id ?? settings?.version ?? 'Ready to play'}</h1>
          <p>
            {isFirstRun
              ? 'Aqua will install Minecraft, resolve Java, apply JVM recommendations, and keep profile files isolated.'
              : 'A fast, focused launcher surface for launching, installing loaders, and keeping your setup healthy.'}
          </p>
          <div className="launcher-hero__actions">
            <Button className="launcher-play" variant="aqua" size="lg" disabled={playDisabled} onClick={launch}>
              {busy ? <LoaderCircle size={24} className="spin" /> : <Play size={24} />}
              Play
            </Button>
            <Button variant="ghost" size="lg" disabled={busy === 'java'} onClick={runJavaCheck}>
              {busy === 'java' ? <LoaderCircle size={18} className="spin" /> : <Wand2 size={18} />}
              Auto setup
            </Button>
          </div>
        </div>

        <div className="launcher-hero__panel">
          {loading ? (
            <>
              <Skeleton style={{ height: 18, width: '58%' }} />
              <Skeleton style={{ height: 42, width: '100%', marginTop: 16 }} />
              <Skeleton style={{ height: 42, width: '78%', marginTop: 12 }} />
            </>
          ) : (
            <>
              <div className="setup-step complete">
                <CheckCircle2 size={18} />
                <div>
                  <strong>Minecraft {currentVersion}</strong>
                  <span>{versions.length} release versions available</span>
                </div>
              </div>
              <div className={`setup-step ${javaPath || settings?.java_path ? 'complete' : 'waiting'}`}>
                <Cpu size={18} />
                <div>
                  <strong>{javaPath || settings?.java_path ? 'Java detected' : 'Java will be installed if needed'}</strong>
                  <span>{javaPath ?? settings?.java_path ?? 'Temurin 21 fallback enabled'}</span>
                </div>
              </div>
              <div className="setup-step complete">
                <HardDrive size={18} />
                <div>
                  <strong>{jvm ? `${Math.round(jvm.recommended_ram_mb / 1024)} GB recommended` : `${settings?.ram_mb ?? 2048} MB allocated`}</strong>
                  <span>{jvm ? `${jvm.memory_mb} MB system memory, ${jvm.cores} CPU threads` : 'Using saved JVM settings'}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.section>

      {error ? (
        <div className="state-banner error">
          <AlertTriangle size={18} />
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>
            <RefreshCw size={14} />
            Retry
          </Button>
        </div>
      ) : null}

      <section className="launcher-grid">
        <div className="launcher-section">
          <div className="section-header">
            <div>
              <h2>Loader Installer</h2>
              <p className="small muted">Real backend support, no pretend installs.</p>
            </div>
            <span className="chip chip-aqua">{currentVersion}</span>
          </div>
          <div className="loader-grid">
            {loaderCards.map((loader) => {
              const installing = busy === `install-${loader.id}`
              return (
                <motion.button
                  key={loader.id}
                  type="button"
                  className={`loader-tile ${loader.state}`}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.985 }}
                  disabled={loader.state === 'blocked' || Boolean(busy)}
                  onClick={() => runInstall(loader.id)}
                >
                  <span className="loader-tile__icon">
                    {installing ? <LoaderCircle size={20} className="spin" /> : loader.state === 'ready' ? <Download size={20} /> : <PackageCheck size={20} />}
                  </span>
                  <strong>{loader.title}</strong>
                  <span>{loader.copy}</span>
                </motion.button>
              )
            })}
          </div>
        </div>

        <div className="launcher-section">
          <div className="section-header">
            <div>
              <h2>Instances</h2>
              <p className="small muted">Local profiles discovered from Aqua storage.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={refresh}>
              <RefreshCw size={14} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="instance-list">
              <Skeleton style={{ height: 72 }} />
              <Skeleton style={{ height: 72 }} />
              <Skeleton style={{ height: 72 }} />
            </div>
          ) : instances.length === 0 ? (
            <EmptyState
              title="No instances installed"
              description="Install Fabric or Vanilla above to create a playable profile."
            />
          ) : (
            <div className="instance-list">
              {instances.slice(0, 5).map((instance) => (
                <button key={instance.id} type="button" className="instance-row" onClick={() => tauri.launchInstance(instance.id)}>
                  <div>
                    <strong>{instance.id}</strong>
                    <span>
                      {instance.mod_count} mods · {instance.pack_count} packs · {instance.shader_count} shaders
                    </span>
                  </div>
                  <Play size={17} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {isFirstRun ? (
        <motion.section className="first-run" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Sparkles size={18} />
          <div>
            <strong>First-run setup</strong>
            <span>Run Auto setup, then install Fabric or Vanilla. Microsoft login is available from the account menu.</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => tauri.microsoftLogin()}>
            <LogIn size={14} />
            Sign in
          </Button>
        </motion.section>
      ) : null}

      <section className="launcher-health">
        <ProgressBar value={javaPath || settings?.java_path ? 100 : 48} label="Runtime readiness" showValue accent="aqua" />
        <ProgressBar value={instances.length > 0 ? 100 : 25} label="Profile readiness" showValue />
      </section>
    </div>
  )
}
