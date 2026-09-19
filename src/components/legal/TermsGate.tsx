import { useEffect, useMemo, useState } from 'react'
import { Check, FileText, LoaderCircle } from 'lucide-react'
import Button from '../ui/Button'
import { useAquaAuth } from '../../hooks/useAquaAuthHook'
import { TERMS_OF_USE, TERMS_STORAGE_KEY, TERMS_VERSION } from '../../legal/termsOfUse'

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : part)
}

function TermsDocument() {
  const blocks = useMemo(() => TERMS_OF_USE.split('\n'), [])
  return (
    <div className="terms-gate__document">
      {blocks.map((line, index) => {
        if (!line.trim()) return <div className="terms-gate__spacer" key={index} />
        if (line.startsWith('# ')) return <h1 key={index}>{renderInline(line.slice(2))}</h1>
        if (line.startsWith('## ')) return <h2 key={index}>{renderInline(line.slice(3))}</h2>
        if (line.startsWith('### ')) return <h3 key={index}>{renderInline(line.slice(4))}</h3>
        if (line.startsWith('- ')) return <li key={index}>{renderInline(line.slice(2))}</li>
        if (line === '---') return <hr key={index} />
        return <p key={index}>{renderInline(line)}</p>
      })}
    </div>
  )
}

export default function TermsGate() {
  const aqua = useAquaAuth()
  const { acceptTerms, isSignedIn } = aqua
  const [accepted, setAccepted] = useState(() => window.localStorage.getItem(TERMS_STORAGE_KEY) === TERMS_VERSION)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (accepted && isSignedIn) void acceptTerms(TERMS_VERSION).catch(() => undefined)
  }, [acceptTerms, accepted, isSignedIn])

  if (accepted) return null

  const agree = async () => {
    setSaving(true)
    window.localStorage.setItem(TERMS_STORAGE_KEY, TERMS_VERSION)
    setAccepted(true)
    await acceptTerms(TERMS_VERSION).catch(() => undefined)
    setSaving(false)
  }

  return (
    <div className="terms-gate" role="dialog" aria-modal="true" aria-labelledby="terms-gate-title">
      <section className="terms-gate__panel">
        <header className="terms-gate__header">
          <div className="terms-gate__title">
            <span className="terms-gate__icon"><FileText size={18} /></span>
            <div>
              <strong id="terms-gate-title">Terms of Use</strong>
              <span>Review before using Aqua Client</span>
            </div>
          </div>
          <span className="terms-gate__version">Version {TERMS_VERSION}</span>
        </header>
        <TermsDocument />
        <footer className="terms-gate__footer">
          <span>Access to Aqua Client requires your agreement.</span>
          <Button variant="aqua" size="lg" disabled={saving} onClick={() => void agree()}>
            {saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}
            I Agree
          </Button>
        </footer>
      </section>
    </div>
  )
}
