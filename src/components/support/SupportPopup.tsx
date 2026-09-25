import { useState } from 'react'
import { Coffee, X } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { EXTERNAL_LINKS } from '../../config/externalLinks'

const STORAGE_KEY = 'aqua.support.launch-count'
const SESSION_KEY = 'aqua.support.session-opportunity'
const SUPPORT_CHANCE = 1 / 20

function shouldShowSupport() {
  try {
    // MainLayout mounts this component once per application session. Mark the
    // opportunity before rolling so navigation and rerenders cannot re-roll it.
    if (window.sessionStorage.getItem(SESSION_KEY) === 'used') return false
    window.sessionStorage.setItem(SESSION_KEY, 'used')

    const previous = Number(window.localStorage.getItem(STORAGE_KEY) ?? '0')
    const next = previous + 1
    window.localStorage.setItem(STORAGE_KEY, String(next))
    return Math.random() < SUPPORT_CHANCE
  } catch {
    return false
  }
}

export default function SupportPopup() {
  const [open, setOpen] = useState(shouldShowSupport)

  if (!open) return null

  const donate = async () => {
    try { await openUrl(EXTERNAL_LINKS.kofi) } catch { window.open(EXTERNAL_LINKS.kofi, '_blank', 'noopener,noreferrer') }
    setOpen(false)
  }

  return (
    <aside className="support-popup" role="dialog" aria-labelledby="support-popup-title">
      <button type="button" className="support-popup__close" aria-label="Dismiss support message" onClick={() => setOpen(false)}><X size={15} /></button>
      <div className="support-popup__icon"><Coffee size={17} /></div>
      <div className="support-popup__copy">
        <strong id="support-popup-title">Support Aqua</strong>
        <p>Aqua has taken a lot of time and personal money to build. Donations help keep development and infrastructure running.</p>
        <div className="support-popup__actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Dismiss</button>
          <button type="button" className="btn btn-aqua btn-sm support-popup__donate" onClick={() => void donate()}>Donate</button>
        </div>
      </div>
    </aside>
  )
}
