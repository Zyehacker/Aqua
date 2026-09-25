import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMaintenance } from '../../hooks/useMaintenanceHook'

export default function MaintenanceBanner() {
  const { status, restricted } = useMaintenance()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!status?.maintenance || !restricted) return undefined
    const timer = window.setTimeout(() => setVisible(false), 5000)
    return () => window.clearTimeout(timer)
  }, [restricted, status?.maintenance])

  return (
    <AnimatePresence>
      {status?.maintenance && restricted && visible ? (
        <motion.div className="maintenance-banner" role="status" initial={{ opacity: 1 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .35 }}>
          <AlertTriangle size={16} className="maintenance-banner__icon" aria-hidden="true" />
          <div className="maintenance-banner__copy"><strong>Aqua online services are temporarily unavailable.</strong><span>{status.maintenance_message || 'Offline Minecraft play remains available.'}</span></div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
