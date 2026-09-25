import { AnimatePresence, motion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { aquaMotion } from '../../lib/motion'

export default function AnimatedDrawer({ open, onClose, children, className = '', backdrop = true }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; backdrop?: boolean }) {
  const persistentPane = className.includes('socials-chat-drawer')
  const visible = open || persistentPane
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  return (
    <AnimatePresence>
      {visible ? <>
        {backdrop ? <motion.div className="motion-drawer-backdrop" aria-hidden="true" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={aquaMotion.micro} /> : null}
        <motion.aside className={className} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={aquaMotion.drawer}>{children ?? <div className="socials-chat-empty"><strong>Select a friend to start chatting</strong><span>Your conversation will appear here.</span></div>}</motion.aside>
      </> : null}
    </AnimatePresence>
  )
}
