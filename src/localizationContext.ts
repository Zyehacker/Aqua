import { createContext } from 'react'

type LocalizationContextValue = {
  language: string
  setLanguage: (language: string) => Promise<void>
  t: (key: string) => string
}

export const LocalizationContext = createContext<LocalizationContextValue | null>(null)
