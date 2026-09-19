import { AlertTriangle, X } from 'lucide-react'
import { useMaintenance } from '../../hooks/useMaintenanceHook'
import { useAppStore, appActions } from '../../stores/appStore'

export default function MaintenanceBanner() {
  const { status, restricted } = useMaintenance()
  const accountOpen = useAppStore((state) => state.accountOpen)
  if (!status?.maintenance || !restricted) return null

  return (
    <div className="maintenance-banner" role="status">
      <AlertTriangle size={16} className="maintenance-banner__icon" aria-hidden="true" />
      <div className="maintenance-banner__copy"><strong>Aqua online services are temporarily unavailable.</strong><span>{status.maintenance_message || 'Offline Minecraft play remains available.'}</span></div>
      {accountOpen ? <button type="button" className="maintenance-banner__close" aria-label="Close account panel" onClick={() => appActions.closeOverlays()}><X size={15} /></button> : null}
    </div>
  )
}
