import { createContext } from 'react'
import type { ToastVariant } from '../types'

export type ToastContextValue = {
  pushToast: (message: string, variant?: ToastVariant) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
