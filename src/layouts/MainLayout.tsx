import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, useEffect } from 'react'
import { Coffee } from 'lucide-react'
import { openUrl } from '@tauri-apps/plugin-opener'
import TopNav from '../components/layout/TopNav'
import AppBackground from '../components/layout/AppBackground'
import UpdateModal from '../components/updater/UpdateModal'
import { PageSkeleton } from '../components/ui/Skeleton'
import { appActions } from '../stores/appStore'
import { useToast } from '../hooks/useToast'
import { EXTERNAL_LINKS } from '../config/externalLinks'

function DiscordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="18" height="18">
      <path
        fill="currentColor"
        d="M20.32 4.37a16.83 16.83 0 0 0-4.16-1.28c-.17.3-.37.72-.5 1.03a15.52 15.52 0 0 0-8.9 0c-.13-.31-.33-.73-.5-1.03A16.74 16.74 0 0 0 3.68 4.37C1.84 8.02.98 11.52 1.2 15a16.95 16.95 0 0 0 5.06 2.55c.4-.54.76-1.12 1.08-1.72a11.04 11.04 0 0 1-1.7-.8c.14-.1.29-.2.43-.3a12.7 12.7 0 0 0 10.73 0c.14.1.29.2.43.3-.54.31-1.08.58-1.7.8.32.6.68 1.18 1.08 1.72a16.95 16.95 0 0 0 5.06-2.55c.24-3.48-.64-6.98-2.48-10.63ZM9.36 13.05c-.98 0-1.78-.9-1.78-2.02s.8-2.02 1.78-2.02c.98 0 1.8.9 1.8 2.02s-.82 2.02-1.8 2.02Zm5.28 0c-.98 0-1.8-.9-1.8-2.02s.82-2.02 1.8-2.02c.98 0 1.78.9 1.78 2.02s-.8 2.02-1.78 2.02Z"
      />
    </svg>
  )
}

export default function MainLayout() {
  const location = useLocation()
  const toast = useToast()

  useEffect(() => {
    appActions.closeOverlays()
  }, [location.pathname])

  const handleExternalLink = async (url: string) => {
    try {
      await openUrl(url)
    } catch (error) {
      console.error('Unable to open external URL:', error)
      toast.pushToast("Couldn't open the link. Try again or copy the link.", 'error')
    }
  }

  return (
    <div className="app-shell">
      <AppBackground />
      <TopNav />
      <div className="app-shell__body">
        <div className="app-shell__content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              style={{ minHeight: '100%' }}
            >
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="social-float" aria-label="Community links">
        <button
          type="button"
          className="social-float__button social-float__button--discord"
          aria-label="Join the Discord community"
          onClick={() => { void handleExternalLink(EXTERNAL_LINKS.discord) }}
        >
          <DiscordIcon />
        </button>
        <button
          type="button"
          className="social-float__button social-float__button--kofi"
          aria-label="Support on Ko-fi"
          onClick={() => { void handleExternalLink(EXTERNAL_LINKS.kofi) }}
        >
          <Coffee size={18} />
        </button>
      </div>

      <UpdateModal />
    </div>
  )
}
