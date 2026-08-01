import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, useEffect } from 'react'
import AppBackground from '../components/layout/AppBackground'
import TopNav from '../components/layout/TopNav'
import { PageSkeleton } from '../components/ui/Skeleton'
import { appActions } from '../stores/appStore'

export default function MainLayout() {
  const location = useLocation()

  useEffect(() => {
    appActions.closeOverlays()
  }, [location.pathname])

  return (
    <div className="app-shell">
      <AppBackground />
      <TopNav />
      <div className="app-shell__body">
        <div className="app-shell__content">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              style={{ minHeight: '100%' }}
            >
              <Suspense fallback={<PageSkeleton />}>
                <Outlet />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
