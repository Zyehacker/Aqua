import { useEffect, useState } from 'react'
import { useAquaAuth } from './useAquaAuthHook'
import { isCurrentUserAdmin } from '../services/adminService'

export function useAdminAccess() {
  const { loading, user, session } = useAquaAuth()
  const [result, setResult] = useState<{ key: string; allowed: boolean } | null>(null)
  const sessionKey = session?.access_token ?? user?.id ?? 'signed-out'

  useEffect(() => {
    let active = true
    if (loading || !user || !session) return () => { active = false }

    void isCurrentUserAdmin()
      .then((next) => { if (active) setResult({ key: sessionKey, allowed: next }) })
      .catch(() => { if (active) setResult({ key: sessionKey, allowed: false }) })

    return () => { active = false }
  }, [loading, sessionKey, session, user])

  const allowed = !user || !session ? false : result?.key === sessionKey ? result.allowed : null
  return { allowed, loading: loading || Boolean(user && session && allowed === null) }
}
