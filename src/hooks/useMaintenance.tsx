import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSystemStatus, isCurrentUserAdmin, type SystemStatus } from '../services/adminService'
import { supabase } from '../services/supabaseClient'
import { MaintenanceContext } from './maintenanceContext'

const MAINTENANCE_POLL_MS = 30_000

export function MaintenanceProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const refresh = useCallback(async () => {
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

  const restricted = Boolean(status?.maintenance && !isAdmin)
  const value = useMemo(() => ({ status, loading, isAdmin, restricted, refresh }), [isAdmin, loading, refresh, restricted, status])
  return <MaintenanceContext.Provider value={value}>{children}</MaintenanceContext.Provider>
}
