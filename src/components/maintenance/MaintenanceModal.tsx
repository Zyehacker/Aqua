import { AlertTriangle, ShieldOff } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import Button from '../ui/Button'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { useAppStore } from '../../stores/appStore'
import { MOTION } from '../../lib/motion'

export default function MaintenanceModal() {
  const { status, restricted, announcementDismissed, dismissAnnouncement } = useMaintenance()
  const reduceMotion = useAppStore((state) => state.reduceMotion)
  const visible = Boolean(status?.maintenance && restricted && !announcementDismissed)

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          className="maintenance-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="maintenance-modal-title"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.18 }}
        >
          <motion.section
            className="maintenance-modal__card"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : 6, scale: reduceMotion ? 1 : 0.99 }}
            transition={reduceMotion ? { duration: 0.01 } : MOTION.modal}
          >
            <div className="maintenance-modal__icon" aria-hidden="true"><AlertTriangle size={22} /></div>
            <div className="maintenance-modal__copy">
              <span className="maintenance-modal__eyebrow"><ShieldOff size={13} /> Aqua Account and Socials offline</span>
              <h2 id="maintenance-modal-title">Aqua Client servers are under maintenance</h2>
              <p>{status?.maintenance_message}</p>
              <p className="maintenance-modal__availability">Minecraft, Microsoft accounts, offline profiles, content, and the rest of the launcher remain available.</p>
            </div>
            <Button variant="aqua" size="sm" onClick={dismissAnnouncement}>Dismiss</Button>
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
