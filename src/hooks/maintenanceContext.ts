import { createContext } from 'react'
import type { SystemStatus } from '../services/adminService'

export const AQUA_SOCIAL_MAINTENANCE = true
export const AQUA_MAINTENANCE_MESSAGE = 'Aqua Client servers are currently undergoing maintenance. Aqua Accounts and social features are temporarily unavailable while the servers and social system are being restored. Minecraft, Microsoft accounts, offline profiles, and the rest of the launcher remain available.'

export type MaintenanceContextValue = {
  status: SystemStatus | null
  loading: boolean
  isAdmin: boolean
  restricted: boolean
  announcementDismissed: boolean
  dismissAnnouncement: () => void
  refresh: () => Promise<SystemStatus | null>
}

export const MaintenanceContext = createContext<MaintenanceContextValue | null>(null)
