import { useEffect, useState } from 'react'
import { Check, ChevronRight, CircleUserRound, Cpu, Gamepad2, LogIn, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import { useLauncherData } from '../../hooks/useLauncherDataHook'
import { getAccount, microsoftLogin } from '../../utils/tauri'
import { useToast } from '../../hooks/useToast'

const SETUP_KEY = 'aqua.setup.completed.v2'

export default function SetupWizard() {
  const toast = useToast()
  const { settings, instances, javaRuntimes, loading, detectJava } = useLauncherData()
  const [account, setAccount] = useState<{ username: string } | null>(null)
  const [open, setOpen] = useState(() => window.localStorage.getItem(SETUP_KEY) !== 'true')
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading) return
    void getAccount().then((next) => setAccount(next?.username ? { username: next.username } : null)).catch(() => setAccount(null))
  }, [loading])

  if (loading || !open) return null

  const hasJava = Boolean(settings?.java_path || settings?.java_runtime || javaRuntimes.length)
  const finish = () => {
    window.localStorage.setItem(SETUP_KEY, 'true')
    setOpen(false)
  }

  async function login() {
    setBusy(true)
    try {
      const result = await microsoftLogin()
      if (result) {
        setAccount({ username: result.username })
        toast.pushToast('Microsoft account connected', 'success')
      }
    } catch (error) {
      toast.pushToast(error instanceof Error ? error.message : 'Microsoft login failed.', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function setupJava() {
    setBusy(true)
    try {
      const result = await detectJava()
      if (result) toast.pushToast('Java runtime ready', 'success')
    } finally {
      setBusy(false)
    }
  }

  const steps = [
    { label: 'Welcome', icon: Gamepad2 },
    { label: 'Account', icon: CircleUserRound },
    { label: 'Instance', icon: ChevronRight },
    { label: 'Runtime', icon: Cpu },
  ]

  return (
    <div className="setup-wizard__backdrop" role="presentation">
      <section className="setup-wizard" role="dialog" aria-modal="true" aria-labelledby="setup-title">
        <button type="button" className="setup-wizard__close" aria-label="Skip setup" onClick={finish}><X size={16} /></button>
        <div className="setup-wizard__steps" aria-label="Setup progress">
          {steps.map((item, index) => {
            const Icon = item.icon
            return <span key={item.label} className={index <= step ? 'active' : ''}><Icon size={14} />{item.label}</span>
          })}
        </div>
        {step === 0 ? (
          <div className="setup-wizard__panel">
            <p className="eyebrow">First launch</p>
            <h2 id="setup-title">Let&apos;s get Aqua ready.</h2>
            <p>Connect your account, choose an instance, and make sure the right runtime is available.</p>
            <Button variant="aqua" onClick={() => setStep(1)}>Begin setup <ChevronRight size={15} /></Button>
          </div>
        ) : null}
        {step === 1 ? (
          <div className="setup-wizard__panel">
            <p className="eyebrow">Step 1 of 3</p>
            <h2>{account ? `Welcome, ${account.username}.` : 'Connect Microsoft'}</h2>
            <p>Sign in to use your Minecraft profile when you launch. You can continue without it for now.</p>
            <div className="setup-wizard__actions">
              {account ? <span className="setup-wizard__complete"><Check size={15} /> Connected</span> : <Button variant="aqua" onClick={() => void login()} disabled={busy}><LogIn size={15} /> Sign in</Button>}
              <Button variant="ghost" onClick={() => setStep(2)}>Continue <ChevronRight size={15} /></Button>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="setup-wizard__panel">
            <p className="eyebrow">Step 2 of 3</p>
            <h2>{instances.length ? 'Choose your world.' : 'Create your first instance.'}</h2>
            <p>{instances.length ? 'Your instances are ready in the launcher.' : 'Give it a friendly name, then choose Minecraft and a loader.'}</p>
            <div className="setup-wizard__actions">
              <Link className="btn btn-aqua" to="/instances" onClick={() => setOpen(false)}>Open instances <ChevronRight size={15} /></Link>
              <Button variant="ghost" onClick={() => setStep(3)}>Continue <ChevronRight size={15} /></Button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="setup-wizard__panel">
            <p className="eyebrow">Step 3 of 3</p>
            <h2>{hasJava ? 'Runtime ready.' : 'Set up Java.'}</h2>
            <p>{hasJava ? 'A compatible Java runtime is available for your launcher.' : 'Aqua will detect or install the runtime needed by your Minecraft version.'}</p>
            <div className="setup-wizard__actions">
              {hasJava ? <span className="setup-wizard__complete"><Check size={15} /> Ready</span> : <Button variant="aqua" onClick={() => void setupJava()} disabled={busy}><Cpu size={15} /> Set up Java</Button>}
              <Button variant="ghost" onClick={finish}>{instances.length && hasJava ? 'Finish' : 'Finish later'}</Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}