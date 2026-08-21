import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import Toggle from '../../components/ui/Toggle'
import { useToast } from '../../hooks/useToast'
import { appActions, useAppStore, type BackgroundChoice } from '../../stores/appStore'
import { useLauncherData } from '../../hooks/useLauncherData'
import * as tauri from '../../utils/tauri'
import { SUPPORTED_LOCALES, useTranslation } from '../../localization'

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
  const soundVolume = useAppStore((s) => s.soundVolume)
  const density = useAppStore((s) => s.density)
  const background = useAppStore((s) => s.background)
  const { settings, jvm, javaRuntimes, busy, updateSettings, detectJava } = useLauncherData()

  const recommendedRam = jvm?.recommended_ram_mb ?? 2048
  const maxRam = Math.max(settings?.ram_mb ?? 0, recommendedRam, Math.floor((jvm?.memory_mb ?? 4096) * 0.75 / 512) * 512)
  const [ram, setRam] = useState(settings?.ram_mb ?? recommendedRam)
  const [showSnapshots, setShowSnapshots] = useState(settings?.show_snapshots ?? false)
  const [minimizeOnLaunch, setMinimizeOnLaunch] = useState(settings?.minimize_on_launch ?? true)
  const [discordRpc, setDiscordRpc] = useState(false)

  useEffect(() => {
    setDiscordRpc(window.localStorage.getItem('aqua.discord.rpc') === 'true')
  }, [])

  useEffect(() => {
    if (settings) {
      setRam(settings.ram_mb || recommendedRam)
      setShowSnapshots(settings.show_snapshots)
      setMinimizeOnLaunch(settings.minimize_on_launch)
    }
  }, [recommendedRam, settings])

  const saveSettings = useCallback(async (partial: Partial<tauri.LauncherSettings>) => {
    try {
      await updateSettings(partial)
      toast.pushToast('Settings saved', 'success')
    } catch (err) {
      toast.pushToast(err instanceof Error ? err.message : 'Save failed.', 'error')
    } finally { /* settings state is updated by the shared launcher store */ }
  }, [toast, updateSettings])

  const javaLabel = settings?.java_path ?? settings?.java_runtime ?? javaRuntimes[0]?.path ?? 'Not detected'
  const mcDirLabel = settings?.mc_dir ?? 'Default'

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-sections">
        {/* General */}
        <section className="settings-section">
          <h2 className="settings-section__title">General</h2>
          <div className="settings-rows">
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
                <strong>Theme</strong>
              </div>
              <div className="settings-row__control">
                <span className="settings-val">{theme === 'dark' ? 'Dark' : 'Dim'}</span>
                <button
                  type="button"
                  className="settings-btn"
                  onClick={() => {
                    appActions.toggleTheme()
                    toast.pushToast('Theme updated', 'success')
                  }}
                >
                  Switch
                </button>
              </div>
            </div>
            <div className="settings-row settings-row--backgrounds">
              <div className="settings-row__label"><strong>Background</strong><span>Choose from the available Aqua environments</span></div>
              <div className="background-picker">
                {(['background1', 'background2', 'background3', 'background4', 'background5', 'random'] as BackgroundChoice[]).map((choice) => (
                  <button key={choice} type="button" className={background === choice ? 'active' : ''} onClick={() => appActions.setBackground(choice)} aria-label={choice === 'random' ? 'Random background' : `Background ${choice.replace('background', '')}`}>
                    {choice === 'random' ? 'Random' : <img src={`/backgrounds/${choice}.png`} alt="" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Accent color</strong>
                <span>Customize the Aqua highlight across the launcher</span>
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
                <strong>Reduce motion</strong>
                <span>Minimize decorative movement and transitions</span>
              </div>
              <Toggle checked={reduceMotion} onChange={(next) => appActions.setReduceMotion(next)} label="Reduce motion" />
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Interface density</strong>
                <span>Comfortable spacing or tighter compact mode</span>
              </div>
              <div className="settings-row__control">
                <button type="button" className="settings-btn" onClick={() => appActions.setDensity(density === 'comfortable' ? 'compact' : 'comfortable')}>
                  {density === 'comfortable' ? 'Comfortable' : 'Compact'}
                </button>
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>UI sounds</strong>
                <span>Subtle feedback for launch and navigation actions</span>
              </div>
              <Toggle checked={uiSounds} onChange={(next) => appActions.setUiSounds(next)} label="UI sounds" />
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Sound volume</strong>
                <span>{soundVolume.toFixed(2)} · quieter, tasteful feedback</span>
              </div>
              <div className="settings-row__control settings-row__control--wide">
                <input type="range" min={0} max={1} step={0.05} value={soundVolume} onChange={(e) => appActions.setSoundVolume(Number(e.target.value))} style={{ width: 120 }} />
              </div>
            </div>
            <div className="settings-row">
              <div className="settings-row__label">
                <strong>Discord rich presence</strong>
                <span>Show current instance in Discord status</span>
              </div>
              <Toggle checked={discordRpc} onChange={(next) => void (async () => {
                try {
                  if (next) {
                    await tauri.startRichPresence()
                    await tauri.setIdlePresence()
                  }
                  else await tauri.stopRichPresence()
                  window.localStorage.setItem('aqua.discord.rpc', String(next))
                  setDiscordRpc(next)
                } catch (err) {
                  toast.pushToast(err instanceof Error ? err.message : 'Unable to update Discord rich presence.', 'error')
                }
              })()} label="Discord rich presence" />
            </div>
          </div>
        </section>

        {/* Game */}
        <section className="settings-section">
          <h2 className="settings-section__title">Game</h2>
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
          </div>
        </section>

        {/* Java */}
        <section className="settings-section">
          <h2 className="settings-section__title">Java</h2>
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
          <h2 className="settings-section__title">Advanced</h2>
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
