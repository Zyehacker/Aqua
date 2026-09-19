import { useContext } from 'react'
import { MaintenanceContext } from './maintenanceContext'

export function useMaintenance() {
  const context = useContext(MaintenanceContext)
  if (!context) throw new Error('useMaintenance must be used inside MaintenanceProvider')
  return context
}
