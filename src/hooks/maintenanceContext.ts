import { createContext } from 'react'
import type { SystemStatus } from '../services/adminService'

export type MaintenanceContextValue = {
  status: SystemStatus | null
  loading: boolean
  isAdmin: boolean
  restricted: boolean
  refresh: () => Promise<SystemStatus | null>
}

export const MaintenanceContext = createContext<MaintenanceContextValue | null>(null)
