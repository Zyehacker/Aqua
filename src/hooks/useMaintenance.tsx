import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSystemStatus, isCurrentUserAdmin, type SystemStatus } from '../services/adminService'
import { supabase } from '../services/supabaseClient'
import { AQUA_MAINTENANCE_MESSAGE, AQUA_SOCIAL_MAINTENANCE, MaintenanceContext } from './maintenanceContext'

const MAINTENANCE_POLL_MS = 30_000
const FORCED_STATUS: SystemStatus = {
  maintenance: true,
  maintenance_enabled: true,
  maintenance_message: AQUA_MAINTENANCE_MESSAGE,
  updated_at: '2026-09-25T00:00:00.000Z',
  updated_by: null,
}

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SystemStatus | null>(AQUA_SOCIAL_MAINTENANCE ? FORCED_STATUS : null)
  const [loading, setLoading] = useState(!AQUA_SOCIAL_MAINTENANCE)
  const [isAdmin, setIsAdmin] = useState(false)
  const [announcementDismissed, setAnnouncementDismissed] = useState(false)

  const refresh = useCallback(async () => {
    if (AQUA_SOCIAL_MAINTENANCE) {
      setStatus(FORCED_STATUS)
      setLoading(false)
      setIsAdmin(false)
      return FORCED_STATUS
    }
    try {
      const next = await getSystemStatus()
      setStatus(next)
      if (supabase) {
        const { data: sessionData } = await supabase.auth.getSession()
        setIsAdmin(Boolean(sessionData.session && await isCurrentUserAdmin().catch(() => false)))
      } else setIsAdmin(false)
      return next
    } catch {
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (AQUA_SOCIAL_MAINTENANCE) return undefined
    const initial = window.setTimeout(() => { void refresh() }, 0)
    const poll = window.setInterval(() => { void refresh() }, MAINTENANCE_POLL_MS)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearTimeout(initial)
      window.clearInterval(poll)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const restricted = AQUA_SOCIAL_MAINTENANCE || Boolean(status?.maintenance && !isAdmin)
  const value = useMemo(() => ({ status, loading, isAdmin, restricted, announcementDismissed, dismissAnnouncement: () => setAnnouncementDismissed(true), refresh }), [announcementDismissed, isAdmin, loading, refresh, restricted, status])
  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>
}
