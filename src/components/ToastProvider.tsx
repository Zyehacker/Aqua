import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react'
import type { ToastVariant } from '../types'
import { ToastContext } from './toastContext'

type Toast = { id: string; message: string; variant: ToastVariant }

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const visibleKeys = useRef(new Set<string>())

  const pushToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const key = `${variant}:${message.trim()}`
    if (visibleKeys.current.has(key)) return
    visibleKeys.current.add(key)
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((current) => [...current, { id, message, variant }])
    window.setTimeout(() => {
      visibleKeys.current.delete(key)
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, 3600)
  }, [])

  const remove = useCallback((id: string) => {
    setToasts((current) => {
      const toast = current.find((item) => item.id === id)
      if (toast) visibleKeys.current.delete(`${toast.variant}:${toast.message.trim()}`)
      return current.filter((item) => item.id !== id)
    })
  }, [])

  const value = useMemo(() => ({ pushToast }), [pushToast])

  function iconFor(v: ToastVariant) {
    switch (v) {
      case 'success':
        return <CheckCircle2 size={18} color="var(--success)" />
      case 'error':
        return <AlertTriangle size={18} color="var(--danger)" />
      default:
        return <Info size={18} color="var(--info)" />
    }
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              className={`toast ${toast.variant}`}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.2 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ display: 'grid', placeItems: 'center' }}>{iconFor(toast.variant)}</div>
              </div>
              <div className="message" style={{ flex: 1 }}>{toast.message}</div>
              <button
                aria-label="Dismiss toast"
                onClick={() => remove(toast.id)}
                className="toast__dismiss"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}
