import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import Toggle from '../../components/ui/Toggle'
import { useToast } from '../../hooks/useToast'
import { appActions, useAppStore } from '../../stores/appStore'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import * as tauri from '../../utils/tauri'
import { useTranslation } from '../../useTranslation'
import { SUPPORTED_LOCALES } from '../../locales/supportedLocales'

const ACCENT_PRESETS = [
  { id: 'aqua', label: 'Aqua', value: '#58dfd1' },
  { id: 'cyan', label: 'Cyan', value: '#7dd3fc' },
  { id: 'mint', label: 'Mint', value: '#81f7d3' },
  { id: 'lavender', label: 'Lavender', value: '#b8a9ff' },
  { id: 'amber', label: 'Amber', value: '#f8c76a' },
] as const

export default function SettingsPage() {
  const { t, language, setLanguage } = useTranslation()
  const toast = useToast()
  const theme = useAppStore((s) => s.theme)
  const accent = useAppStore((s) => s.accent)
  const accentColor = useAppStore((s) => s.accentColor)
  const reduceMotion = useAppStore((s) => s.reduceMotion)
  const uiSounds = useAppStore((s) => s.uiSounds)
  const uiSoundVolume = useAppStore((s) => s.uiSoundVolume)
  const backgroundMode = useAppStore((s) => s.backgroundMode)
  const layoutDensity = useAppStore((s) => s.layoutDensity)
  const layoutMode = useAppStore((s) => s.layoutMode)
  const { settings, jvm, javaRuntimes, busy, updateSettings, detectJava } = useLauncherData()

  const recommendedRam = jvm?.recommended_ram_mb ?? 2048
  const maxRam = Math.max(settings?.ram_mb ?? 0, recommendedRam, Math.floor((jvm?.memory_mb ?? 4096) * 0.75 / 512) * 512)
  const [ram, setRam] = useState(settings?.ram_mb ?? recommendedRam)
  const [showSnapshots, setShowSnapshots] = useState(settings?.show_snapshots ?? false)
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(settings?.minimize_on_launch ?? true)
  const [quickStartup, setQuickStartup] = useState(settings?.quick_startup ?? true)
  const [hardware, setHardware] = useState<tauri.HardwareInfo | null>(null)

  useEffect(() => {
    if (settings) {
      const id = window.setTimeout(() => {
        setRam(settings.ram_mb || recommendedRam)
        setShowSnapshots(settings.show_snapshots)
        setMinimizeOnLaunch(settings.minimize_on_launch)
        setQuickStartup(settings.quick_startup)
      }, 0)
      return () => window.clearTimeout(id)
    }
    return undefined
  }, [recommendedRam, settings])

  const saveSettings = useCallback(async (partial: Partial<tauri.LauncherSettings>) => {
    try {
      await updateSettings(partial)
    } catch (err) {
      toast.pushToast(err instanceof Error ? err.message : 'Save failed.', 'error')
    } finally { /* settings state is updated by the shared launcher store */ }
  }, [toast, updateSettings])

  const javaLabel = settings?.java_path ?? settings?.java_runtime ?? javaRuntimes[0]?.path ?? 'Not detected'
  const mcDirLabel = settings?.mc_dir ?? 'Default'

  return (
    <div className="page settings-page">
      <div className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
      </div>

      <div className="settings-sections">
        {/* General */}
        <section className="settings-section">
          <h2 className="settings-section__title">{t('settings.general')}</h2>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row__label"><strong>Confirm before launching</strong><span>Ask before starting Minecraft from the Home page</span></div>
              <Toggle checked={settings?.confirm_before_launch ?? false} onChange={(value) => void saveSettings({ confirm_before_launch: value })} label="Confirm before launching" />
            </div>
            <div className="settings-row">
              <div className="settings-row__label"><strong>UI sounds</strong><span>Play restrained sounds for important actions and notifications</span></div>
              <div className="settings-row__control"><Toggle checked={uiSounds} label="UI sounds" onChange={(value) => appActions.setUiSounds(value)} /><input type="range" min="0" max="1" step="0.05" value={uiSoundVolume} disabled={!uiSounds} aria-label="UI sound volume" onChange={(event) => appActions.setUiSoundVolume(Number(event.target.value))} /></div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Performance profile</strong>
                <span>{hardware ? `${hardware.classification === 'low' ? 'Low-end' : hardware.classification === 'mid' ? 'Mid-range' : 'High-end'} hardware · ${hardware.explanation}` : 'Choose a preset for your hardware'}</span>
              </div>
              <div className="settings-row__control">
                <select
                  value={settings?.performance_profile ?? 'balanced'}
                  aria-label="Performance profile"
                  onChange={(event) => void saveSettings({ performance_profile: event.target.value })}
                >
                  <option value="maximum">Maximum FPS</option>
                  <option value="balanced">Balanced</option>
                  <option value="quality">Quality</option>
                </select>
                <button type="button" className="settings-btn" onClick={() => void tauri.detectHardware().then(setHardware)}>
                  Analyze hardware
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>{t('settings.language')}</strong>
                <span>{t('settings.languageDescription')}</span>
              </div>
              <select
                value={language}
                aria-label={t('settings.language')}
                onChange={(event) => void setLanguage(event.target.value)}
              >
                {SUPPORTED_LOCALES.map((locale) => <option key={locale.id} value={locale.id}>{locale.nativeName}</option>)}
              </select>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>{t('settings.theme')}</strong>
              </div>
              <div className="settings-row__control">
                <div className="segmented" role="group" aria-label="Theme">
                  <button type="button" className={theme === 'dark' ? 'active' : undefined} onClick={() => appActions.setTheme('dark')}>{t('settings.dark')}</button>
                  <button type="button" className={theme === 'dim' ? 'active' : undefined} onClick={() => appActions.setTheme('dim')}>{t('settings.dim')}</button>
                </div>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>{t('settings.accent')}</strong>
                <span>{t('settings.accentDescription')}</span>
              </div>
              <div className="settings-row__control settings-row__control--wide" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                {ACCENT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={`Use ${preset.label} accent`}
                    onClick={() => appActions.setAccent(preset.id)}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: accent === preset.id ? '2px solid rgba(255,255,255,0.8)' : '1px solid rgba(255,255,255,0.15)',
                      background: preset.value,
                      boxShadow: accent === preset.id ? `0 0 0 2px ${preset.value}55` : 'none',
                    }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom accent color"
                  value={accent === 'custom' ? accentColor : ACCENT_PRESETS.find((p) => p.id === accent)?.value ?? '#58dfd1'}
                  onChange={(event) => appActions.setCustomAccent(event.target.value)}
                  style={{ width: 28, height: 28, border: 'none', background: 'transparent', padding: 0 }}
                />
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>{t('settings.reduceMotion')}</strong>
                <span>{t('settings.reduceMotionDescription')}</span>
              </div>
              <Toggle checked={reduceMotion} onChange={(next) => appActions.setReduceMotion(next)} label="Reduce motion" />
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Background</strong>
                <span>Choose the launcher background style</span>
              </div>
              <div className="settings-row__control">
                <select
                  value={backgroundMode}
                  aria-label="Background mode"
                  onChange={(event) => {
                    appActions.setBackgroundMode(event.target.value as 'default' | 'solid' | 'gradient' | 'video')
                  }}
                >
                  <option value="default">Default</option>
                  <option value="solid">Solid</option>
                  <option value="gradient">Gradient</option>
                  <option value="video">Video</option>
                </select>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Layout density</strong>
                <span>Adjust spacing between UI elements</span>
              </div>
              <div className="settings-row__control">
                <select
                  value={layoutDensity}
                  aria-label="Layout density"
                  onChange={(event) => {
                    appActions.setLayoutDensity(event.target.value as 'comfortable' | 'compact')
                  }}
                >
                  <option value="comfortable">Comfortable</option>
                  <option value="compact">Compact</option>
                </select>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label"><strong>Navigation layout</strong><span>Keep the default top bar or use a compact sidebar.</span></div>
              <div className="segmented" role="group" aria-label="Navigation layout"><button type="button" className={layoutMode === 'top' ? 'active' : undefined} onClick={() => appActions.setLayoutMode('top')}>Top bar</button><button type="button" className={layoutMode === 'sidebar' ? 'active' : undefined} onClick={() => appActions.setLayoutMode('sidebar')}>Sidebar</button></div>
            </div>
            <div className="settings-row settings-row--disabled"><div className="settings-row__label"><strong>Show Top Quick-Instance Bar</strong><span>Temporarily unavailable in this client layout.</span></div><Toggle checked={false} onChange={() => undefined} disabled label="Show Top Quick-Instance Bar" /></div>
            <div className="settings-row settings-row--disabled"><div className="settings-row__label"><strong>Show Featured &amp; Partner Servers</strong><span>Temporarily unavailable in this client layout.</span></div><Toggle checked={false} onChange={() => undefined} disabled label="Show Featured and Partner Servers" /></div>
          </div>
        </section>

        {/* Game */}
        <section className="settings-section">
          <h2 className="settings-section__title">{t('settings.game')}</h2>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Allocated memory</strong>
                <span>{Math.round(ram / 1024)} GB ({ram} MB) · recommended {Math.round(recommendedRam / 1024)} GB</span>
              </div>
              <div className="settings-row__control settings-row__control--wide">
                <input
                  type="range"
                  min={512}
                  max={maxRam}
                  step={512}
                  value={ram}
                  aria-label="Allocated memory"
                  onChange={(e) => setRam(Number(e.target.value))}
                  onMouseUp={() => void saveSettings({ ram_mb: ram })}
                  onKeyUp={() => void saveSettings({ ram_mb: ram })}
                  style={{ width: '140px' }}
                />
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label"><strong>Resolution</strong><span>Window size used when Minecraft starts</span></div>
              <div className="settings-row__control"><input className="settings-inline-input" type="number" min={640} value={settings?.resolution_width ?? 854} onChange={(event) => void saveSettings({ resolution_width: Number(event.target.value) || 854 })} aria-label="Resolution width" /><span>×</span><input className="settings-inline-input" type="number" min={360} value={settings?.resolution_height ?? 480} onChange={(event) => void saveSettings({ resolution_height: Number(event.target.value) || 480 })} aria-label="Resolution height" /></div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label"><strong>Fullscreen</strong><span>Start Minecraft in fullscreen mode</span></div>
              <Toggle checked={settings?.fullscreen ?? false} onChange={(value) => void saveSettings({ fullscreen: value })} label="Fullscreen" />
            </div>
            <div className="settings-row">
              <div className="settings-row__label"><strong>JVM arguments</strong><span>Additional arguments appended to the Java launch</span></div>
              <input className="settings-wide-input" value={settings?.jvm_args ?? ''} onChange={(event) => void saveSettings({ jvm_args: event.target.value })} aria-label="JVM arguments" placeholder="-XX:+UseG1GC" />
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Show snapshots</strong>
                <span>Include snapshot versions when creating instances</span>
              </div>
              <Toggle
                checked={showSnapshots}
                onChange={(v) => { setShowSnapshots(v); void saveSettings({ show_snapshots: v }) }}
                label="Show snapshots"
              />
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Minimize on launch</strong>
                <span>Hide launcher when Minecraft starts</span>
              </div>
              <Toggle
                checked={minimizeOnLaunch}
                onChange={(v) => { setMinimizeOnLaunch(v); void saveSettings({ minimize_on_launch: v }) }}
                label="Minimize on launch"
              />
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Quick Startup</strong>
                <span>Keeps Aqua Client running quietly in the background after closing so it can start faster next time. {quickStartup ? '' : 'Aqua will fully exit when closed.'}</span>
              </div>
              <Toggle
                checked={quickStartup}
                onChange={(value) => { setQuickStartup(value); void saveSettings({ quick_startup: value }) }}
                label="Quick Startup"
              />
            </div>
          </div>
        </section>

        {/* Java */}
        <section className="settings-section">
          <h2 className="settings-section__title">{t('settings.java')}</h2>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Java path</strong>
                <span className="settings-row__path">{javaLabel}</span>
              </div>
              <div className="settings-row__control">
                <span className={`settings-status ${javaLabel !== 'Not detected' ? 'ok' : 'warn'}`}>
                  {javaLabel !== 'Not detected' ? 'Available' : 'Not detected'}
                </span>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Java runtime</strong>
                <span>{javaLabel === 'Not detected' ? 'Find a compatible runtime before launching.' : 'Resolved from your configured or detected runtime.'}</span>
              </div>
              <button type="button" className="settings-btn" disabled={busy === 'java'} onClick={async () => {
                const path = await detectJava()
                toast.pushToast(path ? 'Java runtime ready' : 'Java runtime could not be resolved.', path ? 'success' : 'error')
              }}>
                {busy === 'java' ? 'Resolving...' : javaLabel === 'Not detected' ? 'Detect Java' : 'Refresh Java'}
              </button>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Game directory</strong>
                <span className="settings-row__path">{mcDirLabel}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Advanced */}
        <section className="settings-section">
          <h2 className="settings-section__title">{t('settings.advanced')}</h2>
          <div className="settings-rows">
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Logs</strong>
                <span>View live launch output</span>
              </div>
              <Link to="/logs" className="btn btn-ghost btn-sm">
                <ExternalLink size={13} />
                Open logs
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}


